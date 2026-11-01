import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, In, LessThan } from 'typeorm';
import { type AuthUser } from '../../common/auth-user';
import { AppError } from '../../common/errors/app-error';
import { type Page, toPage } from '../../common/pagination';
import { User, Wallet } from '../../database/entities';
import { type UserStatus } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { WalletResponseDto } from '../wallets/dto/wallet.dto';
import { type AdminUserResponseDto } from './dto/admin.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(
    email: string | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<Page<AdminUserResponseDto>> {
    const [users, total] = await Promise.all([
      this.dataSource.manager.find(User, {
        where: { ...(email ? { email } : {}), ...(cursor ? { id: LessThan(cursor) } : {}) },
        order: { id: 'DESC' },
        take: limit + 1,
      }),
      this.dataSource.manager.countBy(User, email ? { email } : {}),
    ]);
    const wallets = await this.walletsByUser(users.map((u) => u.id));
    return toPage(users, limit, total, (user) => this.toResponse(user, wallets.get(user.id) ?? []));
  }

  async get(id: string): Promise<AdminUserResponseDto> {
    const user = await this.dataSource.manager.findOneBy(User, { id });
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    const wallets = await this.walletsByUser([id]);
    return this.toResponse(user, wallets.get(id) ?? []);
  }

  block(admin: AuthUser, userId: string, reason: string): Promise<AdminUserResponseDto> {
    if (admin.id === userId) {
      throw new AppError('INVALID_OPERATION', 'Administrators cannot block their own account');
    }
    return this.setStatus(admin, userId, 'BLOCKED', reason);
  }

  unblock(admin: AuthUser, userId: string, reason?: string): Promise<AdminUserResponseDto> {
    return this.setStatus(admin, userId, 'ACTIVE', reason ?? null);
  }

  /** Idempotent: setting the current status is a no-op and writes no audit entry. */
  private async setStatus(
    admin: AuthUser,
    userId: string,
    status: UserStatus,
    reason: string | null,
  ): Promise<AdminUserResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new AppError('NOT_FOUND', 'User not found');
      if (user.status === status) return;

      await manager.update(User, { id: userId }, { status });
      await this.audit.record(manager, {
        actorId: admin.id,
        action: status === 'BLOCKED' ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
        targetType: 'USER',
        targetId: userId,
        reason,
        metadata: { previousStatus: user.status },
      });
    });
    return this.get(userId);
  }

  private async walletsByUser(userIds: string[]): Promise<Map<string, Wallet[]>> {
    const wallets = userIds.length
      ? await this.dataSource.manager.find(Wallet, {
          where: { userId: In(userIds) },
          order: { createdAt: 'ASC' },
        })
      : [];
    const grouped = new Map<string, Wallet[]>();
    for (const wallet of wallets) {
      const list = grouped.get(wallet.userId!) ?? [];
      list.push(wallet);
      grouped.set(wallet.userId!, list);
    }
    return grouped;
  }

  private toResponse(user: User, wallets: Wallet[]): AdminUserResponseDto {
    return {
      ...UserResponseDto.from(user),
      wallets: wallets.map((w) => WalletResponseDto.from(w)),
    };
  }
}
