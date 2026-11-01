import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { type AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKey,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { BlacklistService } from '../compliance/blacklist.service';
import {
  BlacklistCheckQueryDto,
  BlacklistCheckResponseDto,
  BlacklistEntryResponseDto,
  BlacklistListQueryDto,
  CreateBlacklistEntryDto,
} from '../compliance/dto/blacklist.dto';
import { CreateDepositDto, TransactionResponseDto } from '../transfers/dto/transfer.dto';
import { sendMovement } from '../transfers/transfers.controller';
import { TransfersService } from '../transfers/transfers.service';
import { AdminUsersService } from './admin-users.service';
import {
  AdminUserPageDto,
  AdminUserQueryDto,
  AdminUserResponseDto,
  BlockUserDto,
  UnblockUserDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly blacklist: BlacklistService,
    private readonly transfers: TransfersService,
    private readonly audit: AuditService,
  ) {}

  // ── Users ───────────────────────────────────────────────────────────────

  /** Find users, optionally by exact email. */
  @Get('users')
  listUsers(@Query() query: AdminUserQueryDto): Promise<AdminUserPageDto> {
    return this.users.list(query.email, query.cursor, query.limit);
  }

  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserResponseDto> {
    return this.users.get(id);
  }

  /** Block a user. Takes effect immediately, including for tokens already issued. */
  @Post('users/:id/block')
  @HttpCode(HttpStatus.OK)
  block(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlockUserDto,
  ): Promise<AdminUserResponseDto> {
    return this.users.block(admin, id, dto.reason);
  }

  @Post('users/:id/unblock')
  @HttpCode(HttpStatus.OK)
  unblock(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnblockUserDto,
  ): Promise<AdminUserResponseDto> {
    return this.users.unblock(admin, id, dto.reason);
  }

  // ── Blacklist ───────────────────────────────────────────────────────────

  @Post('blacklist')
  addToBlacklist(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateBlacklistEntryDto,
  ): Promise<BlacklistEntryResponseDto> {
    return this.blacklist.add(admin.id, dto);
  }

  @Get('blacklist')
  listBlacklist(@Query() query: BlacklistListQueryDto) {
    return this.blacklist.list(query.cursor, query.limit);
  }

  /** Screen an identity against the blacklist. */
  @Get('blacklist/check')
  async checkBlacklist(@Query() query: BlacklistCheckQueryDto): Promise<BlacklistCheckResponseDto> {
    const entry = await this.blacklist.check(query.type, query.value);
    return { listed: entry !== null, entry };
  }

  @Delete('blacklist/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFromBlacklist(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.blacklist.remove(admin.id, id);
  }

  // ── Funding ─────────────────────────────────────────────────────────────

  /** Credit a user wallet from the currency's SYSTEM wallet (stands in for external funding). */
  @Post('wallets/:id/deposits')
  @ApiIdempotencyKey()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  async deposit(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) walletId: string,
    @IdempotencyKey() key: string,
    @Body() dto: CreateDepositDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionResponseDto> {
    return sendMovement(res, await this.transfers.deposit(admin, walletId, dto, key));
  }

  // ── Audit ───────────────────────────────────────────────────────────────

  @Get('audit-logs')
  auditLogs(@Query() query: PaginationQueryDto) {
    return this.audit.list(query.cursor, query.limit);
  }
}
