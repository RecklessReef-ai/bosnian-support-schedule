import { fixtureSource } from "./fixture-record.ts";
import {
  layerHandEnteredInternationals,
  type HandEnteredInternationalsFile,
} from "./hand-entered-internationals.ts";
import { nextInternationalWindow } from "./international-window.ts";
import { buildMembersByClub, mergeFixtures } from "./merge.ts";
import type {
  Fixture,
  FixturesFile,
  International,
  InternationalsFile,
  NationalTeamMember,
  RawFixtureRecord,
  Roster,
  ScheduleData,
  Squad,
  SquadInternationals,
  SquadInternationalsState,
} from "./types.ts";

/**
 * How far ahead the Schedule looks at Club Fixtures. Bounding by time rather than
 * by a match count is what a calendar wants: a fixed per-club limit silently
 * truncated clubs deep in a cup run.
 *
 * It bounds Club Fixtures only. The horizon exists to stop a dense feed sprawling
 * — 61 Members across 39 Clubs, most of them playing twice a week — and there are
 * about ten Internationals a year, which cannot sprawl. Applying it to them would
 * do nothing but cut the next International Window in half.
 */
const HORIZON_DAYS = 21;

/**
 * How long a kicked-off match stays on the Schedule. Roughly a match plus stoppage
 * and half-time, so a game in progress is still listed while a finished one drops
 * off. Fixtures come from a file now, so nothing else removes them.
 *
 * Exported only so a test can hold `IN_PROGRESS_MINUTES` in `lib/kickoff.ts` to
 * the same number. The banner's countdown has to agree with how long the feed
 * beneath it keeps a match, and nothing else would notice if they drifted.
 */
export const SHOW_AFTER_KICKOFF_MINUTES = 130;

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
  /** The Roster, with any Manual Overrides already layered on, and its own stamp. */
  roster: Roster;
  /** `data/fixtures.json` exactly as `npm run refresh:fixtures` wrote it. */
  fixturesFile: FixturesFile;
  /** `data/internationals.json` exactly as the same refresh wrote it. */
  internationalsFile: InternationalsFile;
  /**
   * `data/hand-entered-internationals.json`: Internationals a maintainer typed in
   * from the federation's announcement. Hand-edited, never written by the refresh,
   * and layered over the fetched records below rather than into the file — which
   * is what makes them survive the refresh that rewrites it.
   */
  handEnteredInternationals: HandEnteredInternationalsFile;
}

/**
 * Assembles the Schedule: the one place that decides what a fan sees and in what
 * order. Pure and total — no file reads, no clock, no network — so every rule below
 * is testable without a filesystem or a real time of day. `lib/schedule.ts` reads
 * the files and calls in here; it does no thinking of its own.
 *
 * The contract, which callers and tests both depend on:
 *
 * - Output is one chronological feed of both kinds of Fixture, not two lists.
 * - A Fixture appears exactly once, even when reachable through two National Team
 *   Members' Clubs, and lists all of them.
 * - Every Fixture declares its kind and the Source that produced it.
 * - A hand-entered International is layered over the fetched ones and replaces the
 *   fetched record for the same match, so it survives every refresh and is never
 *   credited to the upstream API.
 * - Club Fixtures obey the 21-day horizon; Internationals do not.
 * - The next International Window is returned whole, never split by a cutoff.
 * - The Roster is published whole, carrying its own gathered-at date rather than
 *   borrowing the Fixtures'.
 * - A match already kicked off stays listed for the grace period above, so a fan
 *   can confirm they have not missed it.
 * - Both squads are always reported, so a squad with nothing scheduled is named
 *   rather than absent, and never confused with one we could not reach.
 * - The same input and the same `now` always produce identical output.
 *
 * `now` is injected rather than read, because every bound here is measured from the
 * moment of rendering — not from whenever the refresh last ran — and a rule
 * measured from a hidden clock cannot be pinned by a test.
 */
