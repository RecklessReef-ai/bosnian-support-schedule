import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleSchedule, type ScheduleInput } from "./assemble-schedule.ts";
import type {
  HandEnteredInternational,
  HandEnteredInternationalsFile,
} from "./hand-entered-internationals.ts";
import type {
  FixturesFile,
  InternationalsFile,
  NationalTeamMember,
  RawFixtureRecord,
  Roster,
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

function roster(over: Partial<Roster> = {}): Roster {
  return { generatedAt: "2026-09-05T14:29:47.634Z", members: MEMBERS, ...over };
}

/** Both squads, for the rules that turn on which side an International belongs to. */
const BOTH_SQUADS = [...MEMBERS, member(4, "D", 30, "women"), member(5, "E", 30, "women")];

function input(
  fixtures: RawFixtureRecord[],
  over: Partial<ScheduleInput> = {},
): ScheduleInput {
  return {
    roster: roster(),
    fixturesFile: fixturesFile(fixtures),
    internationalsFile: internationalsFile(),
    // Empty unless a test says otherwise, which is what the committed file holds:
    // hand entries are the exception, and every rule above must hold without them.
    handEnteredInternationals: { men: [], women: [] },
    ...over,
  };
}

/** The Schedule assembled from Internationals alone, with no Club Fixtures in play. */
function scheduleOf(squads: SquadInternationals[], now = NOW, members = BOTH_SQUADS) {
  return assembleSchedule(
    input([], {
      roster: roster({ members }),
      internationalsFile: internationalsFile(squads),
    }),
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
 * The Roster claims to be neither a standing squad pool nor an announced call-up,
 * because the upstream source does not say which it is. The gathered-at stamp is
 * the whole of what lets a fan judge it for themselves — so it has to survive
 * assembly, and it has to stay its own date. The two files are refreshed by
 * different scripts on different days: a squad gathered in September can sit
 * beside fixtures fetched this morning, and reporting one date for both would
 * make a stale squad look fresh.
 */
describe("the Roster's gathered-at stamp", () => {
  it("carries its own date, independent of the Fixtures' date", () => {
    const schedule = assembleSchedule(
      input([], {
        roster: roster({ generatedAt: "2026-08-28T09:00:00.000Z" }),
        fixturesFile: fixturesFile([fixture(1, fromNow(1 * DAYS), 10, 99)], {
          generatedAt: "2026-09-12T06:00:00.000Z",
        }),
      }),
      NOW,
    );

    assert.equal(schedule.rosterGeneratedAt, "2026-08-28T09:00:00.000Z");
    assert.equal(schedule.generatedAt, "2026-09-12T06:00:00.000Z");
  });

  it("keeps the Roster's date when no Fixtures could be stored at all", () => {
    const schedule = assembleSchedule(
      input([], { roster: roster({ generatedAt: "2026-08-28T09:00:00.000Z" }) }),
      NOW,
    );

    assert.equal(schedule.degraded, true);
    assert.equal(schedule.rosterGeneratedAt, "2026-08-28T09:00:00.000Z");
  });

  // Photo and position arrive in the same upstream response at no extra cost and
  // stay in the data unrendered. Assembly must not tidy them away: dropping them
  // here would quietly decide a question the page is meant to decide.
  it("publishes the Roster whole, photo and position included", () => {
    const withExtras: NationalTeamMember = {
      ...member(9, "E. Džeko", 10),
      photo: "https://media.api-sports.io/football/players/9.png",
      position: "Attacker",
    };
    const schedule = assembleSchedule(
      input([], { roster: roster({ members: [withExtras] }) }),
      NOW,
    );

    assert.deepEqual(schedule.members, [withExtras]);
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
        roster: roster({ members: BOTH_SQUADS }),
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
        roster: roster({ members: BOTH_SQUADS }),
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
        roster: roster({ members: BOTH_SQUADS }),
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
        roster: roster({ members: BOTH_SQUADS }),
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

/**
 * The escape hatch at the end of the NFSBiH chain: the federation publishes prose,
 * the daily RSS watcher raises an issue, a human reads the article — and this is
 * where the fact lands. It matters most for the women's squad, who have no
 * Internationals scheduled anywhere: when a friendly is announced, a hand entry is
 * the only way it reaches a fan before the upstream API catches up.
 *
 * These say what a hand entry does that a fetched record does not: it is credited
 * to the federation and never to the API, it outranks a fetched record for the
 * same match, and it is enough on its own to make a squad's calendar non-empty.
 */
describe("assembleSchedule hand-entered Internationals", () => {
  const ESTONIA = { name: "Estonia" };

  function handEntry(
    kickoff: string,
    over: Partial<HandEnteredInternational> = {},
  ): HandEnteredInternational {
    return { kickoff, opponent: ESTONIA, atHome: true, source: "NFSBiH", ...over };
  }

  /** A Schedule with no Club Fixtures, so only the Internationals are in play. */
  function scheduleWith(
    squads: SquadInternationals[],
    handEntered: Partial<HandEnteredInternationalsFile>,
    now = NOW,
  ) {
    return assembleSchedule(
      input([], {
        roster: roster({ members: BOTH_SQUADS }),
        internationalsFile: internationalsFile(squads),
        handEnteredInternationals: { men: [], women: [], ...handEntered },
      }),
      now,
    );
  }

  // The women's squad's real situation: their qualifying group finished in June
  // 2026 and the API carries nothing at all for them. A friendly the federation
  // announces reaches a fan only this way.
  it("publishes an International the upstream fetch does not carry", () => {
    const schedule = scheduleWith([squadRecord("women", [])], {
      women: [handEntry(fromNow(20 * DAYS), { venue: "Stadion Grbavica" })],
    });

    assert.equal(schedule.fixtures.length, 1);
    const [match] = schedule.fixtures;
    assert.equal(match.kind, "international");
    assert.equal(match.venue, "Stadion Grbavica");
    assert.deepEqual(
      [match.home.name, match.away.name],
      ["Bosnia & Herzegovina W", "Estonia"],
    );
  });

  // The reason provenance moved onto the record at all. Crediting the API for a
  // match a human took from the federation's announcement is the exact failure
  // ADR-0004 exists to prevent.
  it("credits a hand-entered International to its own Source, never the API", () => {
    const schedule = scheduleWith([squadRecord("women", [])], {
      women: [handEntry(fromNow(20 * DAYS))],
    });

    assert.equal(schedule.fixtures[0].source, "NFSBiH");
  });

  it("puts the squad on the away side when Bosnia is not at home", () => {
    const schedule = scheduleWith([squadRecord("men", [])], {
      men: [handEntry(fromNow(20 * DAYS), { atHome: false })],
    });

    assert.deepEqual(
      [schedule.fixtures[0].home.name, schedule.fixtures[0].away.name],
      ["Estonia", "Bosnia & Herzegovina"],
    );
  });

  it("calls a hand-entered match a friendly unless it says otherwise", () => {
    const schedule = scheduleWith([squadRecord("men", [])], {
      men: [
        handEntry(fromNow(20 * DAYS)),
        handEntry(fromNow(23 * DAYS), { competition: "Kirin Cup", round: "Final" }),
      ],
    });

    assert.deepEqual(
      schedule.fixtures.map((f) => [f.competition, f.round]),
      [
        ["Friendly", null],
        ["Kirin Cup", "Final"],
      ],
    );
  });

  it("keeps each squad's hand entries to that squad", () => {
    const schedule = scheduleWith([squadRecord("men", []), squadRecord("women", [])], {
      women: [handEntry(fromNow(20 * DAYS))],
    });

    assert.equal(schedule.fixtures.length, 1);
    const [match] = schedule.fixtures;
    assert.equal(match.kind === "international" && match.squad, "women");
    assert.deepEqual(
      match.members.map((m) => m.name),
      ["D", "E"],
    );
  });

  /**
   * The most likely bug in this feature. The status a fan reads is derived from
   * what is actually being shown, so a squad with a hand-entered match must never
   * be told its calendar is empty while that match sits on the page.
   */
  it("stops saying none scheduled once a hand-entered International exists", () => {
    const schedule = scheduleWith([squadRecord("women", [])], {
      women: [handEntry(fromNow(20 * DAYS))],
    });

    assert.equal(schedule.squadInternationals[0].status, "scheduled");
  });

  it("still says none scheduled for the squad without a hand entry", () => {
    const schedule = scheduleWith([squadRecord("men", []), squadRecord("women", [])], {
      women: [handEntry(fromNow(20 * DAYS))],
    });

    assert.deepEqual(
      schedule.squadInternationals.map((s) => [s.squad, s.status]),
      [
        ["men", "none-scheduled"],
        ["women", "scheduled"],
      ],
    );
  });

  // A hand entry says what the federation announced. It says nothing about the
  // matches the failed fetch would have found, so "we could not ask" stands.
  it("does not turn a failed fetch into an answer", () => {
    const schedule = scheduleWith(
      [
        squadRecord("men", [], {
          status: "unavailable",
          unavailableReason: "rate limited",
          fetchedAt: null,
        }),
      ],
      { men: [handEntry(fromNow(20 * DAYS))] },
    );

    assert.equal(schedule.fixtures.length, 1);
    assert.deepEqual(schedule.squadInternationals, [
      {
        squad: "men",
        status: "unavailable",
        fetchedAt: null,
        unavailableReason: "rate limited",
      },
    ]);
  });

  /**
   * A squad plays at most one match a day, so the same squad on the same day is
   * the same match. This is what stops a fan seeing a friendly twice on the
   * morning the API finally catches up with the federation — days after the
   * maintainer typed it in, with nobody watching.
   */
  it("replaces the fetched record for the same squad on the same day", () => {
    const kickoff = fromNow(20 * DAYS);
    const threeHoursLater = new Date(
      new Date(kickoff).getTime() + 3 * 60 * 60 * 1000,
    ).toISOString();
    const schedule = scheduleWith([squadRecord("men", [international(900, kickoff)])], {
      men: [handEntry(threeHoursLater, { venue: "Bilino Polje" })],
    });

    assert.equal(schedule.fixtures.length, 1);
    const [match] = schedule.fixtures;
    assert.equal(match.source, "NFSBiH");
    assert.equal(match.venue, "Bilino Polje");
    assert.equal(match.kickoff, threeHoursLater);
  });

  it("leaves a fetched record on another day alone", () => {
    const schedule = scheduleWith(
      [squadRecord("men", [international(900, fromNow(20 * DAYS))])],
      { men: [handEntry(fromNow(23 * DAYS))] },
    );

    assert.deepEqual(
      schedule.fixtures.map((f) => f.source),
      ["API-Football", "NFSBiH"],
    );
  });

  it("does not let one squad's hand entry replace the other squad's match", () => {
    const kickoff = fromNow(20 * DAYS);
    const schedule = scheduleWith(
      [squadRecord("men", [international(900, kickoff)]), squadRecord("women", [])],
      { women: [handEntry(kickoff)] },
    );

    assert.equal(schedule.fixtures.length, 2);
    assert.deepEqual(
      schedule.fixtures.map((f) => f.source),
      ["API-Football", "NFSBiH"],
    );
  });

  /**
   * Layering happens at read time, not in the refresh — so the file the refresh
   * overwrites never holds a hand entry to lose. This is the arrangement Manual
   * Overrides already use, and the reason a maintainer's entry takes effect on the
   * next render rather than the next API call.
   */
  it("survives a refresh, whatever the refresh brought back", () => {
    const entry = handEntry(fromNow(20 * DAYS));
    const before = scheduleWith([squadRecord("men", [])], { men: [entry] });
    const after = scheduleWith(
      [
        squadRecord("men", [international(900, fromNow(6 * DAYS))], {
          fetchedAt: "2026-09-13T06:00:00.000Z",
        }),
      ],
      { men: [entry] },
    );

    assert.deepEqual(
      before.fixtures.map((f) => f.source),
      ["NFSBiH"],
    );
    assert.deepEqual(
      after.fixtures.map((f) => f.source),
      ["API-Football", "NFSBiH"],
    );
  });

  // A hand entry is an International like any other: it belongs to a Window, it
  // ignores the 21-day horizon, and it drops off after the grace period.
  it("joins the squad's next International Window", () => {
    const schedule = scheduleWith(
      [
        squadRecord("men", [
          international(900, fromNow(30 * DAYS)),
          international(901, fromNow(60 * DAYS)),
        ]),
      ],
      { men: [handEntry(fromNow(33 * DAYS))] },
    );

    assert.deepEqual(
      schedule.fixtures.map((f) => f.source),
      ["API-Football", "NFSBiH"],
    );
  });

  it("drops a hand-entered match once it has been played", () => {
    const schedule = scheduleWith([squadRecord("men", [])], {
      men: [handEntry(fromNow(-140 * MINUTES))],
    });

    assert.deepEqual(schedule.fixtures, []);
    assert.equal(schedule.squadInternationals[0].status, "none-scheduled");
  });

  // A typo in a hand-edited file must not take the whole Schedule down. One match
  // missing until the file is fixed is visible and recoverable; a blank site is
  // neither.
  it("ignores an entry whose kickoff cannot be read", () => {
    const schedule = scheduleWith([squadRecord("men", [])], {
      men: [handEntry("28 November"), handEntry(fromNow(20 * DAYS))],
    });

    assert.equal(schedule.fixtures.length, 1);
  });

  it("gives a hand-entered match an id that cannot collide with an upstream one", () => {
    const schedule = scheduleWith([squadRecord("men", [])], {
      men: [handEntry(fromNow(20 * DAYS))],
    });

    assert.ok(schedule.fixtures[0].id < 0);
  });

  it("returns identical output for the same input and timestamp", () => {
    const entries = { men: [handEntry(fromNow(20 * DAYS))] };
    const first = scheduleWith([squadRecord("men", [])], entries);
    const second = scheduleWith([squadRecord("men", [])], entries);

    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });
});
