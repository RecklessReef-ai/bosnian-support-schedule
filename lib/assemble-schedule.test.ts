import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleSchedule, type ScheduleInput } from "./assemble-schedule.ts";
import type {
  FixturesFile,
  InternationalsFile,
  NationalTeamMember,
  RawFixtureRecord,
  Squad,
  SquadInternationals,
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

function member(
  id: number,
  name: string,
  clubId: number,
  squad: Squad = "men",
): NationalTeamMember {
  return {
    id,
    name,
    photo: null,
    position: null,
    squad,
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

/** The two senior National Teams, as the Sides of an International. */
const BIH_MEN = { id: 1113, name: "Bosnia & Herzegovina", logo: null };
const BIH_WOMEN = { id: 14455, name: "Bosnia & Herzegovina W", logo: null };

function international(
  id: number,
  kickoff: string,
  over: Partial<RawFixtureRecord> = {},
  side = BIH_MEN,
): RawFixtureRecord {
  return {
    // Internationals arrive with no venue and a bare numeric round; the builder
    // matches what the refresh really stores rather than a tidier invention.
    fixture: { id, date: kickoff, venue: null },
    league: { name: "UEFA Nations League", logo: null, round: "1" },
    teams: { home: side, away: { id: 24, name: "Poland", logo: null } },
    ...over,
  };
}

function squadRecord(
  squad: Squad,
  internationals: RawFixtureRecord[],
  over: Partial<SquadInternationals> = {},
): SquadInternationals {
  return {
    squad,
    teamId: squad === "men" ? BIH_MEN.id : BIH_WOMEN.id,
    status: internationals.length > 0 ? "scheduled" : "none-scheduled",
    fetchedAt: "2026-09-12T06:00:00.000Z",
    internationals,
    ...over,
  };
}

function internationalsFile(squads: SquadInternationals[] = []): InternationalsFile {
  return { generatedAt: "2026-09-12T06:00:00.000Z", squads };
}

const MEMBERS = [member(1, "A", 10), member(2, "B", 10), member(3, "C", 20)];

/** Both squads, for the rules that turn on which side an International belongs to. */
const BOTH_SQUADS = [...MEMBERS, member(4, "D", 30, "women"), member(5, "E", 30, "women")];

function input(
  fixtures: RawFixtureRecord[],
  over: Partial<ScheduleInput> = {},
): ScheduleInput {
  return {
    members: MEMBERS,
    fixturesFile: fixturesFile(fixtures),
    internationalsFile: internationalsFile(),
    ...over,
  };
}

/** The Schedule assembled from Internationals alone, with no Club Fixtures in play. */
function scheduleOf(squads: SquadInternationals[], now = NOW, members = BOTH_SQUADS) {
  return assembleSchedule(
    input([], { members, internationalsFile: internationalsFile(squads) }),
    now,
  );
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

  const withInternationals = () =>
    input(fixtures, {
      internationalsFile: internationalsFile([
        squadRecord("men", [
          international(900, fromNow(30 * DAYS)),
          international(901, fromNow(33 * DAYS)),
        ]),
        squadRecord("women", []),
      ]),
    });

  it("returns identical output for the same input and timestamp", () => {
    const first = assembleSchedule(withInternationals(), NOW);
    const second = assembleSchedule(withInternationals(), NOW);

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

/**
 * The half of the Schedule a fan opens the site for. These say what an
 * International does that a Club Fixture does not: it ignores the horizon, it
 * arrives as a whole International Window, and it involves a squad rather than a
 * pair of Clubs.
 */
describe("assembleSchedule Internationals", () => {
  it("places Internationals in the one chronological feed, among the Club Fixtures", () => {
    const schedule = assembleSchedule(
      input([fixture(1, fromNow(1 * DAYS), 10, 99), fixture(2, fromNow(5 * DAYS), 10, 99)], {
        members: BOTH_SQUADS,
        internationalsFile: internationalsFile([
          squadRecord("men", [international(900, fromNow(3 * DAYS))]),
        ]),
      }),
      NOW,
    );

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [1, 900, 2]);
  });

  it("marks each Fixture with its kind, so nothing has to infer it from the Sides", () => {
    const schedule = assembleSchedule(
      input([fixture(1, fromNow(1 * DAYS), 10, 99)], {
        members: BOTH_SQUADS,
        internationalsFile: internationalsFile([
          squadRecord("men", [international(900, fromNow(3 * DAYS))]),
        ]),
      }),
      NOW,
    );

    assert.deepEqual(schedule.fixtures.map((f) => f.kind), ["club", "international"]);
  });

  it("credits every Fixture to a Source, which is the upstream API by default", () => {
    const schedule = assembleSchedule(
      input([fixture(1, fromNow(1 * DAYS), 10, 99)], {
        members: BOTH_SQUADS,
        internationalsFile: internationalsFile([
          squadRecord("men", [international(900, fromNow(3 * DAYS))]),
        ]),
      }),
      NOW,
    );

    assert.deepEqual(
      schedule.fixtures.map((f) => f.source),
      ["API-Football", "API-Football"],
    );
  });

  // The reason provenance moved onto the record at all: a match the federation
  // announced and a human typed in must never be credited to the API.
  it("credits a record that names its own Source to that Source", () => {
    const schedule = scheduleOf([
      squadRecord("men", [
        international(900, fromNow(3 * DAYS), { source: "NFSBiH" }),
        international(901, fromNow(6 * DAYS)),
      ]),
    ]);

    assert.deepEqual(schedule.fixtures.map((f) => f.source), ["NFSBiH", "API-Football"]);
  });

  // The horizon exists to stop a dense club feed sprawling — 61 Members across 39
  // Clubs. There are about ten Internationals a year; they cannot sprawl, so the
  // bound that protects the one would only hide the other.
  it("keeps Internationals beyond the horizon that bounds Club Fixtures", () => {
    const schedule = assembleSchedule(
      input([fixture(1, fromNow(22 * DAYS), 10, 99)], {
        members: BOTH_SQUADS,
        internationalsFile: internationalsFile([
          squadRecord("men", [international(900, fromNow(40 * DAYS))]),
        ]),
      }),
      NOW,
    );

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [900]);
  });

  it("lists the whole squad as the Members of an International", () => {
    const schedule = scheduleOf([
      squadRecord("men", [international(900, fromNow(3 * DAYS))]),
      squadRecord("women", [international(950, fromNow(4 * DAYS), {}, BIH_WOMEN)]),
    ]);

    const [mens, womens] = schedule.fixtures;
    assert.deepEqual(mens.members.map((m) => m.name), ["A", "B", "C"]);
    assert.deepEqual(womens.members.map((m) => m.name), ["D", "E"]);
  });

  it("says which squad an International belongs to", () => {
    const schedule = scheduleOf([
      squadRecord("men", [international(900, fromNow(3 * DAYS))]),
      squadRecord("women", [international(950, fromNow(4 * DAYS), {}, BIH_WOMEN)]),
    ]);

    assert.deepEqual(
      schedule.fixtures.map((f) => (f.kind === "international" ? f.squad : null)),
      ["men", "women"],
    );
  });
});

/**
 * The rule these pin down: consecutive Internationals belong to the same
 * International Window while no more than fourteen days separate them, and a
 * longer gap starts a new one.
 *
 * Fourteen days sits in a wide gap between two facts about the football calendar.
 * Matches inside one break are three or four days apart — matchday plus three —
 * and even a long summer camp keeps its matches inside a fortnight. Separate
 * breaks are never closer than about three weeks, because club football has to
 * resume in between. So the threshold can move several days in either direction
 * without changing an answer, which is what makes it safe against a fixture being
 * rearranged.
 */
describe("assembleSchedule International Windows", () => {
  // The exact bug the Window rule exists to prevent. A naive 21-day horizon would
  // show the first two matches of this break and hide the second two, splitting a
  // ten-day window down the middle and telling a fan the break was over.
  it("returns the next Window whole, including the matches past the horizon", () => {
    const schedule = scheduleOf([
      squadRecord("men", [
        international(900, fromNow(13 * DAYS)),
        international(901, fromNow(16 * DAYS)),
        international(902, fromNow(20 * DAYS)),
        international(903, fromNow(23 * DAYS)),
      ]),
    ]);

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [900, 901, 902, 903]);
  });

  it("treats matches exactly fourteen days apart as one Window", () => {
    const schedule = scheduleOf([
      squadRecord("men", [
        international(900, fromNow(3 * DAYS)),
        international(901, fromNow(17 * DAYS)),
      ]),
    ]);

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [900, 901]);
  });

  it("starts a new Window once more than fourteen days separate two matches", () => {
    const schedule = scheduleOf([
      squadRecord("men", [
        international(900, fromNow(3 * DAYS)),
        international(901, fromNow(17 * DAYS + 1)),
      ]),
    ]);

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [900]);
  });

  it("shows only the next Window, not the one after it", () => {
    const schedule = scheduleOf([
      squadRecord("men", [
        international(900, fromNow(13 * DAYS)),
        international(901, fromNow(16 * DAYS)),
        international(902, fromNow(53 * DAYS)),
        international(903, fromNow(56 * DAYS)),
      ]),
    ]);

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [900, 901]);
  });

  // Half a Window into the break, the answer to "when are we next on" is the rest
  // of this Window — not next month's.
  it("keeps the remainder of a Window that has already begun", () => {
    const schedule = scheduleOf([
      squadRecord("men", [
        international(900, fromNow(-10 * DAYS)),
        international(901, fromNow(-7 * DAYS)),
        international(902, fromNow(3 * DAYS)),
        international(903, fromNow(6 * DAYS)),
        international(904, fromNow(45 * DAYS)),
      ]),
    ]);

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [902, 903]);
  });

  it("keeps an International that has just kicked off, like any other Fixture", () => {
    const schedule = scheduleOf([
      squadRecord("men", [
        international(900, fromNow(-120 * MINUTES)),
        international(901, fromNow(-140 * MINUTES)),
      ]),
    ]);

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [900]);
  });

  // Each side keeps its own calendar. Grouping the two squads' matches together
  // would let a men's break swallow a women's friendly a week later, or hide it.
  it("picks each squad's next Window independently", () => {
    const schedule = scheduleOf([
      squadRecord("men", [
        international(900, fromNow(3 * DAYS)),
        international(901, fromNow(40 * DAYS)),
      ]),
      squadRecord("women", [
        international(950, fromNow(20 * DAYS), {}, BIH_WOMEN),
        international(951, fromNow(23 * DAYS), {}, BIH_WOMEN),
      ]),
    ]);

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [900, 950, 951]);
  });
});

