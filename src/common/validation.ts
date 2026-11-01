import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { AppError } from './errors/app-error';

function flatten(errors: ValidationError[], parent = ''): { field: string; errors: string[] }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, errors: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** Strict input validation: unknown properties are rejected, not silently dropped. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new AppError('VALIDATION_ERROR', 'Request validation failed', { fields: flatten(errors) }),
  });
}
