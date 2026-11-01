import { type DataSourceOptions } from 'typeorm';
import { type Env } from '../config/env';
import { ENTITIES } from './entities';
import { InitialSchema1761955200000 } from './migrations/1761955200000-InitialSchema';

export const MIGRATIONS = [InitialSchema1761955200000];

/**
 * Single definition of the database connection, shared by the Nest app,
 * the migration runner and the test harness.
 */
export type DatabaseEnv = Pick<Env, 'DATABASE_URL' | 'DATABASE_SSL' | 'DB_POOL_MAX'>;

export function buildDataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn'],
    extra: {
      max: env.DB_POOL_MAX,
      application_name: 'wallet-service',
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      // Bound every wait so a hot wallet fails fast instead of exhausting the pool.
      statement_timeout: 5_000,
      lock_timeout: 3_000,
      idle_in_transaction_session_timeout: 10_000,
    },
  };
}
