import type { Club } from "./types.ts";

const BASE_URL = "https://v3.football.api-sports.io";

/**
 * ~39 distinct clubs x 1 call per refresh, x3 surfaces that each build the Schedule
 * (page, JSON, ICS). At 24h that is well inside the daily budget; the per-minute cap
 * is the one that binds, which is what the retry below exists for.
 */
export const FIXTURES_TTL_SECONDS = 60 * 60 * 24;

export function hasApiKey(): boolean {
  return Boolean(process.env.API_FOOTBALL_KEY);
}

/**
 * Raised when the provider reports its per-minute cap — by HTTP 429 or by the
 * `rateLimit` error body it far more often returns with HTTP 200. Callers that can
 * afford to wait back off and retry; it is deliberately distinct from a bad key or
 * an exhausted daily quota, which retrying would only waste calls on.
 */
export class RateLimitedError extends Error {
  constructor(path: string) {
    super(`API-Football ${path}: rate limited`);
    this.name = "RateLimitedError";
  }
}

interface ApiFootballResponse<T> {
  response: T;
  errors: unknown;
}

/**
 * True when a 200 response's `errors` field is really a rate-limit notice.
 *
 * The provider reports being over its per-minute cap two different ways: HTTP 429,
 * and — far more often — HTTP 200 carrying `{"rateLimit": "Too many requests..."}`.
 * Only the first was ever recognised, so the common case fell through to the
 * generic error path and was never retried.
 */
export function isRateLimitBody(errors: unknown): boolean {
  return (
    typeof errors === "object" &&
    errors !== null &&
    !Array.isArray(errors) &&
    "rateLimit" in errors
  );
}

/**
 * The single place that talks to API-Football.
 *
 * Both offline scripts and the request-time fixture fetch go through here, so the
 * provider's two quirks — a 429 that carries no body, and a 200 whose `errors`
 * field marks a quota or auth failure — are handled once rather than in each
 * caller. Pacing and retry are deliberately *not* here: they differ per caller
 * and live in `lib/paced-api.ts` for the ones that need them.
 */
export async function requestApiFootball<T>(
  path: string,
  params: Record<string, string | number>,
  init: { revalidate?: number } = {},
): Promise<T> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not set");

  const url = new URL(`${BASE_URL}/${path}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }

  const res = await fetch(url, {
    headers: { "x-apisports-key": key },
    // Only the request-time caller opts into the Next.js data cache; the scripts
    // run outside Next and pass no revalidate.
    ...(init.revalidate === undefined ? {} : { next: { revalidate: init.revalidate } }),
  });

  if (res.status === 429) throw new RateLimitedError(path);
  if (!res.ok) throw new Error(`API-Football ${path} failed: ${res.status}`);

  const body = (await res.json()) as ApiFootballResponse<T>;

  // API-Football returns 200 with a populated `errors` field for quota and auth problems.
  if (isRateLimitBody(body.errors)) throw new RateLimitedError(path);
  if (body.errors && !Array.isArray(body.errors) && Object.keys(body.errors).length > 0) {
    throw new Error(`API-Football ${path} error: ${JSON.stringify(body.errors)}`);
  }

  return body.response;
}

export interface RawFixture {
  fixture: {
    id: number;
    date: string;
    venue: { name: string | null } | null;
  };
  league: { name: string; logo: string | null; round: string | null };
  teams: { home: Club; away: Club };
}

/**
 * Retries a rate-limited call on a short budget.
 *
 * A cold render fans out over every Club at once, so a burst can push the last few
 * over the per-minute cap. Without this they resolved to "no fixtures" and the club
 * silently vanished from the published Schedule. The budget is deliberately small —
 * this can run while somebody waits for a page — and only rate limits are retried;
 * a bad key or an exhausted daily quota fails immediately.
 */
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MS = 1_500;

export async function getUpcomingFixtures(
  teamId: number,
  count: number,
): Promise<RawFixture[]> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestApiFootball<RawFixture[]>(
        "fixtures",
        { team: teamId, next: count },
        { revalidate: FIXTURES_TTL_SECONDS },
      );
    } catch (error) {
      if (!(error instanceof RateLimitedError) || attempt >= RATE_LIMIT_RETRIES) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, RATE_LIMIT_BACKOFF_MS * 2 ** attempt),
      );
    }
  }
}
