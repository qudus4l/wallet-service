import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength } from 'class-validator';
import { type Transaction } from '../../../database/entities';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTransferDto {
  /** A wallet owned by the caller. */
  @IsUUID()
  sourceWalletId!: string;

  @IsUUID()
  destinationWalletId!: string;

  /** Positive integer in minor units (e.g. 150000 = ₦1,500.00). @example 150000 */
  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  amount!: number;

  /** @example "Rent for November" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(140)
  narration?: string;
}

export class CreateDepositDto {
  /** Positive integer in minor units. @example 500000 */
  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  amount!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(140)
  narration?: string;
}

export class TransactionResponseDto {
  id!: string;
  @ApiProperty({ enum: ['TRANSFER', 'DEPOSIT'] })
  type!: Transaction['type'];
  @ApiProperty({ enum: ['COMPLETED'] })
  status!: 'COMPLETED';
  sourceWalletId!: string;
  destinationWalletId!: string;
  /** Minor units. */
  amount!: number;
  currency!: string;
  narration!: string | null;
  createdAt!: string;

  static from(tx: Transaction): TransactionResponseDto {
    return {
      id: tx.id,
      type: tx.type,
      status: 'COMPLETED',
      sourceWalletId: tx.sourceWalletId,
      destinationWalletId: tx.destinationWalletId,
      amount: tx.amount,
      currency: tx.currency,
      narration: tx.narration,
      createdAt: tx.createdAt.toISOString(),
    };
  }
}
