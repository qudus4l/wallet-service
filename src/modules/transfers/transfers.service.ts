import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityManager, In } from 'typeorm';
import { type AuthUser } from '../../common/auth-user';
import { AppError } from '../../common/errors/app-error';
import {
  IdempotencyService,
  type StoredResponse,
} from '../../common/idempotency/idempotency.service';
import { requestFingerprint } from '../../common/idempotency/request-fingerprint';
import { withTransientRetry } from '../../common/retry';
import { AppConfig } from '../../config/app-config.service';
import { LedgerEntry, Transaction, User, Wallet } from '../../database/entities';
import { type TransactionType } from '../../database/entities/transaction.entity';
import { isUniqueViolation } from '../../database/pg-errors';
import { AuditService } from '../audit/audit.service';
import { BlacklistService, identitiesOf } from '../compliance/blacklist.service';
import {
  type CreateDepositDto,
  type CreateTransferDto,
  TransactionResponseDto,
} from './dto/transfer.dto';

interface MovementCommand {
  type: TransactionType;
  initiator: AuthUser;
  /** Omitted for deposits: the currency's SYSTEM wallet is the source. */
  sourceWalletId?: string;
  destinationWalletId: string;
  amount: number;
  narration: string | null;
  idempotencyKey: string;
  requestHash: string;
}

export type MovementResult = StoredResponse<TransactionResponseDto>;

/**
 * The money-movement engine (DESIGN §6, ADR-0004, ADR-0005). Every movement runs in one
 * READ COMMITTED transaction: claim idempotency key → lock both wallets in id order →
 * validate under the lock → write balances, transaction and ledger entries → store response.
 */
