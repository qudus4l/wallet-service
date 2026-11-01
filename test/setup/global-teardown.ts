import { rmSync } from 'node:fs';
import { DB_URL_FILE } from './paths';

export default async function globalTeardown(): Promise<void> {
  await globalThis.__PG_CONTAINER__?.stop();
  rmSync(DB_URL_FILE, { force: true });
}
