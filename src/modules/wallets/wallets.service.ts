import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, In, LessThan } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { type Page, toPage } from '../../common/pagination';
import { LedgerEntry, Transaction, User, Wallet } from '../../database/entities';
import { BlacklistService, identitiesOf } from '../compliance/blacklist.service';
import {
  LedgerEntryResponseDto,
  type RecipientResponseDto,
  WalletResponseDto,
} from './dto/wallet.dto';

/** "Ada Lovelace" → "Ada L." — enough for a sender to confirm, not a full identity disclosure. */
export function maskName(fullName: string): string {
  const [first = '', ...rest] = fullName.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
}

@Injectable()
export class WalletsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly blacklist: BlacklistService,
  ) {}

  async listForUser(userId: string): Promise<WalletResponseDto[]> {
    const wallets = await this.dataSource.manager.find(Wallet, {
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return wallets.map((wallet) => WalletResponseDto.from(wallet));
  }

  /**
   * Name enquiry: finds the wallet to pay by the recipient's email, in the given currency.
   * Authenticated and rate-limited; returns a masked name only. A blocked or blacklisted
   * recipient fails here with the same generic RECIPIENT_UNAVAILABLE the transfer would
   * return, so the sender learns before confirming (the transfer re-checks under lock).
   */
  async resolveRecipient(
    callerId: string,
    email: string,
    currency: string,
  ): Promise<RecipientResponseDto> {
    const user = await this.dataSource.manager.findOneBy(User, { email });
    const wallet =
      user && user.id !== callerId && user.role === 'USER'
        ? await this.dataSource.manager.findOneBy(Wallet, { userId: user.id, currency })
        : null;
    if (!user || !wallet) throw new AppError('NOT_FOUND', 'No wallet found for that email');
    if (
      user.status !== 'ACTIVE' ||
      (await this.blacklist.isAnyListed(this.dataSource.manager, identitiesOf(user)))
    ) {
      throw new AppError('RECIPIENT_UNAVAILABLE', 'The destination wallet cannot receive funds');
    }
    return { walletId: wallet.id, currency: wallet.currency, accountName: maskName(user.fullName) };
  }

  /** 404 for wallets that do not exist *and* for wallets the caller does not own (no probing). */
  async getOwned(userId: string, walletId: string): Promise<Wallet> {
    const wallet = await this.dataSource.manager.findOneBy(Wallet, { id: walletId, userId });
    if (!wallet) throw new AppError('NOT_FOUND', 'Wallet not found');
    return wallet;
  }

  async history(
    userId: string,
    walletId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Page<LedgerEntryResponseDto>> {
    await this.getOwned(userId, walletId);
    const [entries, total] = await Promise.all([
      this.dataSource.manager.find(LedgerEntry, {
        where: { walletId, ...(cursor ? { id: LessThan(cursor) } : {}) },
        order: { id: 'DESC' },
        take: limit + 1,
      }),
      this.dataSource.manager.countBy(LedgerEntry, { walletId }),
    ]);
    const transactions = await this.dataSource.manager.findBy(Transaction, {
      id: In([...new Set(entries.map((entry) => entry.transactionId))]),
    });
    const byId = new Map(transactions.map((tx) => [tx.id, tx]));
    return toPage(entries, limit, total, (entry) =>
      LedgerEntryResponseDto.from(entry, byId.get(entry.transactionId)!),
    );
  }
}
