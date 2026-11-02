import { Agent } from 'node:http';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { validateEnv } from '../../src/config/env';
import { seed } from '../../src/database/seed';

export interface TestUser {
  id: string;
  email: string;
  token: string;
  walletId: string;
}

/**
 * Boots the real application (same HTTP setup as production) on an ephemeral port,
 * plus helpers for the common flows. Requests go over real sockets so parallel
 * requests are genuinely concurrent.
 */
export class TestApp {
  private counter = 0;
  /**
   * superagent opens a new connection per request by default. Bursts above the OS listen
   * backlog (128 on macOS) are then reset at the TCP layer, which tests nothing about the app.
   * A pooled agent capped at 64 sockets is still > 6x the DB pool, so suites still contend.
   */
  private readonly agent = new Agent({ keepAlive: true, maxSockets: 64 });

  private constructor(
    readonly app: NestExpressApplication,
    readonly db: DataSource,
    readonly baseUrl: string,
  ) {}

  static async create(): Promise<TestApp> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    return new TestApp(app, app.get(DataSource), await app.getUrl());
  }

  async close(): Promise<void> {
    this.agent.destroy();
    await this.app.close();
  }

  http() {
    const client = request(this.baseUrl);
    return {
      get: (path: string) => client.get(path).agent(this.agent),
      post: (path: string) => client.post(path).agent(this.agent),
      delete: (path: string) => client.delete(path).agent(this.agent),
    };
  }

  /** Empties every table and re-applies seed data (SYSTEM wallet + admin). */
  async reset(): Promise<void> {
    await this.db.query(
      `TRUNCATE audit_logs, blacklist_entries, idempotency_keys, ledger_entries,
                transactions, wallets, users RESTART IDENTITY CASCADE`,
    );
    await seed(this.db, validateEnv(process.env));
  }

  uniqueEmail(prefix = 'user'): string {
    return `${prefix}-${process.pid}-${++this.counter}@example.com`;
  }

  async login(email: string, password: string): Promise<string> {
    const res = await this.http().post('/v1/auth/login').send({ email, password }).expect(200);
    return res.body.accessToken as string;
  }

  async adminToken(): Promise<string> {
    return this.login(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
  }

  async createUser(
    overrides: { email?: string; phone?: string; balance?: number } = {},
  ): Promise<TestUser> {
    const email = overrides.email ?? this.uniqueEmail();
    const password = 'a-strong-password';
    const res = await this.http()
      .post('/v1/auth/register')
      .send({ email, password, fullName: 'Test User', phone: overrides.phone })
      .expect(201);
    const user: TestUser = {
      id: res.body.user.id,
      email: res.body.user.email,
      walletId: res.body.wallets[0].id,
      token: await this.login(email, password),
    };
    if (overrides.balance) await this.deposit(user.walletId, overrides.balance);
    return user;
  }

  async deposit(walletId: string, amount: number): Promise<void> {
    await this.http()
      .post(`/v1/admin/wallets/${walletId}/deposits`)
      .set('Authorization', `Bearer ${await this.adminToken()}`)
      .set('Idempotency-Key', `deposit-${walletId}-${++this.counter}`)
      .send({ amount })
      .expect(201);
  }

  transfer(
    from: TestUser,
    destinationWalletId: string,
    amount: number,
    key = `key-${process.pid}-${++this.counter}`,
  ) {
    return this.http()
      .post('/v1/transfers')
      .set('Authorization', `Bearer ${from.token}`)
      .set('Idempotency-Key', key)
      .send({ sourceWalletId: from.walletId, destinationWalletId, amount });
  }

  async balanceOf(walletId: string): Promise<number> {
    const rows: { balance: string }[] = await this.db.query(
      'SELECT balance FROM wallets WHERE id = $1',
      [walletId],
    );
    return Number(rows[0]!.balance);
  }

  /**
   * Ledger invariants:
   * Σ all balances = 0; per wallet Σ credits − Σ debits = balance; two entries per transaction.
   */
  async assertLedgerInvariants(): Promise<void> {
    const [total]: { sum: string }[] = await this.db.query(
      'SELECT COALESCE(SUM(balance), 0) AS sum FROM wallets',
    );
    expect(Number(total!.sum)).toBe(0);

    const drift: unknown[] = await this.db.query(`
      SELECT w.id
      FROM wallets w
      LEFT JOIN ledger_entries e ON e.wallet_id = w.id
      GROUP BY w.id, w.balance
      HAVING w.balance <> COALESCE(SUM(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END), 0)`);
    expect(drift).toEqual([]);

    const unbalanced: unknown[] = await this.db.query(`
      SELECT t.id
      FROM transactions t
      JOIN ledger_entries e ON e.transaction_id = t.id
      GROUP BY t.id
      HAVING COUNT(*) <> 2
         OR SUM(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END) <> 0`);
    expect(unbalanced).toEqual([]);
  }
}
