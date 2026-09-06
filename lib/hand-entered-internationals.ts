import { syntheticFixtureId } from "./ids.ts";
import type { RawFixtureRecord, Side, Source, Squad } from "./types.ts";

/**
 * The human-in-the-loop end of the NFSBiH chain: an International a maintainer
 * typed in from the federation's own announcement, because the upstream API does
 * not carry it.
 *
 * NFSBiH publishes prose, not fixtures — its national team pages are news
 * articles, so no automated second fixture feed can exist (see `docs/adr/0004`).
 * The daily RSS watcher raises a GitHub issue when there is national team news, a
 * human reads the article, and `data/hand-entered-internationals.json` is where
 * the fact lands. It matters most for the women's squad, who have no
 * Internationals scheduled anywhere: their 2027 World Cup qualifying group
 * finished in June 2026, so a hand entry is the only way an announced friendly
 * reaches a fan before the API catches up.
 *
 * This is the Manual Override pattern one level up: a hand-edited data file,
 * layered on at read time, never written by the refresh and so never overwritten
 * by one.
 */

/**
 * A hand entry credits the Source it actually came from, and the API is not one of
 * them. Typed as an exclusion rather than as `Source` so that the one mistake this
 * whole feature exists to prevent — presenting a match a human took from the
 * federation as having come from the API — cannot be made in the data file.
 */
export type HandEnteredSource = Exclude<Source, "API-Football">;

/**
 * One International as a maintainer writes it down, which is only what the
 * federation's article actually says. Who, when, where, and whether Bosnia is at
 * home; everything else is either derived or has a sensible default, because the
 * person filling this in is doing it the evening a friendly was announced.
 */
export interface HandEnteredInternational {
  /** Kickoff as a full ISO-8601 instant, with an offset or a trailing `Z`. */
  kickoff: string;
  /** The other Side. `id` is the upstream team id if you have it; nothing keys on it. */
  opponent: { name: string; id?: number };
  /** True when Bosnia and Herzegovina is the home Side. Decides the order shown. */
  atHome: boolean;
  /** Where this came from. Stated outright, so the credit is a deliberate act. */
  source: HandEnteredSource;
  /** Defaults to "Friendly", which is what an announcement out of window means. */
  competition?: string;
  round?: string;
  /**
   * The federation names a ground where the API carries none, so this is worth
   * filling in — it is the one field a hand entry can beat the API on.
   */
  venue?: string;
  /** For the next maintainer — the article this came from. The site never shows it. */
  note?: string;
}

/**
 * `data/hand-entered-internationals.json`: one list per squad, exactly as
 * `data/overrides.json` keys the Manual Override table.
 */
export type HandEnteredInternationalsFile = Record<Squad, HandEnteredInternational[]>;

/**
 * What an entry that names no competition is. Out of a qualifying campaign, a
 * match the federation announces and the API has not yet listed is a friendly
 * nearly every time, so the default is the common answer rather than a blank.
 */
const DEFAULT_COMPETITION = "Friendly";

/**
 * The National Team's name as a Side. The id comes from the stored record's
 * `teamId`, which the refresh keeps current; only the display name is fixed here,
 * because a squad with nothing fetched — the women's, today — has no record to
 * read a name off.
 */
const BIH_SIDE_NAME: Record<Squad, string> = {
  men: "Bosnia & Herzegovina",
  women: "Bosnia & Herzegovina W",
};

/**
 * How two records are recognised as the same match: one squad, one calendar day.
 *
 * A national team plays at most once a day, so the squad and the date identify the
 * match without needing the opponent — which is the point, because the federation
 * writes "Estonija" where the API writes "Estonia" and neither the name nor a team
 * id a maintainer had to look up is reliable enough to key on.
 *
 * The day is taken in UTC so that the answer never depends on where the site is
 * rendered. Every kickoff in play is a European evening, hours clear of midnight
 * either way, so no real match straddles the boundary.
 */
const matchDay = (kickoff: number) => new Date(kickoff).toISOString().slice(0, 10);

/** NaN for anything that is not a readable instant. */
const kickoffInstant = (iso: string) => new Date(iso).getTime();

/**
 * Layers one squad's hand entries over what the refresh fetched.
 *
 * A hand entry replaces the fetched record for the same day outright rather than
 * filling in around it: the published record is credited to the federation, and a
 * record half-taken from the API carrying that credit would be a lie about where
 * it came from.
 *
 * Called at read time, from `assembleSchedule`, for the same reason Manual
 * Overrides are — `data/internationals.json` is rewritten by every refresh, so a
 * hand entry merged into it at fetch time would be lost the next morning. Kept out
 * of that file, it survives by never being in it, and an edit takes effect on the
 * next render without another API call. See `docs/adr/0003`.
 *
 * Pure, and total: an entry whose kickoff cannot be read is dropped rather than
 * thrown over. A typo in a hand-edited file should cost the one match it names —
 * visibly missing, and fixed by fixing the file — not the whole site.
 */
export function layerHandEnteredInternationals(
  fetched: readonly RawFixtureRecord[],
  entries: readonly HandEnteredInternational[],
  squad: Squad,
  teamId: number,
): RawFixtureRecord[] {
  const handEntered = entries
    .filter((entry) => Number.isFinite(kickoffInstant(entry.kickoff)))
    .map((entry) => toRecord(entry, squad, teamId));

  const replaced = new Set(
    handEntered.map((record) => matchDay(kickoffInstant(record.fixture.date))),
  );

  const kept = fetched.filter(
    (record) => !replaced.has(matchDay(kickoffInstant(record.fixture.date))),
  );

  // Unsorted: `nextInternationalWindow` sorts by instant, and doing it twice would
  // only be a chance for the two orderings to disagree.
  return [...kept, ...handEntered];
}

/**
 * A hand entry in the same stored shape as a fetched one, so that everything
 * downstream — the Window rule, the horizon, the grace period, the squad's status
 * — treats it as the International it is rather than as a special case.
 */
function toRecord(
  entry: HandEnteredInternational,
  squad: Squad,
  teamId: number,
): RawFixtureRecord {
  const bih: Side = { id: teamId, name: BIH_SIDE_NAME[squad], logo: null };
  // No crest: the federation's article carries none and fetching one would be an
  // API call, which is exactly what this path exists to do without.
  const opponent: Side = {
    id: entry.opponent.id ?? 0,
    name: entry.opponent.name,
    logo: null,
  };

  return {
    fixture: {
      // Negative, so a hand-entered match can never take an id the upstream API
      // might later hand to a different fixture. Derived from the same squad and
      // day that identify the match, so correcting the kickoff time leaves it be.
      id: syntheticFixtureId(squad, matchDay(kickoffInstant(entry.kickoff))),
      date: entry.kickoff,
      venue: entry.venue ? { name: entry.venue } : null,
    },
    league: {
      name: entry.competition ?? DEFAULT_COMPETITION,
      logo: null,
      round: entry.round ?? null,
    },
    teams: entry.atHome ? { home: bih, away: opponent } : { home: opponent, away: bih },
    // The whole point. Absent would mean API-Football; this record names the
    // Source that actually produced it and is published crediting that.
    source: entry.source,
  };
}
