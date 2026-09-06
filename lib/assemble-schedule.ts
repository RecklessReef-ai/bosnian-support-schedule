import { buildMembersByClub, mergeFixtures } from "./merge.ts";
import type {
  FixturesFile,
  NationalTeamMember,
  ScheduleData,
} from "./types.ts";

/**
 * How far ahead the Schedule looks. Bounding by time rather than by a match count
 * is what a calendar wants: a fixed per-club limit silently truncated clubs deep
 * in a cup run.
 */
const HORIZON_DAYS = 21;

/**
 * How long a kicked-off match stays on the Schedule. Roughly a match plus stoppage
 * and half-time, so a game in progress is still listed while a finished one drops
 * off. Fixtures come from a file now, so nothing else removes them.
 */
const SHOW_AFTER_KICKOFF_MINUTES = 130;

/**
 * Everything the Schedule is assembled from, as one object rather than a handful
 * of positional arguments.
 *
 * One object because the set of things the Schedule is built from grows — the
 * Internationals are coming — and a new field should not mean editing every call
 * site and every test's setup. It is also the whole of what `assembleSchedule`
 * knows: if it isn't in here or in the injected timestamp, the Schedule cannot
 * depend on it.
 */
export interface ScheduleInput {
  /** The Roster, with any Manual Overrides already layered on. */
  members: readonly NationalTeamMember[];
  /** `data/fixtures.json` exactly as `npm run refresh:fixtures` wrote it. */
  fixturesFile: FixturesFile;
}

/**
 * Assembles the Schedule: the one place that decides what a fan sees and in what
 * order. Pure and total — no file reads, no clock, no network — so every rule below
 * is testable without a filesystem or a real time of day. `lib/schedule.ts` reads
 * the files and calls in here; it does no thinking of its own.
 *
 * The contract, which callers and tests both depend on:
 *
 * - Output is ordered chronologically.
 * - A Fixture appears exactly once, even when reachable through two National Team
 *   Members' Clubs, and lists all of them.
 * - Club Fixtures obey the 21-day horizon.
 * - A match already kicked off stays listed for the grace period above, so a fan
 *   can confirm they have not missed it.
 * - The same input and the same `now` always produce identical output.
 *
 * `now` is injected rather than read, because both bounds are measured from the
 * moment of rendering — not from whenever the refresh last ran — and a rule
 * measured from a hidden clock cannot be pinned by a test.
 */
export function assembleSchedule(input: ScheduleInput, now: Date): ScheduleData {
  const { members } = input;
  const { fixtures: raw, generatedAt, unavailableClubs } = input.fixturesFile;

  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() - SHOW_AFTER_KICKOFF_MINUTES * 60 * 1000);

  // `mergeFixtures` is an internal seam, not part of this interface: it collapses
  // the same Fixture arriving from several Clubs' feeds and sorts the result. Its
  // own tests exercise it directly; nothing outside this module needs to know it
  // exists.
  const fixtures = mergeFixtures(
    raw,
    buildMembersByClub(members),
    horizonEnd,
    windowStart,
  );

  return {
    fixtures,
    // Copied, not passed through: the input is read-only because assembly must not
    // reach back and edit the Roster it was handed.
    members: [...members],
    generatedAt,
    degraded: raw.length === 0,
    unavailableClubs,
  };
}
