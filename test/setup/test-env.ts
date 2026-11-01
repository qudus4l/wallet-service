/** Environment for the app under test. Loaded before any test file imports AppModule. */
import { readFileSync } from 'node:fs';
import { DB_URL_FILE } from './paths';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: readFileSync(DB_URL_FILE, 'utf8').trim(),
  JWT_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
  JWT_ISSUER: 'wallet-service',
  JWT_AUDIENCE: 'wallet-service-api',
  ADMIN_EMAIL: 'admin@test.local',
  ADMIN_PASSWORD: 'admin-password-for-tests',
  DEFAULT_CURRENCY: 'NGN',
  MAX_TRANSACTION_AMOUNT: '1000000000',
  LOG_LEVEL: 'silent',
  SWAGGER_ENABLED: 'false',
  RATE_LIMIT_ENABLED: 'false',
  DB_POOL_MAX: '10',
});
