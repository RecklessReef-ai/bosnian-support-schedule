import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { refreshSquads, type SquadTeamIds } from "./national-team.ts";
import type { SquadPlayer } from "./roster.ts";
import type { Club, Squad } from "./types.ts";

/**
 * Club resolution, exercised through `refreshSquads` rather than through
 * `currentClubFor` directly.
 *
 * `currentClubFor` is private and stays private: what the rest of the system
 * depends on is the Club that lands on a Member, so that is what is asserted
 * here. Testing it through the exported call also covers the step that matters
 * to a reader of `data/roster.json` — that an unresolved Member is stamped with
 * `clubCheckedAt` and a resolved one is not.
 *
 * The national-team list is fetched once and memoised for the life of the
 * process (`nationalTeamIds`), so every test in this file deliberately answers
 * `teams?search=Bosnia` with the same list. Varying it per test would only
 * exercise whichever test happened to run first.
 */

const NATIONAL_TEAMS = [
  { team: { id: 1113, name: "Bosnia & Herzegovina", logo: null, national: true } },
  { team: { id: 17943, name: "Bosnia-Herzegovina U17", logo: null, national: true } },
  { team: { id: 14455, name: "Bosnia-Herzegovina W", logo: null, national: true } },
];

const TEAM_IDS: SquadTeamIds = { men: 1113, women: 14455 };

const BORAC: Club = { id: 3364, name: "Borac Banja Luka", logo: null };
const SFK_2000: Club = { id: 10902, name: "SFK 2000 W", logo: null };
const ZELJEZNICAR: Club = { id: 3361, name: "Zeljeznicar", logo: null };

interface HistoryRow {
  team: Club;
  seasons: number[];
}

const player = (over: Partial<SquadPlayer> = {}): SquadPlayer => ({
  id: 446130,
  name: "M. Jurkas",
  photo: "https://media.api-sports.io/football/players/446130.png",
  position: "Goalkeeper",
  ...over,
});

/**
 * Stands in for the paced client. Answers the three calls squad resolution makes
 * and throws on anything else, so a call this fake does not model fails loudly
 * rather than resolving to undefined.
 */
function fakeApi(
  squads: Partial<Record<Squad, SquadPlayer[]>>,
  history: Record<number, HistoryRow[]>,
) {
  return async <T,>(path: string, params: Record<string, string | number>): Promise<T> => {
    if (path === "teams") return NATIONAL_TEAMS as T;
    if (path === "players/squads") {
      const squad = Number(params.team) === TEAM_IDS.women ? "women" : "men";
      return [{ players: squads[squad] ?? [] }] as T;
    }
    if (path === "players/teams") return (history[Number(params.player)] ?? []) as T;
    throw new Error(`unexpected call: ${path}`);
  };
}

const resolveOne = async (
  squad: Squad,
  subject: SquadPlayer,
  rows: HistoryRow[],
) => {
  const { members } = await refreshSquads(
    fakeApi({ [squad]: [subject] }, { [subject.id]: rows }),
    TEAM_IDS,
  );
  return members[0];
};

describe("refreshSquads club resolution", () => {
  // The regression. Upstream names Borac Banja Luka for M. Jurkas (446130) but
  // carries no seasons for the row; the two rows that do carry seasons are both
  // national teams and are filtered out. Skipping every seasonless row therefore
  // discarded the only Club upstream offered and left him "no club resolved" on
  // the published squad list — and with him out, Borac never entered the tracked
  // club list in data/fixtures.json, so that club's fixtures went unpublished.
  it("resolves a Club from a history row that carries no seasons", async () => {
    const member = await resolveOne("men", player(), [
      { team: { id: 1113, name: "Bosnia & Herzegovina", logo: null }, seasons: [2026] },
      {
        team: { id: 17943, name: "Bosnia-Herzegovina U17", logo: null },
        seasons: [2025, 2024, 2023],
      },
      { team: BORAC, seasons: [] },
    ]);

    assert.deepEqual(member.club, BORAC);
    assert.equal(member.clubCheckedAt, undefined);
  });

  // Both unresolved women (213456, 213398) look like this upstream: one row, one
  // club, no seasons.
  it("resolves a Club when the seasonless row is the only history there is", async () => {
    const member = await resolveOne(
      "women",
      player({ id: 213456, name: "E. Hasanbegović", position: "Goalkeeper" }),
      [{ team: SFK_2000, seasons: [] }],
    );

    assert.deepEqual(member.club, SFK_2000);
  });

  // A seasonless row is a fallback, not a candidate: it says nothing about when
  // the Member was there, so anything actually dated is the better answer.
  it("prefers a dated Club over a seasonless one, whichever comes first", async () => {
    const member = await resolveOne("men", player(), [
      { team: BORAC, seasons: [] },
      { team: ZELJEZNICAR, seasons: [2025] },
    ]);

    assert.deepEqual(member.club, ZELJEZNICAR);
  });

  it("takes the most recent dated Club", async () => {
    const member = await resolveOne("men", player(), [
      { team: ZELJEZNICAR, seasons: [2021, 2022] },
      { team: BORAC, seasons: [2024] },
    ]);

    assert.deepEqual(member.club, BORAC);
  });

  // The thirteen Members upstream holds no team history for at all. They are not
  // fixable here at any severity, and this fix must not invent a Club for them:
  // the squad list renders an explicit "no club resolved" and that stays true.
  it("leaves a Member with no Club when upstream returns no history", async () => {
    const member = await resolveOne(
      "women",
      player({ id: 213752, name: "A. Hodžić", position: "Defender" }),
      [],
    );

    assert.equal(member.club, null);
    assert.equal(typeof member.clubCheckedAt, "string");
  });

  // And the one whose only row is the national team itself (299196).
  it("leaves a Member with no Club when the only row is a National Team", async () => {
    const member = await resolveOne(
      "women",
      player({ id: 299196, name: "N. Milović", position: "Defender" }),
      [{ team: { id: 14455, name: "Bosnia-Herzegovina W", logo: null }, seasons: [] }],
    );

    assert.equal(member.club, null);
    assert.equal(typeof member.clubCheckedAt, "string");
  });

  it("reports the Members left without a Club", async () => {
    const { unresolved } = await refreshSquads(
      fakeApi(
        { men: [player()], women: [player({ id: 213752, name: "A. Hodžić" })] },
        { 446130: [{ team: BORAC, seasons: [] }], 213752: [] },
      ),
      TEAM_IDS,
    );

    assert.deepEqual(unresolved, ["women: A. Hodžić"]);
  });
});
