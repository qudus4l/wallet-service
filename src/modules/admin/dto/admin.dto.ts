import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../../common/identity';
import { PaginationQueryDto } from '../../../common/pagination';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { WalletResponseDto } from '../../wallets/dto/wallet.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class BlockUserDto {
  /** Recorded in the audit log. @example "Suspected account takeover" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class UnblockUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminUserQueryDto extends PaginationQueryDto {
  /** Exact match on the normalised email. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  email?: string;
}

export class AdminUserResponseDto extends UserResponseDto {
  wallets!: WalletResponseDto[];
}

export class AdminUserPageDto {
  data!: AdminUserResponseDto[];
  nextCursor!: string | null;
}
