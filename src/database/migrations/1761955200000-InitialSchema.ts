import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Initial schema. Invariants live in the database, not only in code:
 * non-negative user balances, one SYSTEM wallet per currency, positive amounts,
 * and a permanent (initiated_by, idempotency_key) uniqueness backstop.
 * Requires PostgreSQL 18+ for native uuidv7().
 */
export class InitialSchema1761955200000 implements MigrationInterface {
  name = 'InitialSchema1761955200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id            uuid PRIMARY KEY DEFAULT uuidv7(),
        email         text NOT NULL,
        phone         text,
        full_name     text NOT NULL,
        password_hash text NOT NULL,
        role          text NOT NULL DEFAULT 'USER'   CHECK (role IN ('USER', 'ADMIN')),
        status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED')),
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_email_key UNIQUE (email),
        CONSTRAINT users_phone_key UNIQUE (phone),
        CONSTRAINT users_email_normalised CHECK (email = lower(btrim(email)))
      )`);

    await queryRunner.query(`
      CREATE TABLE wallets (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        user_id    uuid REFERENCES users (id),
        type       text NOT NULL DEFAULT 'USER' CHECK (type IN ('USER', 'SYSTEM')),
        currency   text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        balance    bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT wallets_user_currency_key UNIQUE (user_id, currency),
        CONSTRAINT wallets_owner_matches_type CHECK ((type = 'SYSTEM') = (user_id IS NULL)),
        CONSTRAINT wallets_balance_non_negative CHECK (type = 'SYSTEM' OR balance >= 0)
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX wallets_one_system_per_currency ON wallets (currency) WHERE type = 'SYSTEM'`,
    );

    await queryRunner.query(`
      CREATE TABLE transactions (
        id                    uuid PRIMARY KEY DEFAULT uuidv7(),
        type                  text NOT NULL CHECK (type IN ('TRANSFER', 'DEPOSIT')),
        source_wallet_id      uuid NOT NULL REFERENCES wallets (id),
        destination_wallet_id uuid NOT NULL REFERENCES wallets (id),
        amount                bigint NOT NULL CHECK (amount > 0),
        currency              text NOT NULL,
        initiated_by          uuid NOT NULL REFERENCES users (id),
        idempotency_key       text NOT NULL,
        narration             text,
        created_at            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT transactions_distinct_wallets CHECK (source_wallet_id <> destination_wallet_id),
        CONSTRAINT transactions_initiator_idempotency_key UNIQUE (initiated_by, idempotency_key)
      )`);
    await queryRunner.query(
      `CREATE INDEX transactions_source_wallet_idx ON transactions (source_wallet_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX transactions_destination_wallet_idx ON transactions (destination_wallet_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE ledger_entries (
        id             uuid PRIMARY KEY DEFAULT uuidv7(),
        transaction_id uuid NOT NULL REFERENCES transactions (id),
        wallet_id      uuid NOT NULL REFERENCES wallets (id),
        direction      text NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
        amount         bigint NOT NULL CHECK (amount > 0),
        balance_after  bigint NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now()
      )`);
    // History is paginated by (wallet_id, id DESC); uuidv7 ids are time-ordered.
    await queryRunner.query(
      `CREATE INDEX ledger_entries_wallet_history_idx ON ledger_entries (wallet_id, id DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX ledger_entries_transaction_idx ON ledger_entries (transaction_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        user_id         uuid NOT NULL REFERENCES users (id),
        key             text NOT NULL CHECK (char_length(key) BETWEEN 8 AND 255),
        request_hash    text NOT NULL,
        response_status integer,
        response_body   jsonb,
        created_at      timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key)
      )`);

    await queryRunner.query(`
      CREATE TABLE blacklist_entries (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        type       text NOT NULL CHECK (type IN ('EMAIL', 'PHONE')),
        value      text NOT NULL,
        reason     text NOT NULL,
        created_by uuid NOT NULL REFERENCES users (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT blacklist_entries_type_value_key UNIQUE (type, value)
      )`);
    await queryRunner.query(
      `CREATE INDEX blacklist_entries_created_by_idx ON blacklist_entries (created_by)`,
    );

    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id          uuid PRIMARY KEY DEFAULT uuidv7(),
        actor_id    uuid NOT NULL REFERENCES users (id),
        action      text NOT NULL,
        target_type text NOT NULL,
        target_id   uuid NOT NULL,
        reason      text,
        metadata    jsonb NOT NULL DEFAULT '{}',
        created_at  timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id)`);
    await queryRunner.query(
      `CREATE INDEX audit_logs_target_idx ON audit_logs (target_type, target_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'audit_logs',
      'blacklist_entries',
      'idempotency_keys',
      'ledger_entries',
      'transactions',
      'wallets',
      'users',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}
