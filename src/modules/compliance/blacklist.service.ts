import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityManager, LessThan } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { E164_PATTERN, normalizeEmail, normalizePhone } from '../../common/identity';
import { type Page, toPage } from '../../common/pagination';
import { isUniqueViolation } from '../../database/pg-errors';
import { BlacklistEntry, type User } from '../../database/entities';
import { type BlacklistType } from '../../database/entities/blacklist-entry.entity';
import { AuditService } from '../audit/audit.service';
import { BlacklistEntryResponseDto, type CreateBlacklistEntryDto } from './dto/blacklist.dto';

export interface Identity {
  type: BlacklistType;
  value: string;
}

/** Identities (email + optional phone) a user is screened under. */
export function identitiesOf(user: Pick<User, 'email' | 'phone'>): Identity[] {
  const identities: Identity[] = [{ type: 'EMAIL', value: user.email }];
  if (user.phone) identities.push({ type: 'PHONE', value: user.phone });
  return identities;
}

@Injectable()
export class BlacklistService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  normalize(type: BlacklistType, raw: string): string {
    if (type === 'EMAIL') return normalizeEmail(raw);
    const phone = normalizePhone(raw);
    if (!E164_PATTERN.test(phone)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Phone numbers must be in E.164 format, e.g. +2348012345678',
      );
    }
    return phone;
  }

  /** True if any of the (already normalised) identities is blacklisted. */
  async isAnyListed(manager: EntityManager, identities: Identity[]): Promise<boolean> {
    if (identities.length === 0) return false;
    return manager.exists(BlacklistEntry, {
      where: identities.map(({ type, value }) => ({ type, value })),
    });
  }

  async add(adminId: string, dto: CreateBlacklistEntryDto): Promise<BlacklistEntryResponseDto> {
    const value = this.normalize(dto.type, dto.value);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const entry = await manager.save(
          manager.create(BlacklistEntry, {
            type: dto.type,
            value,
            reason: dto.reason,
            createdBy: adminId,
          }),
        );
        await this.audit.record(manager, {
          actorId: adminId,
          action: 'BLACKLIST_ADDED',
          targetType: 'BLACKLIST_ENTRY',
          targetId: entry.id,
          reason: dto.reason,
          metadata: { type: entry.type, value: entry.value },
        });
        return BlacklistEntryResponseDto.from(entry);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'blacklist_entries_type_value_key')) {
        throw new AppError('BLACKLIST_ENTRY_EXISTS', 'This identity is already blacklisted');
      }
      throw error;
    }
  }

  async remove(adminId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const entry = await manager.findOne(BlacklistEntry, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entry) throw new AppError('NOT_FOUND', 'Blacklist entry not found');
      await manager.delete(BlacklistEntry, { id });
      await this.audit.record(manager, {
        actorId: adminId,
        action: 'BLACKLIST_REMOVED',
        targetType: 'BLACKLIST_ENTRY',
        targetId: id,
        metadata: { type: entry.type, value: entry.value },
      });
    });
  }

  async check(type: BlacklistType, raw: string): Promise<BlacklistEntryResponseDto | null> {
    const entry = await this.dataSource.manager.findOneBy(BlacklistEntry, {
      type,
      value: this.normalize(type, raw),
    });
    return entry ? BlacklistEntryResponseDto.from(entry) : null;
  }

  async list(cursor: string | undefined, limit: number): Promise<Page<BlacklistEntryResponseDto>> {
    const [rows, total] = await Promise.all([
      this.dataSource.manager.find(BlacklistEntry, {
        where: cursor ? { id: LessThan(cursor) } : {},
        order: { id: 'DESC' },
        take: limit + 1,
      }),
      this.dataSource.manager.count(BlacklistEntry),
    ]);
    return toPage(rows, limit, total, (row) => BlacklistEntryResponseDto.from(row));
  }
}
