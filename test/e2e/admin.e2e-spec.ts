import { randomUUID } from 'node:crypto';
import { TestApp, type TestUser } from '../helpers/test-app';

describe('Admin (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let user: TestUser;

  beforeAll(async () => {
    t = await TestApp.create();
  });
  beforeEach(async () => {
    await t.reset();
    admin = await t.adminToken();
    user = await t.createUser();
  });
  afterAll(() => t.close());

  const as = (token: string) => ({
    get: (path: string) => t.http().get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body: object = {}) =>
      t.http().post(path).set('Authorization', `Bearer ${token}`).send(body),
    delete: (path: string) => t.http().delete(path).set('Authorization', `Bearer ${token}`),
  });

  it('is forbidden to regular users', async () => {
    for (const res of [
      await as(user.token).get('/v1/admin/users'),
      await as(user.token).post(`/v1/admin/users/${user.id}/block`, { reason: 'x' }),
      await as(user.token).post('/v1/admin/blacklist', {
        type: 'EMAIL',
        value: 'a@b.c',
        reason: 'x',
      }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  describe('block / unblock', () => {
    it('blocks immediately (existing token rejected), unblocks, and audits both', async () => {
      await as(user.token).get('/v1/users/me').expect(200);

      const blocked = await as(admin)
        .post(`/v1/admin/users/${user.id}/block`, { reason: 'Suspicious activity' })
        .expect(200);
      expect(blocked.body.status).toBe('BLOCKED');

      const rejected = await as(user.token).get('/v1/users/me').expect(403);
      expect(rejected.body.error.code).toBe('ACCOUNT_BLOCKED');

      await as(admin).post(`/v1/admin/users/${user.id}/unblock`).expect(200);
      await as(user.token).get('/v1/users/me').expect(200);

      const audit = await as(admin).get('/v1/admin/audit-logs').expect(200);
      expect(audit.body.data.map((e: { action: string }) => e.action)).toEqual([
        'USER_UNBLOCKED',
        'USER_BLOCKED',
      ]);
      expect(audit.body.data[1]).toMatchObject({
        targetId: user.id,
        reason: 'Suspicious activity',
        actorName: 'Administrator',
        targetName: 'Test User',
      });
      expect(audit.body.total).toBe(2);
    });

    it('is idempotent and does not duplicate audit entries', async () => {
      await as(admin).post(`/v1/admin/users/${user.id}/block`, { reason: 'x' }).expect(200);
      await as(admin).post(`/v1/admin/users/${user.id}/block`, { reason: 'x' }).expect(200);
      const audit = await as(admin).get('/v1/admin/audit-logs').expect(200);
      expect(audit.body.data).toHaveLength(1);
    });

    it('requires a reason, and refuses to let an admin block themselves', async () => {
      await as(admin).post(`/v1/admin/users/${user.id}/block`).expect(400);
      const [self]: { id: string }[] = await t.db.query(
        "SELECT id FROM users WHERE role = 'ADMIN'",
      );
      const res = await as(admin)
        .post(`/v1/admin/users/${self!.id}/block`, { reason: 'x' })
        .expect(422);
      expect(res.body.error.code).toBe('INVALID_OPERATION');
    });

    it('returns 404 for unknown users', async () => {
      await as(admin).post(`/v1/admin/users/${randomUUID()}/block`, { reason: 'x' }).expect(404);
    });

    it('finds users by email, with their wallets', async () => {
      const res = await as(admin)
        .get(`/v1/admin/users?email=${user.email.toUpperCase()}`)
        .expect(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({
          id: user.id,
          wallets: [expect.objectContaining({ id: user.walletId })],
        }),
      ]);
      expect(res.body.total).toBe(1);

      const all = await as(admin).get('/v1/admin/users?limit=1').expect(200);
      expect(all.body.total).toBe(2); // the user and the seeded admin
    });

    it('names the wallet owner on deposit audit entries', async () => {
      await t.deposit(user.walletId, 500);
      const audit = await as(admin).get('/v1/admin/audit-logs').expect(200);
      expect(audit.body.data[0]).toMatchObject({
        action: 'WALLET_DEPOSIT',
        targetId: user.walletId,
        targetName: 'Test User',
        actorName: 'Administrator',
      });
    });
  });

  describe('blacklist', () => {
    it('adds (normalised), checks, lists and removes entries, with audit', async () => {
      const created = await as(admin)
        .post('/v1/admin/blacklist', { type: 'EMAIL', value: ' Bad@Actor.com ', reason: 'Fraud' })
        .expect(201);
      expect(created.body).toMatchObject({ type: 'EMAIL', value: 'bad@actor.com' });

      const dup = await as(admin)
        .post('/v1/admin/blacklist', { type: 'EMAIL', value: 'BAD@actor.com', reason: 'again' })
        .expect(409);
      expect(dup.body.error.code).toBe('BLACKLIST_ENTRY_EXISTS');

      const hit = await as(admin)
        .get('/v1/admin/blacklist/check?type=EMAIL&value=bad@ACTOR.com')
        .expect(200);
      expect(hit.body).toMatchObject({ listed: true, entry: { id: created.body.id } });

      const list = await as(admin).get('/v1/admin/blacklist').expect(200);
      expect(list.body.data).toHaveLength(1);

      await as(admin).delete(`/v1/admin/blacklist/${created.body.id}`).expect(204);
      const miss = await as(admin)
        .get('/v1/admin/blacklist/check?type=EMAIL&value=bad@actor.com')
        .expect(200);
      expect(miss.body).toEqual({ listed: false, entry: null });
      await as(admin).delete(`/v1/admin/blacklist/${created.body.id}`).expect(404);

      const audit = await as(admin).get('/v1/admin/audit-logs').expect(200);
      expect(audit.body.data.map((e: { action: string }) => e.action)).toEqual([
        'BLACKLIST_REMOVED',
        'BLACKLIST_ADDED',
      ]);
      expect(audit.body.data[1]).toMatchObject({ targetName: 'bad@actor.com' });
    });

    it('reports the total across pages', async () => {
      for (const value of ['a@x.com', 'b@x.com', 'c@x.com']) {
        await as(admin).post('/v1/admin/blacklist', { type: 'EMAIL', value, reason: 'x' });
      }
      const page = await as(admin).get('/v1/admin/blacklist?limit=2').expect(200);
      expect(page.body).toMatchObject({ total: 3, nextCursor: expect.any(String) });
      expect(page.body.data).toHaveLength(2);
    });

    it('validates phone entries as E.164', async () => {
      await as(admin)
        .post('/v1/admin/blacklist', { type: 'PHONE', value: '0801234', reason: 'x' })
        .expect(400);
      await as(admin)
        .post('/v1/admin/blacklist', { type: 'PHONE', value: '+234 801 234 5678', reason: 'x' })
        .expect(201);
    });
  });

  describe('deposits', () => {
    const deposit = (walletId: string, amount: number, key: string) =>
      t
        .http()
        .post(`/v1/admin/wallets/${walletId}/deposits`)
        .set('Authorization', `Bearer ${admin}`)
        .set('Idempotency-Key', key)
        .send({ amount });

    it('shows the funding note as the reason in the audit log', async () => {
      await t
        .http()
        .post(`/v1/admin/wallets/${user.walletId}/deposits`)
        .set('Authorization', `Bearer ${admin}`)
        .set('Idempotency-Key', randomUUID())
        .send({ amount: 100, narration: 'Wallet top-up' })
        .expect(201);
      let audit = await as(admin).get('/v1/admin/audit-logs').expect(200);
      expect(audit.body.data[0]).toMatchObject({
        action: 'WALLET_DEPOSIT',
        reason: 'Wallet top-up',
      });

      await deposit(user.walletId, 100, randomUUID()).expect(201);
      audit = await as(admin).get('/v1/admin/audit-logs').expect(200);
      expect(audit.body.data[0]).toMatchObject({ action: 'WALLET_DEPOSIT', reason: null });
    });

    it('credits the wallet from the SYSTEM wallet, once per key', async () => {
      const key = randomUUID();
      await deposit(user.walletId, 5_000, key).expect(201);
      const replay = await deposit(user.walletId, 5_000, key).expect(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(await t.balanceOf(user.walletId)).toBe(5_000);

      const [system]: { balance: string }[] = await t.db.query(
        "SELECT balance FROM wallets WHERE type = 'SYSTEM'",
      );
      expect(Number(system!.balance)).toBe(-5_000);
      await t.assertLedgerInvariants();
    });

    it('treats the same key on a different wallet as a different request', async () => {
      const other = await t.createUser();
      const key = randomUUID();
      await deposit(user.walletId, 100, key).expect(201);
      const res = await deposit(other.walletId, 100, key).expect(422);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('refuses deposits to blocked users and unknown wallets', async () => {
      await t.db.query("UPDATE users SET status = 'BLOCKED' WHERE id = $1", [user.id]);
      const blocked = await deposit(user.walletId, 100, randomUUID()).expect(422);
      expect(blocked.body.error.code).toBe('RECIPIENT_UNAVAILABLE');
      await deposit(randomUUID(), 100, randomUUID()).expect(404);
    });

    it('is forbidden to regular users', async () => {
      await t
        .http()
        .post(`/v1/admin/wallets/${user.walletId}/deposits`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ amount: 100 })
        .expect(403);
    });
  });
});
