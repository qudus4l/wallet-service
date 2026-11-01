import { type ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppError } from '../../src/common/errors/app-error';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

function run(exception: unknown) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-1', method: 'POST', path: '/v1/x' }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter();
  jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  filter.catch(exception, host);
  return { status: res.status.mock.calls[0]?.[0] as number, body: res.json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter', () => {
  it('renders domain errors with their code, status and details', () => {
    const { status, body } = run(new AppError('INSUFFICIENT_FUNDS', 'Nope', { needed: 5 }));
    expect(status).toBe(422);
    expect(body).toEqual({
      error: { code: 'INSUFFICIENT_FUNDS', message: 'Nope', details: { needed: 5 } },
      requestId: 'req-1',
    });
  });

  it.each([
    [new NotFoundException(), 404, 'NOT_FOUND'],
    [new BadRequestException('bad'), 400, 'VALIDATION_ERROR'],
    [new ThrottlerException(), 429, 'RATE_LIMITED'],
  ])('maps framework exceptions (%#)', (exception, status, code) => {
    const result = run(exception);
    expect(result.status).toBe(status);
    expect(result.body.error.code).toBe(code);
  });

  it('maps lock and statement timeouts to 503 TRY_AGAIN', () => {
    const lockTimeout = Object.assign(new Error('x'), { driverError: { code: '55P03' } });
    expect(run(lockTimeout)).toMatchObject({ status: 503, body: { error: { code: 'TRY_AGAIN' } } });
  });

  it('maps pool exhaustion to 503 TRY_AGAIN', () => {
    const poolTimeout = new Error('timeout exceeded when trying to connect');
    expect(run(poolTimeout)).toMatchObject({ status: 503, body: { error: { code: 'TRY_AGAIN' } } });
  });

  it('hides unexpected errors behind an opaque 500', () => {
    const { status, body } = run(new Error('secret internals'));
    expect(status).toBe(500);
    expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
