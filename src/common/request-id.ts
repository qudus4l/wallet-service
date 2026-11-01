import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';

const REQUEST_ID_PATTERN = /^[\w-]{1,128}$/;

type RequestWithId = IncomingMessage & { id?: string };

/**
 * Assigns the request id before anything else runs (including body parsing), so every
 * log line and error body carries it. A well-formed upstream X-Request-Id is honoured.
 */
export function requestIdMiddleware(
  req: RequestWithId,
  res: ServerResponse,
  next: () => void,
): void {
  const incoming = req.headers['x-request-id'];
  req.id =
    typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

export function requestIdOf(req: IncomingMessage): string {
  return (req as RequestWithId).id ?? randomUUID();
}
