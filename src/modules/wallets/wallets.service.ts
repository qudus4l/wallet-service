import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, In, LessThan } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { type Page, toPage } from '../../common/pagination';
import { LedgerEntry, Transaction, User, Wallet } from '../../database/entities';
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
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listForUser(userId: string): Promise<WalletResponseDto[]> {
    const wallets = await this.dataSource.manager.find(Wallet, {
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return wallets.map((wallet) => WalletResponseDto.from(wallet));
  }

  /**
   * Name enquiry: finds the wallet to pay by the recipient's email, in the given currency.
   * Authenticated and rate-limited; returns a masked name only.
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
    const entries = await this.dataSource.manager.find(LedgerEntry, {
      where: { walletId, ...(cursor ? { id: LessThan(cursor) } : {}) },
      order: { id: 'DESC' },
      take: limit + 1,
    });
    const transactions = await this.dataSource.manager.findBy(Transaction, {
      id: In([...new Set(entries.map((entry) => entry.transactionId))]),
    });
    const byId = new Map(transactions.map((tx) => [tx.id, tx]));
    return toPage(entries, limit, (entry) =>
      LedgerEntryResponseDto.from(entry, byId.get(entry.transactionId)!),
    );
  }
}
