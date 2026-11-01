import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { isTimeout } from '../../database/pg-errors';
import { AppError } from '../errors/app-error';
import { ERROR_STATUS, type ErrorCode } from '../errors/error-codes';

interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
  requestId?: string;
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'TRY_AGAIN',
};

/**
 * Renders every error as `{ error: { code, message, details }, requestId }`.
 * Unexpected errors are logged with their stack and returned as an opaque 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();

    const { status, body } = this.toResponse(exception);
    if (typeof request.id === 'string') body.requestId = request.id;

    if (status >= 500 && body.error.code === 'INTERNAL_ERROR') {
      this.logger.error(
        { err: exception, requestId: body.requestId },
        `Unhandled error on ${request.method} ${request.path}`,
      );
    }
    response.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppError) {
      return this.envelope(exception.status, exception.code, exception.message, exception.details);
    }
    if (isTimeout(exception)) {
      return this.envelope(
        ERROR_STATUS.TRY_AGAIN,
        'TRY_AGAIN',
        'The resource is busy. Please retry shortly.',
      );
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');
      return this.envelope(status, code, this.httpMessage(exception, code));
    }
    // body-parser errors (malformed JSON, payload too large) carry a status and a type.
    const parserStatus = bodyParserStatus(exception);
    if (parserStatus === HttpStatus.PAYLOAD_TOO_LARGE) {
      return this.envelope(parserStatus, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
    if (parserStatus === HttpStatus.BAD_REQUEST) {
      return this.envelope(parserStatus, 'VALIDATION_ERROR', 'Request body is not valid JSON');
    }
    return this.envelope(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR',
      'An unexpected error occurred',
    );
  }

  private httpMessage(exception: HttpException, code: ErrorCode): string {
    if (code === 'RATE_LIMITED') return 'Too many requests. Please slow down.';
    if (code === 'NOT_FOUND') return 'Resource not found';
    if (code === 'INTERNAL_ERROR') return 'An unexpected error occurred';
    const payload = exception.getResponse();
    if (typeof payload === 'object' && payload !== null && 'message' in payload) {
      const message = payload.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join('; ');
    }
    return exception.message;
  }

  private envelope(
    status: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): { status: number; body: ErrorBody } {
    return { status, body: { error: details ? { code, message, details } : { code, message } } };
  }
}

function bodyParserStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { type, status } = exception as { type?: unknown; status?: unknown };
  if (typeof type !== 'string' || !type.startsWith('entity.')) return undefined;
  return typeof status === 'number' ? status : undefined;
}
