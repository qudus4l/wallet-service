import { TestApp } from '../helpers/test-app';

describe('Platform (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await TestApp.create();
  });
  afterAll(() => t.close());

  it('serves liveness and readiness without auth', async () => {
    await t.http().get('/health/live').expect(200, { status: 'ok' });
    const ready = await t.http().get('/health/ready').expect(200);
    expect(ready.body.details.database.status).toBe('up');
  });

  it('returns the error envelope with a request id for unknown routes', async () => {
    const res = await t.http().get('/does-not-exist').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
      requestId: res.headers['x-request-id'],
    });
  });

  it('honours a well-formed upstream request id and rejects malformed ones', async () => {
    const ok = await t.http().get('/health/live').set('X-Request-Id', 'trace-123');
    expect(ok.headers['x-request-id']).toBe('trace-123');
    const bad = await t.http().get('/health/live').set('X-Request-Id', 'bad id with spaces');
    expect(bad.headers['x-request-id']).not.toBe('bad id with spaces');
  });

  it('rejects malformed JSON and oversized bodies', async () => {
    const malformed = await t
      .http()
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');

    const large = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'a@b.com', password: 'x'.repeat(20_000) })
      .expect(413);
    expect(large.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers', async () => {
    const res = await t.http().get('/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
