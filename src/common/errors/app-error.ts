import { ERROR_STATUS, type ErrorCode } from './error-codes';

/**
 * A failure the client is expected to understand. Thrown from services,
 * rendered into the error envelope by the global exception filter.
 */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}
