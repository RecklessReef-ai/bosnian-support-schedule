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
 *
 * Being hand-edited is also why the types below are not the last word on it. A
 * file no script writes is the one input the compiler never sees, so
 * `readHandEnteredInternationals` checks it as it is read, and an entry that fails
 * is dropped with a complaint rather than published.
 */

/**
 * A hand entry credits the Source it actually came from, and the API is not one of
 * them. Typed as an exclusion rather than as `Source` so that the one mistake this
 * whole feature exists to prevent — presenting a match a human took from the
 * federation as having come from the API — cannot be made in code.
 *
 * The data file is not code, though, and it is where the mistake would actually be
 * made: a maintainer types `"source": "API-Football"` and the compiler never sees
 * it. `readHandEnteredInternationals` holds the same line at runtime.
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
 * What comes off disk: hand-edited JSON, and so anything at all.
 *
 * Named rather than left as a bare `unknown` because the shape above is a promise
 * about a file nobody has checked yet, and a cast to it would be this app telling
 * itself a maintainer never mistypes. `readHandEnteredInternationals` is the only
 * way across.
 */
export type UncheckedHandEnteredInternationalsFile = unknown;

/**
 * The file as read: the entries worth publishing, and a plain-English complaint
 * about every one that was refused.
 *
 * Complaints are returned rather than logged from here so that reading stays pure
 * and a test can read the words a maintainer would. `lib/schedule.ts` is what puts
 * them in the server log.
 */
export interface HandEnteredInternationalsRead {
  entries: HandEnteredInternationalsFile;
  /** One line per refused entry, naming it and saying what is wrong with it. */
  rejections: string[];
}

/** Named in every complaint, so one line pasted out of a log stands on its own. */
const FILE = "data/hand-entered-internationals.json";

/** An example kickoff, quoted at anyone who wrote one this file could not read. */
const KICKOFF_EXAMPLE = '"2026-11-28T18:00:00+01:00"';

/**
 * A full ISO-8601 instant, and nothing looser.
 *
 * `new Date` would take a great deal more, which is the danger rather than the
 * convenience: it reads "28 November" as the year 2001, and "2026-11-28 18:00" as
 * a time in whatever zone the server happens to keep. Both are things a maintainer
 * copying a date out of a Bosnian news article might reasonably write, and both
 * fail silently — the first vanishes as a match long past, the second moves the
 * kickoff by an hour or two. So the zone has to be written down.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * The Sources a hand entry may name, as a table rather than a list so that a new
 * `Source` is a compile error here until someone decides whether a human may
 * credit it. The API's own name is absent by construction: `HandEnteredSource`
 * excludes it, which is the rule this whole check exists to enforce at runtime.
 */
const HAND_ENTERED_SOURCES: Record<HandEnteredSource, true> = { NFSBiH: true };

/** The one Source a hand entry may never claim. */
const API_SOURCE: Source = "API-Football";

/** Both squads, in the order the file lists them. */
const SQUADS: readonly Squad[] = ["men", "women"];

/** The optional fields, all of them free text the maintainer copies out of an article. */
const TEXT_FIELDS = ["competition", "round", "venue", "note"] as const;

/**
 * Reads the hand-entered file, keeping the entries that are usable and refusing
 * the ones that are not.
 *
 * A refused entry is dropped with a complaint rather than thrown over, and this is
 * the deliberate half of the decision. The file is read at render time, so a throw
 * here is a blank site — every Club Fixture, both squads, the whole Roster — for a
 * typo in one optional line. Dropping costs exactly the match it names: visibly
 * absent, complained about in the log, and fixed by fixing the file. The same
 * trade `layerHandEnteredInternationals` already made for an unreadable kickoff,
 * now made for every field.
 *
 * The complaint has to carry the whole story, because nobody will be reading this
 * source when they see it: it names the file, the entry, and what is wrong with
 * that entry in the same words `data/README.md` uses.
 */
export function readHandEnteredInternationals(
  file: UncheckedHandEnteredInternationalsFile,
): HandEnteredInternationalsRead {
  const entries: HandEnteredInternationalsFile = { men: [], women: [] };
  const rejections: string[] = [];
  const reject = (complaint: string) => rejections.push(`${FILE}: ${complaint}`);

  if (!isRecord(file)) {
    reject(
      'the file is not a JSON object; it holds one list per squad, as {"men": [], "women": []}.',
    );
    return { entries, rejections };
  }

  // A misspelled squad key is silent otherwise — the entries under it are simply
  // never looked at — and "womens" is exactly the kind of thing a hand edit does.
  for (const key of Object.keys(file)) {
    if (!isSquad(key)) {
      reject(
        `"${key}" is not a squad, so nothing under it is published; the two keys are "men" and "women".`,
      );
    }
  }

  for (const squad of SQUADS) {
    const list = file[squad];
    // An absent squad is an empty one. The committed file lists both, but a
    // maintainer adding a women's friendly should not have to know that.
    if (list === undefined) continue;

    if (!Array.isArray(list)) {
      reject(
        `"${squad}" is not a list, so none of it is published; write [] when that squad has nothing to add.`,
      );
      continue;
    }

    // Which entry has already claimed each day. A squad plays at most once a day —
    // the fact the whole replacement rule rests on — so two entries on one day are
    // one match written down twice, most likely an edit that was meant to correct
    // the first. Published, they would be two Fixtures sharing a synthetic id,
    // which is derived from exactly this squad and day.
    const claimed = new Map<string, number>();

    list.forEach((candidate, index) => {
      const entry = readEntry(candidate, squad, index, reject);
      if (!entry) return;

      const day = matchDay(kickoffInstant(entry.kickoff));
      const first = claimed.get(day);
      if (first !== undefined) {
        reject(
          `${squad}[${index}] (${entry.opponent.name}, ${entry.kickoff}) is a second ${squad}'s match on ${day}, a day ${squad}[${first}] already claims; a squad plays at most once a day, so delete whichever of the two is out of date.`,
        );
        return;
      }

      claimed.set(day, index);
      entries[squad].push(entry);
    });
  }

  return { entries, rejections };
}

