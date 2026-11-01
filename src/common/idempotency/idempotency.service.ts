import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { IdempotencyKey } from '../../database/entities';
import { AppError } from '../errors/app-error';

export interface StoredResponse<T> {
  status: number;
  body: T;
  replayed: boolean;
}

export type ClaimResult<T> = { claimed: true } | { claimed: false; replay: StoredResponse<T> };

/**
 * Database-backed idempotency (ADR-0005). Must be called inside the same transaction
 * as the operation it protects, so the key and the money movement commit atomically.
 */
@Injectable()
export class IdempotencyService {
  /**
   * Claims the key. A concurrent request holding the same key blocks on the primary key
   * until it commits (we then replay its response) or rolls back (we then proceed).
   */
  async claim<T>(
    manager: EntityManager,
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<ClaimResult<T>> {
    const insert = await manager
      .createQueryBuilder()
      .insert()
      .into(IdempotencyKey)
      .values({ userId, key, requestHash })
      .orIgnore()
      .returning(['key'])
      .execute();

    if (Array.isArray(insert.raw) && insert.raw.length === 1) return { claimed: true };

    const existing = await manager.findOneByOrFail(IdempotencyKey, { userId, key });
    if (existing.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used with a different request',
      );
    }
    if (existing.responseStatus === null) {
      // Unreachable for committed rows (claim and completion share a transaction).
      throw new AppError('TRY_AGAIN', 'The original request is still being processed');
    }
    return {
      claimed: false,
      replay: { status: existing.responseStatus, body: existing.responseBody as T, replayed: true },
    };
  }

  async complete(
    manager: EntityManager,
    userId: string,
    key: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    await manager.update(
      IdempotencyKey,
      { userId, key },
      { responseStatus: status, responseBody: body as object },
    );
  }
}
