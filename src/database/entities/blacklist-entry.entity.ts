import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export const BLACKLIST_TYPES = ['EMAIL', 'PHONE'] as const;
export type BlacklistType = (typeof BLACKLIST_TYPES)[number];

@Entity({ name: 'blacklist_entries' })
export class BlacklistEntry {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id!: string;

  @Column({ type: 'text' })
  type!: BlacklistType;

  /** Normalised exactly like the matching user field. */
  @Column({ type: 'text' })
  value!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
