import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { AppConfig } from '../../config/app-config.service';
import { User, Wallet } from '../../database/entities';
import { isUniqueViolation } from '../../database/pg-errors';
import { BlacklistService, identitiesOf } from '../compliance/blacklist.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { WalletResponseDto } from '../wallets/dto/wallet.dto';
import {
  type LoginDto,
  type LoginResponseDto,
  type RegisterDto,
  type RegisterResponseDto,
} from './dto/auth.dto';
import { PasswordService } from './password.service';

export interface JwtPayload {
  sub: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly blacklist: BlacklistService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  /** Creates the user and their default-currency wallet atomically, after blacklist screening. */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    // Hash outside the transaction: CPU-bound work must not hold a pooled connection.
    const passwordHash = await this.passwords.hash(dto.password);
    const identity = { email: dto.email, phone: dto.phone ?? null };

    try {
      return await this.dataSource.transaction(async (manager) => {
        if (await this.blacklist.isAnyListed(manager, identitiesOf(identity))) {
          // No identifiers in the log line; the request id correlates it.
          this.logger.warn('Registration rejected by blacklist screening');
          throw new AppError(
            'ACCOUNT_RESTRICTED',
            'Registration is not available for these details',
          );
        }
        const user = await manager.save(
          manager.create(User, { ...identity, fullName: dto.fullName, passwordHash }),
        );
        const wallet = await manager.save(
          manager.create(Wallet, {
            userId: user.id,
            currency: this.config.get('DEFAULT_CURRENCY'),
          }),
        );
        return { user: UserResponseDto.from(user), wallets: [WalletResponseDto.from(wallet)] };
      });
    } catch (error) {
      // One generic conflict for email *or* phone, so the response does not reveal which
      // identifier is registered. Residual enumeration risk is bounded by the /auth rate limit.
      if (
        isUniqueViolation(error, 'users_email_key') ||
        isUniqueViolation(error, 'users_phone_key')
      ) {
        throw new AppError(
          'ACCOUNT_ALREADY_EXISTS',
          'An account with these details already exists',
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const valid = await this.passwords.verify(user?.passwordHash, dto.password);
    if (!user || !valid) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    if (user.status === 'BLOCKED') {
      throw new AppError('ACCOUNT_BLOCKED', 'This account is blocked');
    }
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.get('JWT_TTL_SECONDS'),
    };
  }
}
