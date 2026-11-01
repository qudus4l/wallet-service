import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../bigint.transformer';

export type TransactionType = 'TRANSFER' | 'DEPOSIT';

/** One row per money movement. Immutable. */
@Entity({ name: 'transactions' })
export class Transaction {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id!: string;

  @Column({ type: 'text' })
  type!: TransactionType;

  @Column({ name: 'source_wallet_id', type: 'uuid' })
  sourceWalletId!: string;

  @Column({ name: 'destination_wallet_id', type: 'uuid' })
  destinationWalletId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount!: number;

  @Column({ type: 'text' })
  currency!: string;

  @Column({ name: 'initiated_by', type: 'uuid' })
  initiatedBy!: string;

  @Column({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string;

  @Column({ type: 'text', nullable: true })
  narration!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