/**
 * "There is nothing coming" and "we could not find out" are different answers, and
 * the women's squad is the reason it matters: their qualifying group finished in
 * June 2026 and the federation has announced nothing since, so an empty women's
 * calendar is a true statement about the world rather than a symptom.
 */
describe("assembleSchedule squad Internationals states", () => {
  it("tells no Internationals scheduled apart from a fetch that failed", () => {
    const schedule = scheduleOf([
      squadRecord("men", [], {
        status: "unavailable",
        unavailableReason: "rate limited",
        fetchedAt: null,
      }),
      squadRecord("women", []),
    ]);

    assert.deepEqual(schedule.squadInternationals, [
      {
        squad: "men",
        status: "unavailable",
        fetchedAt: null,
        unavailableReason: "rate limited",
      },
      { squad: "women", status: "none-scheduled", fetchedAt: "2026-09-12T06:00:00.000Z" },
    ]);
  });

  // A successful fetch that found six matches, all of them now played, leaves a
  // squad with nothing coming. Reporting "scheduled" beside an empty feed would be
  // the site contradicting itself.
  it("reports none scheduled once a squad's stored Internationals have all been played", () => {
    const schedule = scheduleOf([
      squadRecord("men", [international(900, fromNow(-30 * DAYS))]),
    ]);

    assert.equal(schedule.fixtures.length, 0);
    assert.equal(schedule.squadInternationals[0].status, "none-scheduled");
  });

  it("still shows what was last stored for a squad whose fetch failed, and says so", () => {
    const schedule = scheduleOf([
      squadRecord("men", [international(900, fromNow(3 * DAYS))], {
        status: "unavailable",
        unavailableReason: "rate limited",
        fetchedAt: "2026-09-10T06:00:00.000Z",
      }),
    ]);

    assert.deepEqual(schedule.fixtures.map((f) => f.id), [900]);
    assert.deepEqual(schedule.squadInternationals, [
      {
        squad: "men",
        status: "unavailable",
        fetchedAt: "2026-09-10T06:00:00.000Z",
        unavailableReason: "rate limited",
      },
    ]);
  });

  it("names both squads even when neither has anything scheduled", () => {
    const schedule = scheduleOf([squadRecord("men", []), squadRecord("women", [])]);

    assert.deepEqual(schedule.squadInternationals.map((s) => s.squad), ["men", "women"]);
  });
});

