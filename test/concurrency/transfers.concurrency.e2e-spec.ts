import { randomUUID } from 'node:crypto';
import { TestApp, type TestUser } from '../helpers/test-app';

/**
 * DESIGN §8 must-pass concurrency tests. Requests are fired truly in parallel over
 * real sockets against real PostgreSQL; nothing is mocked.
 */
describe('Transfers under concurrency', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await TestApp.create();
  });
  beforeEach(() => t.reset());
  afterEach(() => t.assertLedgerInvariants());
  afterAll(() => t.close());

  const statusCounts = (responses: { status: number }[]) =>
    responses.reduce<Record<number, number>>((acc, { status }) => {
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

  it('never double-spends: 100 parallel transfers of 1 from a balance of 50', async () => {
    const alice = await t.createUser({ balance: 50 });
    const bob = await t.createUser();

    const responses = await Promise.all(
      Array.from({ length: 100 }, () => t.transfer(alice, bob.walletId, 1)),
    );

    expect(statusCounts(responses)).toEqual({ 201: 50, 422: 50 });
    for (const res of responses.filter((r) => r.status === 422)) {
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    }
    expect(await t.balanceOf(alice.walletId)).toBe(0);
    expect(await t.balanceOf(bob.walletId)).toBe(50);
  });

  it('does not deadlock on opposite-direction transfers (50× A→B and 50× B→A)', async () => {
    const a = await t.createUser({ balance: 1_000 });
    const b = await t.createUser({ balance: 1_000 });

    const responses = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        i % 2 === 0 ? t.transfer(a, b.walletId, 7) : t.transfer(b, a.walletId, 3),
      ),
    );

    expect(statusCounts(responses)).toEqual({ 201: 100 });
    expect(await t.balanceOf(a.walletId)).toBe(1_000 - 50 * 7 + 50 * 3);
    expect(await t.balanceOf(b.walletId)).toBe(1_000 + 50 * 7 - 50 * 3);
  });

  it('executes once when the same Idempotency-Key is fired 20× in parallel', async () => {
    const alice = await t.createUser({ balance: 1_000 });
    const bob = await t.createUser();
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => t.transfer(alice, bob.walletId, 100, key)),
    );

    expect(statusCounts(responses)).toEqual({ 201: 20 });
    const ids = new Set(responses.map((r) => r.body.id as string));
    expect(ids.size).toBe(1);
    for (const res of responses) expect(res.body).toEqual(responses[0]!.body);
    expect(responses.filter((r) => r.headers['idempotent-replayed'] === 'true')).toHaveLength(19);

    const [rows]: { n: string }[] = await t.db.query(
      'SELECT count(*) AS n FROM transactions WHERE idempotency_key = $1',
      [key],
    );
    expect(Number(rows!.n)).toBe(1);
    expect(await t.balanceOf(alice.walletId)).toBe(900);
  });

  it('rejects a concurrent duplicate key carrying a different body', async () => {
    const alice = await t.createUser({ balance: 1_000 });
    const bob = await t.createUser();
    const key = randomUUID();

    const responses = await Promise.all([
      t.transfer(alice, bob.walletId, 100, key),
      t.transfer(alice, bob.walletId, 200, key),
    ]);

    expect(statusCounts(responses)).toEqual({ 201: 1, 422: 1 });
    expect(responses.find((r) => r.status === 422)!.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const sent = responses.find((r) => r.status === 201)!.body.amount as number;
    expect(await t.balanceOf(alice.walletId)).toBe(1_000 - sent);
  });

  it('conserves money across a many-wallet random transfer storm with concurrent deposits', async () => {
    const users: TestUser[] = [];
    for (let i = 0; i < 6; i++) users.push(await t.createUser({ balance: 500 }));
    const admin = await t.adminToken();

    const requests = Array.from({ length: 150 }, (_, i) => {
      if (i % 10 === 0) {
        return t
          .http()
          .post(`/v1/admin/wallets/${users[i % users.length]!.walletId}/deposits`)
          .set('Authorization', `Bearer ${admin}`)
          .set('Idempotency-Key', randomUUID())
          .send({ amount: 50 });
      }
      const from = users[i % users.length]!;
      const to = users[(i * 7 + 3) % users.length]!;
      return t.transfer(
        from,
        (to === from ? users[(i + 1) % users.length]! : to).walletId,
        (i % 40) + 1,
      );
    });
    const responses = await Promise.all(requests);

    // Only expected outcomes: success or a clean business rejection. No 5xx, no deadlocks.
    for (const res of responses) {
      expect([201, 422]).toContain(res.status);
      if (res.status === 422) expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    }
    const [sum]: { total: string }[] = await t.db.query(
      "SELECT SUM(balance) AS total FROM wallets WHERE type = 'USER'",
    );
    expect(Number(sum!.total)).toBe(6 * 500 + 15 * 50);
    const [neg]: { negative: string }[] = await t.db.query(
      "SELECT count(*) AS negative FROM wallets WHERE type = 'USER' AND balance < 0",
    );
    expect(Number(neg!.negative)).toBe(0);
  });

  it('enforces non-negative balances in the database itself', async () => {
    const alice = await t.createUser({ balance: 10 });
    await expect(
      t.db.query('UPDATE wallets SET balance = -1 WHERE id = $1', [alice.walletId]),
    ).rejects.toThrow(/wallets_balance_non_negative/);
  });
});
