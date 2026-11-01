import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type Response } from 'express';
import { type AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKey,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';
import { CreateTransferDto, TransactionResponseDto } from './dto/transfer.dto';
import { type MovementResult, TransfersService } from './transfers.service';

/** Sends a stored or fresh result, flagging replays. */
export function sendMovement(res: Response, result: MovementResult): TransactionResponseDto {
  res.status(result.status);
  if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
  return result.body;
}

@ApiTags('transfers')
@ApiBearerAuth()
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  /** Move funds from one of your wallets to another wallet. Safe to retry with the same key. */
  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiIdempotencyKey()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() key: string,
    @Body() dto: CreateTransferDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionResponseDto> {
    return sendMovement(res, await this.transfers.transfer(user, dto, key));
  }

  /** A transaction in which you are the sender or the recipient. */
  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TransactionResponseDto> {
    return this.transfers.getForParticipant(user.id, id);
  }
}
