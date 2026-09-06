import type { RawFixtureRecord, Squad, SquadInternationals } from "./types.ts";

/**
 * What the daily refresh records about a squad's own matches.
 *
 * The whole job of this module is to keep three outcomes apart: a squad with
 * Internationals coming up, a squad with none scheduled, and a squad we could not
 * ask. The second and third look identical at the point of fetching — both are an
 * empty list — and the Club Fixture refresh already learned that lesson the hard
 * way, publishing a Schedule missing twelve Clubs because a rate-limited fetch was
 * indistinguishable from a Club with no matches.
 */

/** The outcome of asking upstream for one squad's Internationals. */
export type InternationalsFetch =
  | { ok: true; internationals: readonly RawFixtureRecord[] }
  | { ok: false; reason: string };

export interface SquadInternationalsInput {
  squad: Squad;
  /** The National Team's upstream team id. */
  teamId: number;
  result: InternationalsFetch;
  /** What the last refresh stored for this squad, if anything. */
  previous?: SquadInternationals;
  /** When this run fetched, as an ISO-8601 instant. */
  fetchedAt: string;
}

/**
 * Folds one squad's fetch into the record committed to data/internationals.json.
 *
 * A successful fetch is believed, including when it returns nothing: the women's
 * squad has no Internationals scheduled at all, which is a fact about the world
 * and is recorded as one. A failed fetch keeps whatever was last stored and says
 * so, so a fan is never told there is nothing coming when we simply could not
 * find out.
 */
export function recordSquadInternationals(
  input: SquadInternationalsInput,
): SquadInternationals {
  const { squad, teamId, result, previous, fetchedAt } = input;

  if (!result.ok) {
    return {
      squad,
      teamId,
      status: "unavailable",
      // The stamp belongs to the data, not the attempt: it says how old what we
      // hold is, and stays null while we have never held anything.
      fetchedAt: previous?.fetchedAt ?? null,
      unavailableReason: result.reason,
      internationals: previous?.internationals ?? [],
    };
  }

  const internationals = [...result.internationals].sort((a, b) =>
    a.fixture.date.localeCompare(b.fixture.date),
  );

  return {
    squad,
    teamId,
    status: internationals.length > 0 ? "scheduled" : "none-scheduled",
    fetchedAt,
    internationals,
  };
}
