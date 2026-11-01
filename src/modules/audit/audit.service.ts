import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityManager, LessThan } from 'typeorm';
import { type Page, toPage } from '../../common/pagination';
import { AuditLog } from '../../database/entities';
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
    const rows = await this.dataSource.manager.find(AuditLog, {
      where: cursor ? { id: LessThan(cursor) } : {},
      order: { id: 'DESC' },
      take: limit + 1,
    });
    return toPage(rows, limit, (row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
}
