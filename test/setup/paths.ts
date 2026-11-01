import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Hand-off from global setup (separate context) to test workers. */
export const DB_URL_FILE = join(tmpdir(), 'wallet-service-test-db-url');
