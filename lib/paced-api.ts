import { RateLimitedError, requestApiFootball } from "./api-football.ts";
import { retryDelayMs, throttleDelayMs } from "./pacing.ts";

/**
 * Free tier allows ~10 requests/minute; Pro allows ~300. Override with
 * API_FOOTBALL_MIN_INTERVAL_MS — 6500 suits Free, 250 suits Pro.
 */
const DEFAULT_MIN_INTERVAL_MS = 6_500;
const DEFAULT_MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PacedClient {
  call<T>(path: string, params: Record<string, string | number>): Promise<T>;
  /** Live counter, so a script can report what a run cost. */
  readonly stats: { calls: number };
}

/**
 * An API-Football caller for offline scripts: spaces calls out to stay under the
 * provider's per-minute cap, and backs off rather than failing when it trips
 * anyway. Request-time code must not use this — a page load cannot sit and sleep.
 *
 * All the timing decisions come from `lib/pacing.ts`; this is only the loop that
 * carries them out.
 */
export function createPacedClient(options: {
  minIntervalMs?: number;
  maxRetries?: number;
} = {}): PacedClient {
  const minIntervalMs =
    options.minIntervalMs ??
    Number(process.env.API_FOOTBALL_MIN_INTERVAL_MS ?? DEFAULT_MIN_INTERVAL_MS);
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastCallAt = 0;
  const stats = { calls: 0 };

  async function call<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const wait = throttleDelayMs(lastCallAt, Date.now(), minIntervalMs);
      if (wait > 0) await sleep(wait);

      lastCallAt = Date.now();
      stats.calls += 1;

      try {
        return await requestApiFootball<T>(path, params);
      } catch (error) {
        if (!(error instanceof RateLimitedError)) throw error;

        const backoff = retryDelayMs(attempt, minIntervalMs, maxRetries);
        if (backoff === null) throw new Error(`${path} -> rate limited, giving up`);

        console.log(`  rate limited, waiting ${Math.round(backoff / 1000)}s...`);
        await sleep(backoff);
      }
    }
  }

  return { call, stats };
}
