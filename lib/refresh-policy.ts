const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * A match closer than this is worth re-checking every run: kickoff times move for
 * TV, and cup ties get drawn, but almost always near the date rather than months out.
 */
export const IMMINENT_MS = 3 * DAY_MS;

/**
 * Slightly under a day, so a daily job re-fetches imminent clubs every run even if
 * it starts a few minutes early.
 */
export const FRESH_ENOUGH_MS = 20 * HOUR_MS;

/** Nothing goes unchecked longer than this, however quiet the club looks. */
export const MAX_AGE_MS = 4 * DAY_MS;

export interface RefreshCandidate {
  /** When this club was last fetched, or null if never. */
  lastFetchedAt: string | null;
  /** Epoch ms of the club's earliest stored upcoming match, or null if none. */
  nextKickoff: number | null;
}

/**
 * Decides whether a Club's fixtures need re-fetching.
 *
 * One call returns a club's next ~20 matches, which for most clubs already reaches
 * months past the 21-day window we display — 35 of 39 clubs, when this was written.
 * Re-fetching every club every day therefore spent most of its calls re-downloading
 * data that had not changed, which matters on a tier that allows 100 a day.
 *
 * So: clubs playing within a few days are re-checked every run, because those are the
 * fixtures that move and the ones people are actually looking at. Everything else is
 * re-checked every few days regardless, which also retries clubs that are between
 * seasons and currently return nothing.
 */
export function needsRefresh(candidate: RefreshCandidate, now: number): boolean {
  if (!candidate.lastFetchedAt) return true;

  const age = now - Date.parse(candidate.lastFetchedAt);
  if (!Number.isFinite(age) || age < 0) return true;
  if (age >= MAX_AGE_MS) return true;

  const playingSoon =
    candidate.nextKickoff !== null && candidate.nextKickoff - now < IMMINENT_MS;

  return playingSoon && age >= FRESH_ENOUGH_MS;
}
