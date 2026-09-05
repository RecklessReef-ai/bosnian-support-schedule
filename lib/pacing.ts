/**
 * Delay arithmetic for offline scripts that make many upstream calls in a row.
 *
 * Kept pure and separate from the loop that sleeps, so the policy can be tested
 * without waiting for real time to pass. `lib/paced-api.ts` is the thin shell
 * that applies it.
 */

/**
 * How long to wait before the next call so consecutive calls stay at least
 * `minIntervalMs` apart. Zero when enough time has already elapsed.
 */
export function throttleDelayMs(
  lastCallAt: number,
  now: number,
  minIntervalMs: number,
): number {
  return Math.max(0, lastCallAt + minIntervalMs - now);
}

/**
 * Backoff after a rate-limited call, or null once retries are exhausted and the
 * caller should give up. `attempt` is 0-based, so the first retry already waits
 * twice the pacing interval.
 */
export function retryDelayMs(
  attempt: number,
  minIntervalMs: number,
  maxRetries: number,
): number | null {
  if (attempt >= maxRetries) return null;
  return minIntervalMs * 2 ** (attempt + 1);
}
