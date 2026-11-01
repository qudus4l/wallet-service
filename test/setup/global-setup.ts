import { writeFileSync } from 'node:fs';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/database/data-source-options';
import { DB_URL_FILE } from './paths';

declare global {
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

/** Same major version as production (Render PostgreSQL 18). */
const POSTGRES_IMAGE = 'postgres:18.6-alpine3.24';

export default async function globalSetup(): Promise<void> {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    globalThis.__PG_CONTAINER__ = container;
    url = container.getConnectionUri();
  }
  writeFileSync(DB_URL_FILE, url);

  // Apply migrations exactly as production does; this also proves they run on an empty DB.
  const dataSource = new DataSource(
    buildDataSourceOptions({ DATABASE_URL: url, DATABASE_SSL: false, DB_POOL_MAX: 2 }),
  );
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  await dataSource.destroy();
}
