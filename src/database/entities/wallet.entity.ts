import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../bigint.transformer';

export type WalletType = 'USER' | 'SYSTEM';

@Entity({ name: 'wallets' })
export class Wallet {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id!: string;

  /** NULL only for SYSTEM wallets. */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'text', default: 'USER' })
  type!: WalletType;

  @Column({ type: 'text' })
  currency!: string;

  /** Minor units (e.g. kobo). */
  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  balance!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
