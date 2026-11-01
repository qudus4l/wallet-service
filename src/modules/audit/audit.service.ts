import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityManager, In, LessThan } from 'typeorm';
import { type Page, toPage } from '../../common/pagination';
import { AuditLog, User, Wallet } from '../../database/entities';
import { type AuditAction } from '../../database/entities/audit-log.entity';

export interface AuditRecord {
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogResponse {
  id: string;
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** Display name of the admin who acted (null if that user no longer exists). */
  actorName: string | null;
  /** Display name of the target: the user (or wallet owner), or the blacklisted value. */
  targetName: string | null;
}

@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Written inside the caller's transaction: the action and its audit row commit together. */
  async record(manager: EntityManager, record: AuditRecord): Promise<void> {
    await manager.save(
      manager.create(AuditLog, {
        ...record,
        reason: record.reason ?? null,
        metadata: record.metadata ?? {},
      }),
    );
  }

  async list(cursor: string | undefined, limit: number): Promise<Page<AuditLogResponse>> {
    const [rows, total] = await Promise.all([
      this.dataSource.manager.find(AuditLog, {
        where: cursor ? { id: LessThan(cursor) } : {},
        order: { id: 'DESC' },
        take: limit + 1,
      }),
      this.dataSource.manager.count(AuditLog),
    ]);
    const names = await this.namesFor(rows);
    return toPage(rows, limit, total, (row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      actorName: names.users.get(row.actorId) ?? null,
      targetName: this.targetName(row, names),
    }));
  }

  /** Two batched lookups per page: wallet owners, then every user referenced. */
  private async namesFor(rows: AuditLog[]): Promise<{
    users: Map<string, string>;
    walletOwners: Map<string, string>;
  }> {
    const walletIds = rows.filter((r) => r.targetType === 'WALLET').map((r) => r.targetId);
    const wallets = walletIds.length
      ? await this.dataSource.manager.findBy(Wallet, { id: In([...new Set(walletIds)]) })
      : [];
    const walletOwners = new Map(
      wallets.flatMap((w) => (w.userId ? [[w.id, w.userId] as const] : [])),
    );
    const userIds = new Set([
      ...rows.map((r) => r.actorId),
      ...rows.filter((r) => r.targetType === 'USER').map((r) => r.targetId),
      ...walletOwners.values(),
    ]);
    const users = userIds.size
      ? await this.dataSource.manager.find(User, {
          select: { id: true, fullName: true },
          where: { id: In([...userIds]) },
        })
      : [];
    return { users: new Map(users.map((u) => [u.id, u.fullName])), walletOwners };
  }

  private targetName(
    row: AuditLog,
    names: { users: Map<string, string>; walletOwners: Map<string, string> },
  ): string | null {
    if (row.targetType === 'USER') return names.users.get(row.targetId) ?? null;
    if (row.targetType === 'WALLET') {
      const owner = names.walletOwners.get(row.targetId);
      return owner ? (names.users.get(owner) ?? null) : null;
    }
    const value = row.metadata.value;
    return typeof value === 'string' ? value : null;
  }
}
