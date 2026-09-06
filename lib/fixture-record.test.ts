import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trimFixtureRecord, type UpstreamFixture } from "./fixture-record.ts";
import type { Side } from "./types.ts";

const KICKOFF = "2026-10-02T18:45:00+00:00";

const side = (over: Partial<Side> = {}): Side => ({
  id: 1113,
  name: "Bosnia and Herzegovina",
  logo: "https://media.api-sports.io/football/teams/1113.png",
  ...over,
});

const upstream = (over: Partial<UpstreamFixture> = {}): UpstreamFixture => ({
  fixture: { id: 1, date: KICKOFF, venue: { name: "Bilino Polje" } },
  league: { name: "UEFA Nations League", logo: null, round: "League Phase - 3" },
  teams: { home: side(), away: side({ id: 21, name: "Sweden" }) },
  ...over,
});

describe("trimFixtureRecord", () => {
  it("keeps the fields the app renders and drops the rest", () => {
    const raw = upstream() as UpstreamFixture & { fixture: { referee?: string } };
    raw.fixture.referee = "Someone";

    const record = trimFixtureRecord(raw);

    assert.deepEqual(Object.keys(record.fixture), ["id", "date", "venue"]);
    assert.equal(record.fixture.date, KICKOFF);
    assert.equal(record.teams.away.name, "Sweden");
  });

  // Internationals all came back with no venue at all, so the location line has
  // nothing to render and must not become an empty one.
  it("stores a missing venue as null", () => {
    const withVenue = (venue: UpstreamFixture["fixture"]["venue"]) =>
      trimFixtureRecord(upstream({ fixture: { id: 1, date: KICKOFF, venue } })).fixture
        .venue;

    assert.equal(withVenue(null), null);
    assert.equal(withVenue(undefined), null);
    assert.equal(withVenue({ name: null }), null);
    assert.deepEqual(withVenue({ name: "Bilino Polje" }), { name: "Bilino Polje" });
  });

  // An International's round is a bare number where a Club Fixture's is a phrase.
  // Left alone it would be written to the file as a number and read back as one.
  it("stores a numeric round as text", () => {
    const record = trimFixtureRecord(
      upstream({ league: { name: "UEFA Nations League", logo: null, round: 3 } }),
    );
    assert.equal(record.league.round, "3");
  });

  it("stores an absent round as null rather than inventing one", () => {
    assert.equal(
      trimFixtureRecord(upstream({ league: { name: "Friendlies", round: null } })).league
        .round,
      null,
    );
    assert.equal(
      trimFixtureRecord(upstream({ league: { name: "Friendlies", round: "" } })).league
        .round,
      null,
    );
  });

  it("repairs mojibake in competition and side names", () => {
    const record = trimFixtureRecord(
      upstream({
        league: { name: "Bayern MÃ¼nchen Cup", round: "1" },
        teams: {
          home: side({ name: "Bayern MÃ¼nchen" }),
          away: side({ name: "Sweden" }),
        },
      }),
    );
    assert.equal(record.league.name, "Bayern München Cup");
    assert.equal(record.teams.home.name, "Bayern München");
  });
});
