/**
 * How often each surface re-renders from the committed data files.
 *
 * This used to be an API budget: rendering fetched every Club, so the interval had
 * to be long enough to stay inside the daily quota. Rendering now costs no upstream
 * calls at all, so the only thing this controls is freshness — how quickly a
 * finished match drops off and the 21-day horizon slides forward.
 *
 * An hour is comfortably short for that. What actually refreshes the *data* is
 * `npm run refresh:fixtures`, which runs offline.
 */
export const SCHEDULE_REVALIDATE_SECONDS = 3600;
