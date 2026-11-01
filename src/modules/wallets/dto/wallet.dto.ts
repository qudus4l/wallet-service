import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../../common/identity';
import { type LedgerEntry, type Transaction, type Wallet } from '../../../database/entities';
import { PaginationQueryDto } from '../../../common/pagination';

export class WalletResponseDto {
  id!: string;
  /** ISO 4217 currency code. */
  currency!: string;
  /** Balance in minor units (e.g. kobo). */
  balance!: number;
  createdAt!: string;
  updatedAt!: string;

  static from(wallet: Wallet): WalletResponseDto {
    return {
      id: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }
}

export class WalletHistoryQueryDto extends PaginationQueryDto {}

export class LedgerEntryResponseDto {
  id!: string;
  transactionId!: string;
  @ApiProperty({ enum: ['TRANSFER', 'DEPOSIT'] })
  type!: Transaction['type'];
  @ApiProperty({ enum: ['DEBIT', 'CREDIT'] })
  direction!: LedgerEntry['direction'];
  /** Minor units. */
  amount!: number;
  /** Wallet balance immediately after this entry, in minor units. */
  balanceAfter!: number;
  /** The other wallet in the movement. */
  counterpartyWalletId!: string;
  narration!: string | null;
  createdAt!: string;

  static from(entry: LedgerEntry, transaction: Transaction): LedgerEntryResponseDto {
    return {
      id: entry.id,
      transactionId: entry.transactionId,
      type: transaction.type,
      direction: entry.direction,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      counterpartyWalletId:
        entry.direction === 'DEBIT' ? transaction.destinationWalletId : transaction.sourceWalletId,
      narration: transaction.narration,
      createdAt: entry.createdAt.toISOString(),
    };
  }
}

export class LedgerPageDto {
  @ApiProperty({ type: [LedgerEntryResponseDto] })
  data!: LedgerEntryResponseDto[];
  nextCursor!: string | null;
  /** Rows matching the query across all pages. */
  total!: number;
}

export class ResolveRecipientQueryDto {
  /** The recipient's email address. @example "bob@example.com" */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class RecipientResponseDto {
  walletId!: string;
  currency!: string;
  /** Masked for privacy, e.g. "Ada L.", so the sender can confirm the recipient. */
  accountName!: string;
}