export function assembleSchedule(input: ScheduleInput, now: Date): ScheduleData {
  const { members } = input.roster;
  const { fixtures: raw, generatedAt, unavailableClubs } = input.fixturesFile;

  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() - SHOW_AFTER_KICKOFF_MINUTES * 60 * 1000);

  // `mergeFixtures` is an internal seam, not part of this interface: it collapses
  // the same Fixture arriving from several Clubs' feeds and sorts the result. Its
  // own tests exercise it directly; nothing outside this module needs to know it
  // exists.
  //
  // It reaches a match through a Member's Club, which is why Internationals cannot
  // go through it: no Member's Club is Bosnia and Herzegovina, so every one of them
  // would be dropped as involving nobody. They are gathered separately below and
  // the two are sorted together at the end.
  const clubFixtures = mergeFixtures(
    raw,
    buildMembersByClub(members),
    horizonEnd,
    windowStart,
  );

  const internationals: International[] = [];
  const squadInternationals: SquadInternationalsState[] = [];

  for (const stored of input.internationalsFile.squads) {
    // Hand entries are layered on before anything else looks at the list, so a
    // match a maintainer typed in is an International like any other from here on:
    // it belongs to a Window, it is exempt from the horizon, it drops off after
    // kickoff — and, crucially, it counts towards whether this squad has anything
    // scheduled. Deriving that status from a list the hand entries had not reached
    // yet is how the site would end up saying "no matches scheduled" directly above
    // a match.
    const records = layerHandEnteredInternationals(
      stored.internationals,
      input.handEnteredInternationals[stored.squad] ?? [],
      stored.squad,
      stored.teamId,
    );

    // Per squad, because the two sides keep separate calendars: grouping their
    // matches together would let a men's break swallow a women's friendly.
    const window = nextInternationalWindow(records, windowStart);
    const squadMembers = members.filter((m) => m.squad === stored.squad);

    for (const record of window) {
      internationals.push(toInternational(record, stored.squad, squadMembers));
    }
    squadInternationals.push(stateOf(stored, window.length));
  }

  const fixtures: Fixture[] = [...clubFixtures, ...internationals].sort((a, b) =>
    a.kickoff.localeCompare(b.kickoff),
  );

  return {
    fixtures,
    // Copied, not passed through: the input is read-only because assembly must not
    // reach back and edit the Roster it was handed.
    members: [...members],
    generatedAt,
    // Two dates, never collapsed into one: the squad list and the fixtures are
    // gathered by separate refreshes, so either can be the stale half.
    rosterGeneratedAt: input.roster.generatedAt,
    degraded: raw.length === 0,
    unavailableClubs,
    squadInternationals,
  };
}

/**
 * One stored International as the Schedule publishes it.
 *
 * `members` is the whole squad rather than a couple of names, because that is what
 * involvement means here: a Member is in an International by being in the squad,
 * not by turning out for one of the two Sides. Copied per Fixture so that no two
 * entries share a list.
 */
function toInternational(
  raw: RawFixtureRecord,
  squad: Squad,
  squadMembers: readonly NationalTeamMember[],
): International {
  return {
    id: raw.fixture.id,
    kind: "international",
    kickoff: new Date(raw.fixture.date).toISOString(),
    competition: raw.league.name,
    competitionLogo: raw.league.logo,
    round: raw.league.round,
    venue: raw.fixture.venue?.name ?? null,
    home: raw.teams.home,
    away: raw.teams.away,
    source: fixtureSource(raw),
    squad,
    members: [...squadMembers],
  };
}

/**
 * What to tell a fan about one squad, which is not quite what the refresh stored.
 *
 * A successful fetch that found six matches, all since played, leaves a squad with
 * nothing coming — so "scheduled" beside an empty feed would be the site
 * contradicting itself. A failed fetch is never rewritten this way: whatever is
 * still listed, not knowing is its own answer, and folding it into "none
 * scheduled" would tell a fan the calendar is empty when we could not ask.
 */
function stateOf(
  stored: SquadInternationals,
  showing: number,
): SquadInternationalsState {
  if (stored.status === "unavailable") {
    return {
      squad: stored.squad,
      status: "unavailable",
      fetchedAt: stored.fetchedAt,
      unavailableReason: stored.unavailableReason,
    };
  }

  return {
    squad: stored.squad,
    status: showing > 0 ? "scheduled" : "none-scheduled",
    fetchedAt: stored.fetchedAt,
  };
}
