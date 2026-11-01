import { type DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { type Env } from '../config/env';
import { normalizeEmail } from '../common/identity';
import { User, Wallet } from './entities';

/**
 * Idempotent bootstrap data, safe to run on every start:
 * the SYSTEM wallet for the default currency and (if configured) the first admin.
 * An existing admin's password is never overwritten.
 */
export async function seed(dataSource: DataSource, env: Env): Promise<void> {
  await dataSource
    .createQueryBuilder()
    .insert()
    .into(Wallet)
    .values({ type: 'SYSTEM', userId: null, currency: env.DEFAULT_CURRENCY })
    .orIgnore()
    .execute();

  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const passwordHash = await argon2.hash(env.ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await dataSource
      .createQueryBuilder()
      .insert()
      .into(User)
      .values({
        email: normalizeEmail(env.ADMIN_EMAIL),
        fullName: 'Administrator',
        passwordHash,
        role: 'ADMIN',
      })
      .orIgnore()
      .execute();
  }
}
