import { JwtService } from '@nestjs/jwt';
import { TestApp } from '../helpers/test-app';

describe('Auth (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await TestApp.create();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  const register = (body: Record<string, unknown>) => t.http().post('/v1/auth/register').send(body);
  const valid = () => ({ email: t.uniqueEmail(), password: 'a-strong-password', fullName: 'Ada' });

  describe('POST /v1/auth/register', () => {
    it('creates a user with a default-currency wallet and normalised identity', async () => {
      const res = await register({
        email: '  Ada@Example.COM ',
        password: 'a-strong-password',
        fullName: ' Ada Lovelace ',
        phone: '+234 801 234 5678',
      }).expect(201);

      expect(res.body.user).toMatchObject({
        email: 'ada@example.com',
        phone: '+2348012345678',
        fullName: 'Ada Lovelace',
        role: 'USER',
        status: 'ACTIVE',
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.wallets).toEqual([expect.objectContaining({ currency: 'NGN', balance: 0 })]);
    });

    it('stores the password as an argon2id hash', async () => {
      const body = valid();
      await register(body).expect(201);
      const [row]: { password_hash: string }[] = await t.db.query(
        'SELECT password_hash FROM users WHERE email = $1',
        [body.email],
      );
      expect(row!.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    });

    it('rejects a duplicate email or phone with one generic conflict', async () => {
      const body = { ...valid(), phone: '+2348000000001' };
      await register(body).expect(201);

      const sameEmail = await register({
        ...body,
        email: body.email.toUpperCase(),
        phone: undefined,
      });
      const samePhone = await register({ ...valid(), phone: body.phone });
      for (const res of [sameEmail, samePhone]) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('ACCOUNT_ALREADY_EXISTS');
      }
    });

    it('rejects invalid input with field-level details, including unknown properties', async () => {
      const res = await register({ email: 'nope', password: 'short', role: 'ADMIN' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const fields = (res.body.error.details.fields as { field: string }[]).map((f) => f.field);
      expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'fullName', 'role']));
    });

    it('rejects blacklisted emails and phones without revealing the reason', async () => {
      const admin = await t.adminToken();
      const email = t.uniqueEmail('fraud');
      await t
        .http()
        .post('/v1/admin/blacklist')
        .set('Authorization', `Bearer ${admin}`)
        .send({ type: 'EMAIL', value: email.toUpperCase(), reason: 'Chargeback fraud ring' })
        .expect(201);
      await t
        .http()
        .post('/v1/admin/blacklist')
        .set('Authorization', `Bearer ${admin}`)
        .send({ type: 'PHONE', value: '+234 800 000 0099', reason: 'Sanctions match' })
        .expect(201);

      const byEmail = await register({ ...valid(), email }).expect(403);
      const byPhone = await register({ ...valid(), phone: '+2348000000099' }).expect(403);
      for (const res of [byEmail, byPhone]) {
        expect(res.body.error.code).toBe('ACCOUNT_RESTRICTED');
        expect(JSON.stringify(res.body)).not.toMatch(/fraud|sanction/i);
      }
      const [count]: { n: string }[] = await t.db.query(
        "SELECT count(*) AS n FROM users WHERE role = 'USER'",
      );
      expect(Number(count!.n)).toBe(0);
    });
  });

  describe('POST /v1/auth/login', () => {
    it('returns a short-lived bearer token', async () => {
      const body = valid();
      await register(body).expect(201);
      const res = await t
        .http()
        .post('/v1/auth/login')
        .send({ email: body.email.toUpperCase(), password: body.password })
        .expect(200);
      expect(res.body).toEqual({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 900,
      });
    });

    it('returns the same generic error for a wrong password and an unknown email', async () => {
      const body = valid();
      await register(body).expect(201);
      const wrong = await t
        .http()
        .post('/v1/auth/login')
        .send({ email: body.email, password: 'wrong-password' });
      const unknown = await t
        .http()
        .post('/v1/auth/login')
        .send({ email: 'ghost@example.com', password: 'whatever-123' });
      for (const res of [wrong, unknown]) {
        expect(res.status).toBe(401);
        expect(res.body.error).toEqual({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        });
      }
    });

    it('refuses to log in a blocked user', async () => {
      const user = await t.createUser();
      await t.db.query("UPDATE users SET status = 'BLOCKED' WHERE id = $1", [user.id]);
      const res = await t
        .http()
        .post('/v1/auth/login')
        .send({ email: user.email, password: 'a-strong-password' })
        .expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_BLOCKED');
    });
  });

  describe('authentication guard', () => {
    it('denies protected routes without a token', async () => {
      const res = await t.http().get('/v1/users/me').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects tampered, foreign-signed and expired tokens', async () => {
      const user = await t.createUser();
      const appJwt = t.app.get(JwtService);
      const tokens = [
        `${user.token.slice(0, -2)}xx`,
        new JwtService({ secret: 'a-completely-different-secret-value!!' }).sign(
          { sub: user.id, role: 'USER' },
          { issuer: 'wallet-service', audience: 'wallet-service-api' },
        ),
        appJwt.sign({ sub: user.id, role: 'USER' }, { expiresIn: -10 }),
      ];
      for (const token of tokens) {
        const res = await t.http().get('/v1/users/me').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(401);
      }
    });

    it('takes the role from the database, not from the token', async () => {
      const user = await t.createUser();
      const forged = t.app.get(JwtService).sign({ sub: user.id, role: 'ADMIN' });
      const res = await t.http().get('/v1/admin/users').set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns the caller profile', async () => {
      const user = await t.createUser();
      const res = await t
        .http()
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
      expect(res.body).toMatchObject({ id: user.id, email: user.email });
    });
  });
});
