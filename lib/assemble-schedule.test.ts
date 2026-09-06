import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleSchedule, type ScheduleInput } from "./assemble-schedule.ts";
import type {
  FixturesFile,
  NationalTeamMember,
  RawFixtureRecord,
} from "./types.ts";

/**
 * These are statements about the Schedule a fan or an API consumer could check for
 * themselves, made through the one interface that assembles it. Nothing here reads
 * a file or asks what time it is: the input is handed over whole and the clock is
 * an argument, which is the point of the seam.
 */

const NOW = new Date("2026-09-12T12:00:00.000Z");
const MINUTES = 60 * 1000;
const DAYS = 24 * 60 * MINUTES;

const fromNow = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

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

function fixture(
  id: number,
  kickoff: string,
  homeId: number,
  awayId: number,
): RawFixtureRecord {
  return {
    fixture: { id, date: kickoff, venue: { name: "Ground" } },
    league: { name: "League", logo: null, round: "R1" },
    teams: {
      home: { id: homeId, name: `Club ${homeId}`, logo: null },
      away: { id: awayId, name: `Club ${awayId}`, logo: null },
    },
  };
}

function fixturesFile(
  fixtures: RawFixtureRecord[],
  over: Partial<FixturesFile> = {},
): FixturesFile {
  return {
    generatedAt: "2026-09-12T06:00:00.000Z",
    fixtures,
    unavailableClubs: [],
    clubs: [],
    ...over,
  };
}

const MEMBERS = [member(1, "A", 10), member(2, "B", 10), member(3, "C", 20)];

function input(
  fixtures: RawFixtureRecord[],
  over: Partial<ScheduleInput> = {},
): ScheduleInput {
  return { members: MEMBERS, fixturesFile: fixturesFile(fixtures), ...over };
}

describe("assembleSchedule", () => {
  it("orders the Schedule chronologically", () => {
    const schedule = assembleSchedule(
      input([
        fixture(1, fromNow(9 * DAYS), 20, 99),
        fixture(2, fromNow(1 * DAYS), 10, 99),
        fixture(3, fromNow(5 * DAYS), 10, 99),
      ]),
      NOW,
    );

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [2, 3, 1]);
  });

  // Two National Team Members can reach the same match from opposite ends of it, so
  // it arrives from both Clubs' feeds. A fan must see one entry, not two.
  it("lists a Fixture once when two Members' Clubs both reach it", () => {
    const headToHead = fixture(100, fromNow(2 * DAYS), 10, 20);
    const schedule = assembleSchedule(input([headToHead, headToHead]), NOW);

    assert.equal(schedule.fixtures.length, 1);
    assert.deepEqual(
      schedule.fixtures[0].members.map((m) => m.name),
      ["A", "B", "C"],
    );
  });

  it("keeps Club Fixtures inside the 21-day horizon and drops the rest", () => {
    const schedule = assembleSchedule(
      input([
        fixture(1, fromNow(20 * DAYS), 10, 99),
        fixture(2, fromNow(22 * DAYS), 10, 99),
      ]),
      NOW,
    );

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [1]);
  });

  // The reassurance this exists for: a fan checking whether they have missed
  // kickoff should still find the match listed rather than an empty evening.
  it("keeps a match that has already kicked off for the grace period", () => {
    const schedule = assembleSchedule(
      input([
        fixture(1, fromNow(-120 * MINUTES), 10, 99),
        fixture(2, fromNow(-140 * MINUTES), 10, 99),
      ]),
      NOW,
    );

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [1]);
  });

  it("passes the refresh's stamp and unavailable Clubs through untouched", () => {
    const unavailable = [{ id: 55, name: "Club 55", logo: null }];
    const schedule = assembleSchedule(
      input([], {
        fixturesFile: fixturesFile([fixture(1, fromNow(1 * DAYS), 10, 99)], {
          generatedAt: "2026-09-11T05:00:00.000Z",
          unavailableClubs: unavailable,
        }),
      }),
      NOW,
    );

    assert.equal(schedule.generatedAt, "2026-09-11T05:00:00.000Z");
    assert.deepEqual(schedule.unavailableClubs, unavailable);
    assert.deepEqual(schedule.members.map((m) => m.name), ["A", "B", "C"]);
    assert.equal(schedule.degraded, false);
  });

  it("reports an empty fixtures file as degraded, so a quiet week is not faked", () => {
    const schedule = assembleSchedule(input([]), NOW);

    assert.equal(schedule.degraded, true);
    assert.deepEqual(schedule.fixtures, []);
  });
});

/**
 * The horizon and the grace period are both measured from the moment of rendering,
 * so the whole Schedule turns on what time it is. These pin that the injected
 * timestamp is the only clock in play — nothing in here consults a real one.
 */
describe("assembleSchedule determinism", () => {
  const fixtures = [
    fixture(1, fromNow(-120 * MINUTES), 10, 99),
    fixture(2, fromNow(2 * DAYS), 10, 20),
    fixture(3, fromNow(20 * DAYS), 20, 99),
  ];

  it("returns identical output for the same input and timestamp", () => {
    const first = assembleSchedule(input(fixtures), NOW);
    const second = assembleSchedule(input(fixtures), NOW);

    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });

  it("returns a different Schedule when the timestamp moves on", () => {
    const later = new Date(NOW.getTime() + 7 * DAYS);
    const now = assembleSchedule(input(fixtures), NOW);
    const nextWeek = assembleSchedule(input(fixtures), later);

    // The kicked-off match has aged out; the far one is still inside the horizon.
    assert.deepEqual(now.fixtures.map((f) => f.id), [1, 2, 3]);
    assert.deepEqual(nextWeek.fixtures.map((f) => f.id), [3]);
  });
});
