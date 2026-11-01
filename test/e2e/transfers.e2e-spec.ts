import { randomUUID } from 'node:crypto';
import { TestApp, type TestUser } from '../helpers/test-app';

describe('Transfers (e2e)', () => {
  let t: TestApp;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    t = await TestApp.create();
  });
  beforeEach(async () => {
    await t.reset();
    alice = await t.createUser({ balance: 10_000 });
    bob = await t.createUser();
  });
  afterEach(() => t.assertLedgerInvariants());
  afterAll(() => t.close());

  const post = (user: TestUser, body: Record<string, unknown>, key?: string) => {
    const req = t.http().post('/v1/transfers').set('Authorization', `Bearer ${user.token}`);
    return (key === undefined ? req : req.set('Idempotency-Key', key)).send(body);
  };
  const body = (amount: number, extra: Record<string, unknown> = {}) => ({
    sourceWalletId: alice.walletId,
    destinationWalletId: bob.walletId,
    amount,
    ...extra,
  });

  it('moves money and writes a balanced double-entry ledger', async () => {
    const res = await post(alice, body(2_500, { narration: 'Rent' }), randomUUID()).expect(201);
    expect(res.body).toMatchObject({
      type: 'TRANSFER',
      status: 'COMPLETED',
      amount: 2_500,
      currency: 'NGN',
      narration: 'Rent',
    });
    expect(res.headers['idempotent-replayed']).toBeUndefined();
    expect(await t.balanceOf(alice.walletId)).toBe(7_500);
    expect(await t.balanceOf(bob.walletId)).toBe(2_500);

    const entries: { direction: string; balance_after: string }[] = await t.db.query(
      'SELECT direction, balance_after FROM ledger_entries WHERE transaction_id = $1 ORDER BY direction',
      [res.body.id],
    );
    expect(entries).toEqual([
      { direction: 'CREDIT', balance_after: '2500' },
      { direction: 'DEBIT', balance_after: '7500' },
    ]);
  });

  describe('idempotency', () => {
    it('replays the original response for a retried request, moving money once', async () => {
      const key = randomUUID();
      const first = await post(alice, body(1_000), key).expect(201);
      // Same request with keys in a different order: still the same fingerprint.
      const { sourceWalletId, destinationWalletId, amount } = body(1_000);
      const retry = await post(alice, { amount, destinationWalletId, sourceWalletId }, key).expect(
        201,
      );

      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body).toEqual(first.body);
      expect(await t.balanceOf(alice.walletId)).toBe(9_000);
    });

    it('rejects a reused key with a different request', async () => {
      const key = randomUUID();
      await post(alice, body(1_000), key).expect(201);
      const res = await post(alice, body(1_001), key).expect(422);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await t.balanceOf(alice.walletId)).toBe(9_000);
    });

    it('scopes keys per user', async () => {
      const key = randomUUID();
      await post(alice, body(100), key).expect(201);
      await t.deposit(bob.walletId, 500);
      await post(
        bob,
        { sourceWalletId: bob.walletId, destinationWalletId: alice.walletId, amount: 100 },
        key,
      ).expect(201);
    });

    it('requires a well-formed key', async () => {
      const missing = await post(alice, body(1)).expect(400);
      expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      const invalid = await post(alice, body(1), 'short').expect(400);
      expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('does not consume the key when the transfer fails, so a later retry is evaluated fresh', async () => {
      const key = randomUUID();
      const failed = await post(alice, body(50_000), key).expect(422);
      expect(failed.body.error.code).toBe('INSUFFICIENT_FUNDS');

      await t.deposit(alice.walletId, 40_000);
      await post(alice, body(50_000), key).expect(201);
      expect(await t.balanceOf(alice.walletId)).toBe(0);
    });
  });

  describe('business rules', () => {
    it.each([
      ['insufficient funds', () => body(10_001), 422, 'INSUFFICIENT_FUNDS'],
      [
        'self transfer',
        () => body(1, { destinationWalletId: alice.walletId }),
        422,
        'SELF_TRANSFER',
      ],
      ['amount above limit', () => body(1_000_000_001), 422, 'AMOUNT_LIMIT_EXCEEDED'],
      ['zero amount', () => body(0), 400, 'VALIDATION_ERROR'],
      ['fractional amount', () => body(10.5), 400, 'VALIDATION_ERROR'],
      ['amount as string', () => body('100' as unknown as number), 400, 'VALIDATION_ERROR'],
      [
        'unknown destination',
        () => body(1, { destinationWalletId: randomUUID() }),
        404,
        'NOT_FOUND',
      ],
    ])('rejects %s', async (_name, makeBody, status, code) => {
      const res = await post(alice, makeBody(), randomUUID());
      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
      expect(await t.balanceOf(alice.walletId)).toBe(10_000);
    });

    it('returns 404 when the source wallet belongs to someone else (BOLA)', async () => {
      await t.deposit(bob.walletId, 5_000);
      const res = await post(
        alice,
        { sourceWalletId: bob.walletId, destinationWalletId: alice.walletId, amount: 1 },
        randomUUID(),
      ).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(await t.balanceOf(bob.walletId)).toBe(5_000);
    });

    it('refuses to send to or from a SYSTEM wallet', async () => {
      const [system]: { id: string }[] = await t.db.query(
        "SELECT id FROM wallets WHERE type = 'SYSTEM'",
      );
      await post(alice, body(1, { destinationWalletId: system!.id }), randomUUID()).expect(404);
      await post(
        alice,
        { sourceWalletId: system!.id, destinationWalletId: bob.walletId, amount: 1 },
        randomUUID(),
      ).expect(404);
    });

    it('rejects cross-currency transfers', async () => {
      await t.db.query("INSERT INTO wallets (type, currency) VALUES ('SYSTEM', 'USD')");
      const [usd]: { id: string }[] = await t.db.query(
        "INSERT INTO wallets (user_id, currency) VALUES ($1, 'USD') RETURNING id",
        [bob.id],
      );
      const res = await post(alice, body(1, { destinationWalletId: usd!.id }), randomUUID()).expect(
        422,
      );
      expect(res.body.error.code).toBe('CURRENCY_MISMATCH');
    });
  });

  describe('account status and blacklist', () => {
    const blacklist = async (email: string) =>
      t
        .http()
        .post('/v1/admin/blacklist')
        .set('Authorization', `Bearer ${await t.adminToken()}`)
        .send({ type: 'EMAIL', value: email, reason: 'test' })
        .expect(201);

    it('blocks transfers to a blocked recipient', async () => {
      await t.db.query("UPDATE users SET status = 'BLOCKED' WHERE id = $1", [bob.id]);
      const res = await post(alice, body(100), randomUUID()).expect(422);
      expect(res.body.error.code).toBe('RECIPIENT_UNAVAILABLE');
    });

    it('rejects a blocked sender immediately, even with a valid token', async () => {
      await t.db.query("UPDATE users SET status = 'BLOCKED' WHERE id = $1", [alice.id]);
      const res = await post(alice, body(100), randomUUID()).expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_BLOCKED');
    });

    it('rejects a blacklisted sender', async () => {
      await blacklist(alice.email);
      const res = await post(alice, body(100), randomUUID()).expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_RESTRICTED');
    });

    it('rejects a blacklisted recipient without disclosing why', async () => {
      await blacklist(bob.email);
      const res = await post(alice, body(100), randomUUID()).expect(422);
      expect(res.body.error).toEqual({
        code: 'RECIPIENT_UNAVAILABLE',
        message: 'The destination wallet cannot receive funds',
      });
    });

    afterEach(async () => {
      expect(await t.balanceOf(alice.walletId)).toBe(10_000);
    });
  });

  describe('GET /v1/transfers/:id', () => {
    it('is visible to sender and recipient only', async () => {
      const created = await post(alice, body(10), randomUUID()).expect(201);
      const eve = await t.createUser();
      for (const user of [alice, bob]) {
        await t
          .http()
          .get(`/v1/transfers/${created.body.id}`)
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200);
      }
      await t
        .http()
        .get(`/v1/transfers/${created.body.id}`)
        .set('Authorization', `Bearer ${eve.token}`)
        .expect(404);
    });
  });
});
