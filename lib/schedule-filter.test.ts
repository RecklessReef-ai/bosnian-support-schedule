import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleFixtures } from "./schedule-filter.ts";
import type {
  ClubFixture,
  Fixture,
  International,
  NationalTeamMember,
  Squad,
} from "./types.ts";

function member(id: number, name: string, squad: Squad): NationalTeamMember {
  return { id, name, photo: null, position: null, squad, club: null };
}

const dzeko = member(1, "Edin Džeko", "men");
const tahirovic = member(2, "Benjamin Tahirović", "men");
const nikolic = member(3, "Milena Nikolić", "women");

function side(id: number, name: string) {
  return { id, name, logo: null };
}

function clubFixture(id: number, members: NationalTeamMember[]): ClubFixture {
  return {
    id,
    kind: "club",
    kickoff: "2026-09-12T18:00:00.000Z",
    competition: "Serie A",
    competitionLogo: null,
    round: null,
    venue: null,
    home: side(100, "Fenerbahçe"),
    away: side(101, "Beşiktaş"),
    source: "API-Football",
    members,
  };
}

function international(
  id: number,
  squad: Squad,
  members: NationalTeamMember[] = [],
): International {
  return {
    id,
    kind: "international",
    kickoff: "2026-10-02T18:45:00.000Z",
    competition: "UEFA Nations League",
    competitionLogo: null,
    round: "1",
    venue: null,
    home: side(200, "Bosnia and Herzegovina"),
    away: side(201, "Sweden"),
    source: "API-Football",
    squad,
    members,
  };
}

const mensInternational = international(10, "men", [dzeko, tahirovic]);
const womensInternational = international(11, "women", [nikolic]);
const dzekosClubFixture = clubFixture(20, [dzeko]);
const womensClubFixture = clubFixture(21, [nikolic]);

const all: Fixture[] = [
  mensInternational,
  womensInternational,
  dzekosClubFixture,
  womensClubFixture,
];

const ids = (fixtures: Fixture[]) => fixtures.map((f) => f.id);

describe("visibleFixtures", () => {
  it("shows everything when nothing is filtered", () => {
    assert.deepEqual(
      ids(visibleFixtures(all, { squad: "all", member: null })),
      [10, 11, 20, 21],
    );
  });

  it("keeps a Member's own squad's International when filtering to them", () => {
    // A Member is in an International by being in the squad, so narrowing to one
    // name must not hide the match a fan filtering to their favourite is after.
    assert.deepEqual(
      ids(visibleFixtures(all, { squad: "all", member: dzeko })),
      [10, 20],
    );
  });

  it("hides the other squad's Internationals even with the squad filter on 'all'", () => {
    assert.deepEqual(
      ids(visibleFixtures(all, { squad: "all", member: nikolic })),
      [11, 21],
    );
  });

  it("keeps a Member's International even when they are not named on it", () => {
    // The rule is squad membership, not the attached list — so it still holds for a
    // squad whose Roster came back empty.
    const emptyRoster = international(12, "men");
    assert.deepEqual(
      ids(
        visibleFixtures([emptyRoster, womensInternational], {
          squad: "all",
          member: dzeko,
        }),
      ),
      [12],
    );
  });

  it("lets an explicit squad filter win where both are set", () => {
    assert.deepEqual(
      ids(visibleFixtures(all, { squad: "men", member: nikolic })),
      [10],
    );
  });

  it("scopes both kinds to the squad filter on its own", () => {
    assert.deepEqual(ids(visibleFixtures(all, { squad: "women", member: null })), [
      11, 21,
    ]);
  });

  it("keeps a Club Fixture only for the Members actually playing in it", () => {
    assert.deepEqual(
      ids(visibleFixtures([dzekosClubFixture], { squad: "all", member: tahirovic })),
      [],
    );
  });
});
