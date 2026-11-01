import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../bigint.transformer';

export type EntryDirection = 'DEBIT' | 'CREDIT';

/** Append-only, double-entry: every transaction writes exactly one DEBIT and one CREDIT. */
@Entity({ name: 'ledger_entries' })
export class LedgerEntry {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id!: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @Column({ type: 'text' })
  direction!: EntryDirection;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount!: number;

  @Column({ name: 'balance_after', type: 'bigint', transformer: bigintTransformer })
  balanceAfter!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
