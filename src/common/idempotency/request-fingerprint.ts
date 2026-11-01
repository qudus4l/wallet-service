import { createHash } from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
}

/**
 * Stable hash of an operation and its validated payload. Key order and
 * absent optional fields do not change the fingerprint.
 */
export function requestFingerprint(operation: string, payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify([operation, canonicalize(payload)]))
    .digest('hex');
}
