import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WEB_DIST } from '../../src/web-app';
import { TestApp } from '../helpers/test-app';

const webBuilt = existsSync(join(WEB_DIST, 'index.html'));

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

  // Runs when the frontend is built (always in CI, which builds web/ before this suite).
  (webBuilt ? describe : describe.skip)('frontend served from the same origin', () => {
    it('serves the app for page routes, including client-side ones', async () => {
      for (const path of ['/', '/login', '/admin/live-tests']) {
        const res = await t.http().get(path).set('Accept', 'text/html').expect(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('<div id="root">');
      }
    });

    it('never shadows the API: /v1 paths stay JSON even for browsers', async () => {
      const res = await t.http().get('/v1/nope').set('Accept', 'text/html').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('keeps JSON 404s for non-browser clients', async () => {
      const res = await t.http().get('/some/page').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  it('sets security headers', async () => {
    const res = await t.http().get('/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