/**
 * One entry, or nothing plus the reasons why.
 *
 * Every field is checked before anything is refused, so a maintainer fixing a file
 * sees all of what is wrong with an entry at once rather than one fault per
 * deploy. An entry with any fault at all is dropped whole: a match published
 * without the venue the article gave it would be quietly worse than one that is
 * visibly missing.
 */
function readEntry(
  candidate: unknown,
  squad: Squad,
  index: number,
  reject: (complaint: string) => void,
): HandEnteredInternational | null {
  const at = `${squad}[${index}]`;

  if (!isRecord(candidate)) {
    reject(
      `${at} is not an object; each entry names a kickoff, an opponent, atHome and a source.`,
    );
    return null;
  }

  const where = `${at}${describeEntry(candidate)}`;
  const problems: string[] = [];

  let kickoff: string | null = null;
  if (typeof candidate.kickoff !== "string") {
    problems.push(
      `has no "kickoff"; give the kickoff as an ISO-8601 instant, e.g. ${KICKOFF_EXAMPLE}.`,
    );
  } else if (
    !ISO_INSTANT.test(candidate.kickoff) ||
    !Number.isFinite(kickoffInstant(candidate.kickoff))
  ) {
    problems.push(
      `has a "kickoff" of ${JSON.stringify(candidate.kickoff)}, which is not a readable instant; write ISO-8601 with the offset or a trailing Z, e.g. ${KICKOFF_EXAMPLE}.`,
    );
  } else {
    kickoff = candidate.kickoff;
  }

  let otherSide: HandEnteredInternational["opponent"] | null = null;
  const named = isRecord(candidate.opponent) ? candidate.opponent : null;
  const name = typeof named?.name === "string" ? named.name.trim() : "";
  const id = named?.id;
  if (name === "") {
    problems.push(
      `does not name the other Side; write "opponent": { "name": "Estonia" }, spelled in English as the API spells it.`,
    );
  } else if (id !== undefined && typeof id !== "number") {
    problems.push(
      `has an "opponent" id of ${JSON.stringify(id)}, which has to be the upstream team id as a number; leave it out if you do not have it.`,
    );
  } else {
    otherSide = typeof id === "number" ? { name, id } : { name };
  }

  let atHome: boolean | null = null;
  if (typeof candidate.atHome !== "boolean") {
    problems.push(
      `has no "atHome"; write true when Bosnia and Herzegovina is the home Side and false when it is away.`,
    );
  } else {
    atHome = candidate.atHome;
  }

  let source: HandEnteredSource | null = null;
  if (candidate.source === API_SOURCE) {
    // The mistake this whole check was added for. The entry is a match a human
    // read in the federation's own announcement; publishing it as the API's would
    // be the site claiming a fact it was never told.
    problems.push(
      `credits "source": ${JSON.stringify(API_SOURCE)}, which this file never may: it holds Internationals a maintainer took from the federation's announcement, so name the Source that actually produced it — "NFSBiH".`,
    );
  } else if (!isHandEnteredSource(candidate.source)) {
    problems.push(
      `has a "source" of ${JSON.stringify(candidate.source)}, which is not a Source this file accepts; write "NFSBiH", the federation that announced the match.`,
    );
  } else {
    source = candidate.source;
  }

  const text: Partial<Record<(typeof TEXT_FIELDS)[number], string>> = {};
  for (const field of TEXT_FIELDS) {
    const value = candidate[field];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      problems.push(
        `has a "${field}" of ${JSON.stringify(value)}, which has to be text when it is there at all.`,
      );
      continue;
    }
    text[field] = value;
  }

  if (
    problems.length > 0 ||
    kickoff === null ||
    otherSide === null ||
    atHome === null ||
    source === null
  ) {
    for (const problem of problems) reject(`${where} ${problem}`);
    return null;
  }

  return { kickoff, opponent: otherSide, atHome, source, ...text };
}

/**
 * How to point a maintainer at the offending entry beyond its position. The
 * position alone is enough to find it, but an entry that says "Estonia,
 * 2026-11-28" is recognisable at a glance in a log they were not expecting to
 * read. Built from whatever is legible, since the entry is wrong by definition.
 */
function describeEntry(candidate: Record<string, unknown>): string {
  const named = isRecord(candidate.opponent) ? candidate.opponent : null;
  const parts = [named?.name, candidate.kickoff].filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSquad(key: string): key is Squad {
  return SQUADS.some((squad) => squad === key);
}

function isHandEnteredSource(value: unknown): value is HandEnteredSource {
  return typeof value === "string" && Object.hasOwn(HAND_ENTERED_SOURCES, value);
}

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
 * Takes entries that have been through `readHandEnteredInternationals`, which is
 * what turns a hand-edited file into these. The kickoff filter below is therefore
 * a second line rather than the first: it keeps this function total on its own
 * terms, so that calling it with something unchecked cannot throw an unreadable
 * date over the whole render.
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
