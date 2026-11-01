import { applyDecorators, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { type Request } from 'express';
import { AppError } from '../errors/app-error';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const KEY_PATTERN = /^[\x21-\x7E]{8,255}$/; // printable ASCII, no spaces

/** Extracts and validates the mandatory `Idempotency-Key` header. */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const value = ctx.switchToHttp().getRequest<Request>().headers[IDEMPOTENCY_HEADER];
    if (value === undefined || value === '') {
      throw new AppError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'The Idempotency-Key header is required for this operation',
      );
    }
    if (typeof value !== 'string' || !KEY_PATTERN.test(value)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Idempotency-Key must be 8-255 printable ASCII characters without spaces',
      );
    }
    return value;
  },
);

/** Swagger documentation for routes that require the header. */
export const ApiIdempotencyKey = () =>
  applyDecorators(
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        'Unique per operation (a UUID is recommended). Retrying with the same key and body returns the original result with `Idempotent-Replayed: true`.',
    }),
  );
