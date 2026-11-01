/**
 * Integration + concurrency suites against a real PostgreSQL 18 (Testcontainers).
 * Set TEST_DATABASE_URL to reuse an existing database instead of starting a container.
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts', '<rootDir>/test/concurrency/**/*.e2e-spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
  setupFiles: ['<rootDir>/test/setup/test-env.ts'],
  testTimeout: 60_000,
};
