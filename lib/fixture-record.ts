import { repairMojibake } from "./text.ts";
import type { RawFixtureRecord, Side, Source } from "./types.ts";

/**
 * Turns an upstream fixture into the record we commit.
 *
 * Both kinds of Fixture come through here — Club Fixtures from a Club's calendar,
 * Internationals from a National Team's — because both are stored in the same
 * trimmed upstream shape, and both arrive with the same rough edges.
 */

/**
 * The upstream record as loosely as the provider actually sends it, rather than
 * as we store it. An International arrives with a null venue and a bare numeric
 * round where a Club Fixture carries "Regular Season - 5", so the fields we
 * normalise are typed here for what they may really be.
 */
export interface UpstreamFixture {
  fixture: { id: number; date: string; venue?: { name?: string | null } | null };
  league: { name: string; logo?: string | null; round?: string | number | null };
  teams: { home: Side; away: Side };
}

/**
 * Keeps only the fields the app renders. The upstream record is several times
 * larger, and the rest would just bloat a committed file.
 */
export function trimFixtureRecord(raw: UpstreamFixture): RawFixtureRecord {
  return {
    fixture: {
      id: raw.fixture.id,
      date: raw.fixture.date,
      venue: raw.fixture.venue?.name ? { name: raw.fixture.venue.name } : null,
    },
    league: {
      name: repairMojibake(raw.league.name),
      logo: raw.league.logo ?? null,
      round: roundLabel(raw.league.round),
    },
    teams: {
      home: trimSide(raw.teams.home),
      away: trimSide(raw.teams.away),
    },
  };
}

/**
 * The Source to credit a stored record to.
 *
 * A record that names one is believed; anything else came from the fetch that
 * wrote the file, which is API-Football. Storing the field only when it differs
 * keeps the same credit off hundreds of identical rows, and — more to the point —
 * means every published Fixture has an answer here, so the site can never fall
 * back to a site-wide claim that would credit the API for a match a human typed in.
 */
export function fixtureSource(record: Pick<RawFixtureRecord, "source">): Source {
  return record.source ?? "API-Football";
}

export function trimSide(side: Side): Side {
  return { id: side.id, name: repairMojibake(side.name), logo: side.logo };
}

/**
 * The round as text, whatever it arrived as. Internationals carry a bare number
 * where Club Fixtures carry a phrase, and a number written into the committed
 * file would be read back as a string the app never got.
 */
function roundLabel(round: string | number | null | undefined): string | null {
  if (round === null || round === undefined || round === "") return null;
  return String(round);
}
