import { randomUUID } from 'node:crypto';
import { TestApp, type TestUser } from '../helpers/test-app';

describe('Wallets (e2e)', () => {
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
  afterAll(() => t.close());

  const get = (user: TestUser, path: string) =>
    t.http().get(path).set('Authorization', `Bearer ${user.token}`);

  it('lists only the caller’s wallets', async () => {
    const res = await get(alice, '/v1/wallets').expect(200);
    expect(res.body).toEqual([expect.objectContaining({ id: alice.walletId, balance: 10_000 })]);
  });

  it('returns 404, not 403, for another user’s wallet (no ID probing)', async () => {
    for (const path of [
      `/v1/wallets/${bob.walletId}`,
      `/v1/wallets/${bob.walletId}/transactions`,
    ]) {
      const res = await get(alice, path).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    await get(alice, `/v1/wallets/${randomUUID()}`).expect(404);
  });

  it('validates path parameters', async () => {
    const res = await get(alice, '/v1/wallets/not-a-uuid').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('paginates ledger history newest first with a cursor', async () => {
    for (const amount of [100, 200, 300]) await t.transfer(alice, bob.walletId, amount).expect(201);

    const first = await get(alice, `/v1/wallets/${alice.walletId}/transactions?limit=2`).expect(
      200,
    );
    expect(first.body.data.map((e: { amount: number }) => e.amount)).toEqual([300, 200]);
    expect(first.body.data[0]).toMatchObject({
      type: 'TRANSFER',
      direction: 'DEBIT',
      balanceAfter: 9_400,
      counterpartyWalletId: bob.walletId,
    });
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await get(
      alice,
      `/v1/wallets/${alice.walletId}/transactions?limit=2&cursor=${first.body.nextCursor}`,
    ).expect(200);
    // 100 (transfer) then the 10,000 deposit
    expect(second.body.data.map((e: { amount: number }) => e.amount)).toEqual([100, 10_000]);
    expect(second.body.nextCursor).toBeNull();

    const bobHistory = await get(bob, `/v1/wallets/${bob.walletId}/transactions`).expect(200);
    expect(bobHistory.body.data.every((e: { direction: string }) => e.direction === 'CREDIT')).toBe(
      true,
    );
  });

  describe('GET /v1/wallets/resolve (name enquiry)', () => {
    it('finds the recipient wallet by email and returns only a masked name', async () => {
      const res = await get(alice, `/v1/wallets/resolve?email=${bob.email.toUpperCase()}`).expect(
        200,
      );
      expect(res.body).toEqual({ walletId: bob.walletId, currency: 'NGN', accountName: 'Test U.' });
      expect(JSON.stringify(res.body)).not.toContain(bob.email);
    });

    it('returns 404 for unknown emails, the caller themselves and administrators', async () => {
      for (const email of ['ghost@example.com', alice.email, process.env.ADMIN_EMAIL!]) {
        const res = await get(alice, `/v1/wallets/resolve?email=${email}`).expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      }
    });

    it('requires authentication and a valid email', async () => {
      await t.http().get(`/v1/wallets/resolve?email=${bob.email}`).expect(401);
      await get(alice, '/v1/wallets/resolve?email=not-an-email').expect(400);
    });
  });

  it('caps the page size', async () => {
    await get(alice, `/v1/wallets/${alice.walletId}/transactions?limit=101`).expect(400);
  });
});