@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly idempotency: IdempotencyService,
    private readonly blacklist: BlacklistService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  transfer(
    user: AuthUser,
    dto: CreateTransferDto,
    idempotencyKey: string,
  ): Promise<MovementResult> {
    return this.execute({
      type: 'TRANSFER',
      initiator: user,
      sourceWalletId: dto.sourceWalletId,
      destinationWalletId: dto.destinationWalletId,
      amount: dto.amount,
      narration: dto.narration ?? null,
      idempotencyKey,
      requestHash: requestFingerprint('POST /v1/transfers', dto),
    });
  }

  deposit(
    admin: AuthUser,
    walletId: string,
    dto: CreateDepositDto,
    idempotencyKey: string,
  ): Promise<MovementResult> {
    return this.execute({
      type: 'DEPOSIT',
      initiator: admin,
      destinationWalletId: walletId,
      amount: dto.amount,
      narration: dto.narration ?? null,
      idempotencyKey,
      requestHash: requestFingerprint(`POST /v1/admin/wallets/${walletId}/deposits`, dto),
    });
  }

  /** A transaction visible to the caller: they must own its source or destination wallet. */
  async getForParticipant(userId: string, id: string): Promise<TransactionResponseDto> {
    const tx = await this.dataSource.manager
      .createQueryBuilder(Transaction, 't')
      .innerJoin(Wallet, 's', 's.id = t.sourceWalletId')
      .innerJoin(Wallet, 'd', 'd.id = t.destinationWalletId')
      .where('t.id = :id', { id })
      .andWhere('(s.userId = :userId OR d.userId = :userId)', { userId })
      .getOne();
    if (!tx) throw new AppError('NOT_FOUND', 'Transaction not found');
    return TransactionResponseDto.from(tx);
  }

  private async execute(cmd: MovementCommand): Promise<MovementResult> {
    if (cmd.sourceWalletId === cmd.destinationWalletId) {
      throw new AppError('SELF_TRANSFER', 'Source and destination wallets must be different');
    }
    const max = this.config.get('MAX_TRANSACTION_AMOUNT');
    if (cmd.amount > max) {
      throw new AppError(
        'AMOUNT_LIMIT_EXCEEDED',
        `Amount exceeds the per-transaction limit of ${max}`,
        {
          max,
        },
      );
    }

    try {
      return await withTransientRetry(() =>
        this.dataSource.transaction('READ COMMITTED', async (manager) => {
          const claim = await this.idempotency.claim<TransactionResponseDto>(
            manager,
            cmd.initiator.id,
            cmd.idempotencyKey,
            cmd.requestHash,
          );
          if (!claim.claimed) return claim.replay;

          const tx = await this.move(manager, cmd);
          const body = TransactionResponseDto.from(tx);
          await this.idempotency.complete(
            manager,
            cmd.initiator.id,
            cmd.idempotencyKey,
            HttpStatus.CREATED,
            body,
          );
          return { status: HttpStatus.CREATED, body, replayed: false };
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error, 'transactions_initiator_idempotency_key')) {
        // Backstop: only reachable if the idempotency row was pruned.
        throw new AppError('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key has already been used');
      }
      throw error;
    }
  }

  private async move(manager: EntityManager, cmd: MovementCommand): Promise<Transaction> {
    const sourceId =
      cmd.sourceWalletId ?? (await this.systemWalletIdFor(manager, cmd.destinationWalletId));

    // Deterministic lock order (ascending id) makes opposite-direction transfers deadlock-free.
    const locked = await manager
      .createQueryBuilder(Wallet, 'w')
      .where('w.id IN (:...ids)', { ids: [sourceId, cmd.destinationWalletId] })
      .orderBy('w.id', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
    const source = locked.find((w) => w.id === sourceId);
    const destination = locked.find((w) => w.id === cmd.destinationWalletId);

    if (!source || (cmd.type === 'TRANSFER' && source.userId !== cmd.initiator.id)) {
      throw new AppError('NOT_FOUND', 'Source wallet not found');
    }
    if (!destination || destination.type !== 'USER') {
      throw new AppError('NOT_FOUND', 'Destination wallet not found');
    }
    if (source.currency !== destination.currency) {
      throw new AppError('CURRENCY_MISMATCH', 'Wallets must use the same currency');
    }

    await this.assertPartiesEligible(manager, cmd.type, source, destination);

    if (source.type === 'USER' && source.balance < cmd.amount) {
      throw new AppError('INSUFFICIENT_FUNDS', 'Insufficient funds in the source wallet');
    }

    const sourceBalance = source.balance - cmd.amount;
    const destinationBalance = destination.balance + cmd.amount;
    await manager.update(Wallet, { id: source.id }, { balance: sourceBalance });
    await manager.update(Wallet, { id: destination.id }, { balance: destinationBalance });

    const tx = await manager.save(
      manager.create(Transaction, {
        type: cmd.type,
        sourceWalletId: source.id,
        destinationWalletId: destination.id,
        amount: cmd.amount,
        currency: source.currency,
        initiatedBy: cmd.initiator.id,
        idempotencyKey: cmd.idempotencyKey,
        narration: cmd.narration,
      }),
    );
    await manager.insert(LedgerEntry, [
      {
        transactionId: tx.id,
        walletId: source.id,
        direction: 'DEBIT',
        amount: cmd.amount,
        balanceAfter: sourceBalance,
      },
      {
        transactionId: tx.id,
        walletId: destination.id,
        direction: 'CREDIT',
        amount: cmd.amount,
        balanceAfter: destinationBalance,
      },
    ]);

    if (cmd.type === 'DEPOSIT') {
      await this.audit.record(manager, {
        actorId: cmd.initiator.id,
        action: 'WALLET_DEPOSIT',
        targetType: 'WALLET',
        targetId: destination.id,
        reason: tx.narration,
        metadata: { transactionId: tx.id, amount: cmd.amount, currency: tx.currency },
      });
    }

    this.logger.log(
      {
        transactionId: tx.id,
        type: tx.type,
        sourceWalletId: tx.sourceWalletId,
        destinationWalletId: tx.destinationWalletId,
        amount: tx.amount,
        currency: tx.currency,
      },
      'Money movement committed',
    );
    return tx;
  }

  /** Sender must be active and not blacklisted; recipient likewise (reported generically). */
  private async assertPartiesEligible(
    manager: EntityManager,
    type: TransactionType,
    source: Wallet,
    destination: Wallet,
  ): Promise<void> {
    const ownerIds = [source.userId, destination.userId].filter((id): id is string => id !== null);
    const owners = await manager.findBy(User, { id: In(ownerIds) });
    const sender = owners.find((u) => u.id === source.userId);
    const recipient = owners.find((u) => u.id === destination.userId);

    if (type === 'TRANSFER') {
      if (!sender || sender.status !== 'ACTIVE') {
        throw new AppError('ACCOUNT_BLOCKED', 'This account is blocked');
      }
      if (await this.blacklist.isAnyListed(manager, identitiesOf(sender))) {
        this.logger.warn({ userId: sender.id }, 'Transfer rejected: sender is blacklisted');
        throw new AppError('ACCOUNT_RESTRICTED', 'This account cannot send funds');
      }
    }
    if (
      !recipient ||
      recipient.status !== 'ACTIVE' ||
      (await this.blacklist.isAnyListed(manager, identitiesOf(recipient)))
    ) {
      // Deliberately generic: do not disclose *why* a recipient cannot receive.
      throw new AppError('RECIPIENT_UNAVAILABLE', 'The destination wallet cannot receive funds');
    }
  }

  private async systemWalletIdFor(
    manager: EntityManager,
    destinationWalletId: string,
  ): Promise<string> {
    const destination = await manager.findOneBy(Wallet, { id: destinationWalletId });
    if (!destination || destination.type !== 'USER') {
      throw new AppError('NOT_FOUND', 'Destination wallet not found');
    }
    const system = await manager.findOneBy(Wallet, {
      type: 'SYSTEM',
      currency: destination.currency,
    });
    if (!system) {
      throw new AppError(
        'INVALID_OPERATION',
        `Deposits are not enabled for ${destination.currency}`,
      );
    }
    return system.id;
  }
}
