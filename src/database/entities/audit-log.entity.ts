import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export type AuditAction =
  'USER_BLOCKED' | 'USER_UNBLOCKED' | 'BLACKLIST_ADDED' | 'BLACKLIST_REMOVED' | 'WALLET_DEPOSIT';

/** Append-only record of administrative actions. */
@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id!: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ type: 'text' })
  action!: AuditAction;

  @Column({ name: 'target_type', type: 'text' })
  targetType!: string;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
