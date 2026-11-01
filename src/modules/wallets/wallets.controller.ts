import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppConfig } from '../../config/app-config.service';
import {
  LedgerPageDto,
  RecipientResponseDto,
  ResolveRecipientQueryDto,
  WalletHistoryQueryDto,
  WalletResponseDto,
} from './dto/wallet.dto';
import { WalletsService } from './wallets.service';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly wallets: WalletsService,
    private readonly config: AppConfig,
  ) {}

  /** The caller's wallets and balances. */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<WalletResponseDto[]> {
    return this.wallets.listForUser(user.id);
  }

  /** Find who you are paying: the recipient's wallet and masked name, by email. */
  @Get('resolve')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  resolve(
    @CurrentUser() user: AuthUser,
    @Query() query: ResolveRecipientQueryDto,
  ): Promise<RecipientResponseDto> {
    return this.wallets.resolveRecipient(user.id, query.email, this.config.get('DEFAULT_CURRENCY'));
  }

  /** One wallet owned by the caller. */
  @Get(':id')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WalletResponseDto> {
    return WalletResponseDto.from(await this.wallets.getOwned(user.id, id));
  }

  /** Ledger entries for a wallet, newest first (keyset pagination). */
  @Get(':id/transactions')
  history(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WalletHistoryQueryDto,
  ): Promise<LedgerPageDto> {
    return this.wallets.history(user.id, id, query.cursor, query.limit);
  }
}
