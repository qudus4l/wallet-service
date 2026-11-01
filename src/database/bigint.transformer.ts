import { type ValueTransformer } from 'typeorm';

/**
 * node-postgres returns BIGINT as a string to avoid precision loss. Money is stored in
 * minor units, so values fit comfortably in a JS number; anything beyond
 * Number.MAX_SAFE_INTEGER is rejected loudly rather than silently rounded.
 */
export const bigintTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null): number | null => {
    if (value === null) return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new RangeError(`BIGINT value ${value} exceeds Number.MAX_SAFE_INTEGER`);
    }
    return parsed;
  },
};
