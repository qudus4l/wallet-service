import { validateEnv } from '../../src/config/env';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies safe defaults', () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_POOL_MAX: 10,
      JWT_TTL_SECONDS: 900,
      DEFAULT_CURRENCY: 'NGN',
      SWAGGER_ENABLED: true,
      RATE_LIMIT_ENABLED: true,
      CORS_ORIGINS: [],
    });
  });

  it('parses booleans strictly and lists from CSV', () => {
    const env = validateEnv({
      ...base,
      SWAGGER_ENABLED: 'false',
      CORS_ORIGINS: 'https://a.com, https://b.com',
    });
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
    expect(() => validateEnv({ ...base, SWAGGER_ENABLED: 'yes' })).toThrow(/SWAGGER_ENABLED/);
  });

  it('rejects a short JWT secret and a non-postgres URL', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://x/y' })).toThrow(/DATABASE_URL/);
  });

  it('requires ADMIN_EMAIL and ADMIN_PASSWORD together', () => {
    expect(() => validateEnv({ ...base, ADMIN_EMAIL: 'a@b.com' })).toThrow(/ADMIN_PASSWORD/);
    expect(
      validateEnv({ ...base, ADMIN_EMAIL: 'a@b.com', ADMIN_PASSWORD: 'a-long-password' })
        .ADMIN_EMAIL,
    ).toBe('a@b.com');
  });

  it('rejects an invalid currency code', () => {
    expect(() => validateEnv({ ...base, DEFAULT_CURRENCY: 'naira' })).toThrow(/DEFAULT_CURRENCY/);
  });
});
