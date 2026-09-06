import type { RawFixtureRecord } from "./types.ts";

/**
 * An internal seam of `lib/assemble-schedule.ts`: which of a squad's stored
 * Internationals belong to the same break in the club season, and which of those
 * breaks a fan is next planning around.
 *
 * This exists because a fan plans a fortnight, not an evening. The unit is the
 * International Window — two or three matches across one break — and showing part
 * of one is worse than showing none of it: a fan who sees "25 September" and
 * nothing else concludes the break is a single match and books the wrong weekend.
 */

/**
 * The longest gap between two Internationals that still counts as one Window.
 *
 * Fourteen days sits in a wide gap between two facts about the football calendar.
 * Matches inside a single break are three or four days apart — matchday plus
 * three — and even a long summer camp keeps its matches inside a fortnight.
 * Separate breaks are never closer than about three weeks, because club football
 * has to resume in between; the two windows in today's data are forty days apart.
 * So the threshold can move several days either way without changing an answer,
 * which is what makes it safe against a fixture being rearranged, and what makes a
 * more elaborate rule — reading competitions, or matching the FIFA calendar by
 * date — buy nothing but ways to be wrong.
 */
export const WINDOW_GAP_DAYS = 14;

const WINDOW_GAP_MS = WINDOW_GAP_DAYS * 24 * 60 * 60 * 1000;

const kickoffOf = (record: RawFixtureRecord) => new Date(record.fixture.date).getTime();

/**
 * One squad's next International Window, whole: every International from the first
 * one still to come, up to the first gap wide enough to mean club football resumed.
 *
 * Matches before `windowStart` are dropped first, so a Window already under way
 * comes back as the part still to be played rather than being replaced by the next
 * break. Returns nothing when the squad has no Internationals left — which is the
 * women's real answer, and must be read as such rather than as a failure.
 *
 * The gap is measured between consecutive matches, so a Window can span longer
 * than fourteen days by chaining. That is deliberate: a Window is a run of matches
 * with no club-sized gap in it, and four matches four days apart are one break
 * however wide the run gets.
 */
export function nextInternationalWindow(
  internationals: readonly RawFixtureRecord[],
  windowStart: Date,
): RawFixtureRecord[] {
  // Sorted by instant rather than by the date string: the stored records write
  // their offset ("+00:00") where everything the app produces writes "Z", and the
  // two do not compare as text.
  const upcoming = internationals
    .filter((record) => kickoffOf(record) >= windowStart.getTime())
    .sort((a, b) => kickoffOf(a) - kickoffOf(b));

  const window: RawFixtureRecord[] = [];
  for (const record of upcoming) {
    const previous = window[window.length - 1];
    if (previous && kickoffOf(record) - kickoffOf(previous) > WINDOW_GAP_MS) break;
    window.push(record);
  }

  return window;
}
