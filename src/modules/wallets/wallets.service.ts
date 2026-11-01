import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, In, LessThan } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { type Page, toPage } from '../../common/pagination';
import { LedgerEntry, Transaction, Wallet } from '../../database/entities';
import { LedgerEntryResponseDto, WalletResponseDto } from './dto/wallet.dto';

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