/**
 * The real calendar, at fixed points in it. These are the six Internationals
 * `data/internationals.json` holds at the time of writing — a four-match break from
 * 25 September to 5 October, then a two-match one on 14 and 17 November — written
 * out here rather than read from the file, so that tomorrow's refresh changes the
 * site's data without falsifying the rule.
 */
describe("assembleSchedule against the real International Windows", () => {
  const NATIONS_LEAGUE = [
    international(1528885, "2026-09-25T18:45:00+00:00"),
    international(1528908, "2026-09-28T18:45:00+00:00"),
    international(1528929, "2026-10-02T18:45:00+00:00"),
    international(1528948, "2026-10-05T18:45:00+00:00"),
    international(1528978, "2026-11-14T19:45:00+00:00"),
    international(1528999, "2026-11-17T19:45:00+00:00"),
  ];

  const at = (iso: string) =>
    scheduleOf([squadRecord("men", NATIONS_LEAGUE)], new Date(iso));

  // Three of these four are outside a 21-day horizon on 6 September. All four are
  // one break in the club season, so all four are shown.
  it("shows the whole September break three weeks out", () => {
    assert.deepEqual(
      at("2026-09-06T12:00:00.000Z").fixtures.map((f) => f.id),
      [1528885, 1528908, 1528929, 1528948],
    );
  });

  it("still shows the last match of that break while it is being played", () => {
    assert.deepEqual(
      at("2026-10-05T20:00:00.000Z").fixtures.map((f) => f.id),
      [1528948],
    );
  });

  it("shows the November pair whole once it is the next Window", () => {
    assert.deepEqual(
      at("2026-10-06T12:00:00.000Z").fixtures.map((f) => f.id),
      [1528978, 1528999],
    );
  });
});
