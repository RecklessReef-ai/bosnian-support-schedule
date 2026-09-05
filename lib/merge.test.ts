import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RawFixture } from "./api-football.ts";
import { buildMembersByClub, mergeFixtures } from "./merge.ts";
import type { NationalTeamMember } from "./types.ts";

function member(id: number, name: string, clubId: number): NationalTeamMember {
  return {
    id,
    name,
    photo: null,
    position: null,
    squad: "men",
    club: { id: clubId, name: `Club ${clubId}`, logo: null },
  };
}

function raw(id: number, date: string, homeId: number, awayId: number): RawFixture {
  return {
    fixture: { id, date, venue: { name: "Ground" } },
    league: { name: "League", logo: null, round: "R1" },
    teams: {
      home: { id: homeId, name: `Club ${homeId}`, logo: null },
      away: { id: awayId, name: `Club ${awayId}`, logo: null },
    },
  };
}

const HORIZON = new Date("2026-10-01T00:00:00.000Z");

describe("buildMembersByClub", () => {
  it("groups members by club and skips those without one", () => {
    const clubless: NationalTeamMember = { ...member(3, "C", 0), club: null };
    const map = buildMembersByClub([
      member(1, "A", 10),
      member(2, "B", 10),
      clubless,
    ]);
    assert.equal(map.size, 1);
    assert.deepEqual(map.get(10)?.map((m) => m.name), ["A", "B"]);
  });
});

describe("mergeFixtures", () => {
  const byClub = buildMembersByClub([
    member(1, "A", 10),
    member(2, "B", 10),
    member(3, "C", 20),
  ]);

  it("collapses teammates into a single fixture", () => {
    const out = mergeFixtures([raw(100, "2026-09-10T18:00:00Z", 10, 99)], byClub, HORIZON);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].members.map((m) => m.name), ["A", "B"]);
  });

  it("collapses the same fixture arriving from both clubs' feeds", () => {
    // Club 10 and club 20 both return this head-to-head.
    const head = raw(200, "2026-09-10T18:00:00Z", 10, 20);
    const out = mergeFixtures([head, head], byClub, HORIZON);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].members.map((m) => m.name), ["A", "B", "C"]);
  });

  it("sorts chronologically across clubs", () => {
    const out = mergeFixtures(
      [
        raw(1, "2026-09-20T18:00:00Z", 20, 99),
        raw(2, "2026-09-08T18:00:00Z", 10, 99),
        raw(3, "2026-09-14T18:00:00Z", 10, 99),
      ],
      byClub,
      HORIZON,
    );
    assert.deepEqual(out.map((f) => f.id), [2, 3, 1]);
  });

  // The bug this guards: a fixed `next: 5` per club silently truncated busy
  // clubs, so cup and continental ties past the fifth match vanished.
  it("keeps every fixture inside the horizon, however many a club has", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      raw(300 + i, `2026-09-${String(i + 2).padStart(2, "0")}T18:00:00Z`, 10, 99),
    );
    const out = mergeFixtures(many, byClub, HORIZON);
    assert.equal(out.length, 12);
  });

  it("drops fixtures beyond the horizon", () => {
    const out = mergeFixtures(
      [
        raw(1, "2026-09-10T18:00:00Z", 10, 99),
        raw(2, "2026-11-10T18:00:00Z", 10, 99),
      ],
      byClub,
      HORIZON,
    );
    assert.deepEqual(out.map((f) => f.id), [1]);
  });

  it("ignores fixtures for clubs nobody plays for", () => {
    const out = mergeFixtures([raw(1, "2026-09-10T18:00:00Z", 77, 88)], byClub, HORIZON);
    assert.equal(out.length, 0);
  });

  it("normalises kickoff to an ISO UTC instant", () => {
    const out = mergeFixtures([raw(1, "2026-09-10T20:00:00+02:00", 10, 99)], byClub, HORIZON);
    assert.equal(out[0].kickoff, "2026-09-10T18:00:00.000Z");
  });
});

/**
 * The bug these guard: fixtures used to come from a live "next 20" query, which by
 * definition only ever returned upcoming matches, so nothing had to drop past ones.
 * They now come from a file refreshed once a day — a stored fixture becomes a past
 * fixture just by sitting there — so without a lower bound yesterday's matches would
 * keep showing at the top of the feed.
 */
describe("mergeFixtures window start", () => {
  const members = buildMembersByClub([member(1, "A", 10)]);
  const start = new Date("2026-09-12T12:00:00.000Z");

  it("drops fixtures that kicked off before the window", () => {
    const out = mergeFixtures(
      [raw(1, "2026-09-12T08:00:00.000Z", 10, 20)],
      members,
      HORIZON,
      start,
    );
    assert.equal(out.length, 0);
  });

  it("keeps fixtures at or after the window start", () => {
    const out = mergeFixtures(
      [raw(1, "2026-09-12T14:00:00.000Z", 10, 20)],
      members,
      HORIZON,
      start,
    );
    assert.equal(out.length, 1);
  });

  it("still applies the far horizon", () => {
    const out = mergeFixtures(
      [raw(1, "2026-11-01T14:00:00.000Z", 10, 20)],
      members,
      HORIZON,
      start,
    );
    assert.equal(out.length, 0);
  });

  it("keeps everything when no window start is given", () => {
    const out = mergeFixtures([raw(1, "2020-01-01T00:00:00.000Z", 10, 20)], members, HORIZON);
    assert.equal(out.length, 1);
  });
});
