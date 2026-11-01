import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LedgerPageDto, WalletHistoryQueryDto, WalletResponseDto } from './dto/wallet.dto';
import { WalletsService } from './wallets.service';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  /** The caller's wallets and balances. */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<WalletResponseDto[]> {
    return this.wallets.listForUser(user.id);
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
