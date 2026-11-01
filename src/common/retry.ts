import { setTimeout as sleep } from 'node:timers/promises';
import { isRetryable } from '../database/pg-errors';

/**
 * Re-runs a whole transaction on transient concurrency failures (deadlock, serialization).
 * Lock ordering makes deadlocks unexpected; this is defence in depth.
 */
export async function withTransientRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error;
      await sleep(10 * 2 ** attempt + Math.floor(Math.random() * 20));
    }
  }
}
