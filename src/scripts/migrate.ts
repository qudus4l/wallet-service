import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env';
import { buildDataSourceOptions } from '../database/data-source-options';
import { seed } from '../database/seed';

/**
 * Runs pending migrations, then idempotent seed data. Invoked by the start command
 * because Render's free tier has no pre-deploy step (ADR-0007).
 */
async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const dataSource = new DataSource(buildDataSourceOptions(env));
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'Migrations complete',
        applied: applied.map((m) => m.name),
      }),
    );
    await seed(dataSource, env);
    console.log(JSON.stringify({ level: 'info', msg: 'Seed complete' }));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ level: 'fatal', msg: 'Migration failed', err: String(error) }));
  process.exit(1);
});
