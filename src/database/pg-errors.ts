/** PostgreSQL SQLSTATE codes the application reacts to. */
export const PG = {
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',
  LOCK_NOT_AVAILABLE: '55P03',
  QUERY_CANCELED: '57014',
} as const;

interface PgDriverError {
  code?: unknown;
  constraint?: unknown;
}

function driverError(error: unknown): PgDriverError | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  // TypeORM wraps driver errors in QueryFailedError and copies the driver fields.
  const wrapped = (error as { driverError?: unknown }).driverError;
  return typeof wrapped === 'object' && wrapped !== null ? wrapped : error;
}

export function pgErrorCode(error: unknown): string | undefined {
  const code = driverError(error)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function pgConstraint(error: unknown): string | undefined {
  const constraint = driverError(error)?.constraint;
  return typeof constraint === 'string' ? constraint : undefined;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return (
    pgErrorCode(error) === PG.UNIQUE_VIOLATION &&
    (constraint === undefined || pgConstraint(error) === constraint)
  );
}

/** Transient concurrency failures that are safe to retry from the start of the transaction. */
export function isRetryable(error: unknown): boolean {
  const code = pgErrorCode(error);
  return code === PG.DEADLOCK_DETECTED || code === PG.SERIALIZATION_FAILURE;
}

/** Bounded waits that tripped: the client should retry later. */
export function isTimeout(error: unknown): boolean {
  const code = pgErrorCode(error);
  return code === PG.LOCK_NOT_AVAILABLE || code === PG.QUERY_CANCELED;
}
