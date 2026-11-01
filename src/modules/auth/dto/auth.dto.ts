import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { E164_PATTERN, normalizeEmail, normalizePhone } from '../../../common/identity';
import { WalletResponseDto } from '../../wallets/dto/wallet.dto';
import { UserResponseDto } from '../../users/dto/user-response.dto';

const asEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeEmail(value) : value;
const asPhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizePhone(value) : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  /** @example "ada@example.com" */
  @Transform(asEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  /** At least 10 characters. @example "correct-horse-battery" */
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  /** @example "Ada Lovelace" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  /** Optional, E.164 format. @example "+2348012345678" */
  @IsOptional()
  @Transform(asPhone)
  @Matches(E164_PATTERN, { message: 'phone must be in E.164 format, e.g. +2348012345678' })
  phone?: string;
}

export class LoginDto {
  /** @example "ada@example.com" */
  @Transform(asEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  /** @example "correct-horse-battery" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class LoginResponseDto {
  accessToken!: string;
  tokenType!: 'Bearer';
  /** Seconds until the token expires. */
  expiresIn!: number;
}

export class RegisterResponseDto {
  user!: UserResponseDto;
  wallets!: WalletResponseDto[];
}
