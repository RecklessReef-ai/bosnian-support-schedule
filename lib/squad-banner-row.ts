import { formatCountdown } from "./kickoff.ts";
import type { International, Squad, SquadInternationalsState } from "./types.ts";

/**
 * What one squad's row of the banner has to say, chosen rather than rendered.
 *
 * Four answers, and the difference between them is the feature. "We could not
 * ask" and "there is nothing on" are opposite claims about the world, and either
 * one told in place of the other sends a fan away — one stops checking back
 * because the calendar looked empty, the other keeps checking a calendar that
 * genuinely is. `couldNotRefresh` is the case that has no separate row: the squad
 * has a known next match *and* the data behind it is stale, which are two facts
 * rather than two alternatives.
 */
export type SquadBannerRow =
  | {
      show: "next-international";
      next: International;
      /** True when the last fetch failed, so this match is the last thing stored. */
      couldNotRefresh: boolean;
    }
  | { show: "unavailable" }
  | { show: "all-played" }
  | { show: "none-scheduled" };

/**
 * Everything the choice depends on. Both squads' worth of each list is handed
 * over and narrowed here rather than by the caller, so "which squad does this row
 * speak for" is answered in one tested place instead of at two call sites.
 */
export interface SquadBannerRowInput {
  squad: Squad;
  /** Both squads' assembled states, as `ScheduleData.squadInternationals` gives them. */
  states: readonly SquadInternationalsState[];
  /** The Schedule's Internationals, both squads', chronologically. */
  internationals: readonly International[];
  /**
   * The current instant, or null before hydration. Null is not "unknown time" —
   * it is the server's answer, and it deliberately picks the first stored match so
   * that the markup React renders on each side of hydration agrees.
   */
  now: Date | null;
}

/**
 * Decides what the banner tells a fan about one squad.
 *
 * Pure and total, and it lives here rather than in the component because the order
 * of these four questions is the whole rule and a component is where nothing can
 * test it. The order it settled on:
 *
 * 1. A match still ahead wins, whatever the fetch did. Assembly keeps a failed
 *    squad's last-stored Internationals on purpose, and the feed a few hundred
 *    pixels below is already listing them — a banner that answered "we could not
 *    ask" there would be contradicting the page it sits on. The staleness travels
 *    with the answer instead of replacing it.
 * 2. Otherwise a failed or missing fetch is the answer. With nothing left to count
 *    down to there is nothing to qualify, and "reload for what comes next" would
 *    promise a refresh we already know is failing.
 * 3. Otherwise stored matches that have all been played say so. Only a tab left
 *    open past the end of an International Window reaches this.
 * 4. Otherwise the calendar really is empty, which is a fact about the world and
 *    not a symptom — the women's squad today.
 *
 * A squad with no state at all is treated as unavailable rather than as an empty
 * calendar: not knowing is the honest reading of silence, and inventing an empty
 * calendar from it is the exact error the distinction exists to prevent.
 */
export function squadBannerRow({
  squad,
  states,
  internationals,
  now,
}: SquadBannerRowInput): SquadBannerRow {
  const state = states.find((candidate) => candidate.squad === squad);
  const stored = internationals.filter(
    (international) => international.squad === squad,
  );
  const couldNotRefresh = state === undefined || state.status === "unavailable";

  // Assembly already dropped everything past its grace period when the page was
  // rendered, so before hydration the first stored match is the right one — and
  // picking it the same way on both sides of hydration is what keeps the markup
  // from mismatching.
  const next = now
    ? stored.find((one) => formatCountdown(one.kickoff, now).status !== "finished")
    : stored[0];

  if (next) return { show: "next-international", next, couldNotRefresh };
  if (couldNotRefresh) return { show: "unavailable" };
  if (stored.length > 0) return { show: "all-played" };
  return { show: "none-scheduled" };
}
