import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordSquadInternationals } from "./internationals.ts";
import type { RawFixtureRecord, SquadInternationals } from "./types.ts";

const FETCHED_AT = "2026-09-05T04:10:00.000Z";
const EARLIER = "2026-09-01T04:10:00.000Z";

const international = (date: string, id = 1): RawFixtureRecord => ({
  fixture: { id, date, venue: null },
  league: { name: "UEFA Nations League", logo: null, round: "3" },
  teams: {
    home: { id: 1113, name: "Bosnia and Herzegovina", logo: null },
    away: { id: 21, name: "Sweden", logo: null },
  },
});

const stored = (over: Partial<SquadInternationals> = {}): SquadInternationals => ({
  squad: "men",
  teamId: 1113,
  status: "scheduled",
  fetchedAt: EARLIER,
  internationals: [international("2026-10-02T18:45:00+00:00")],
  ...over,
});

const record = (
  result: Parameters<typeof recordSquadInternationals>[0]["result"],
  previous?: SquadInternationals,
) =>
  recordSquadInternationals({
    squad: "men",
    teamId: 1113,
    result,
    previous,
    fetchedAt: FETCHED_AT,
  });

describe("recordSquadInternationals", () => {
  it("records a squad's upcoming Internationals and when they were fetched", () => {
    const result = record({
      ok: true,
      internationals: [international("2026-10-02T18:45:00+00:00", 7)],
    });

    assert.equal(result.status, "scheduled");
    assert.equal(result.fetchedAt, FETCHED_AT);
    assert.equal(result.internationals.length, 1);
    assert.equal(result.unavailableReason, undefined);
  });

  it("orders Internationals chronologically", () => {
    const result = record({
      ok: true,
      internationals: [
        international("2026-11-16T19:45:00+00:00", 2),
        international("2026-10-02T18:45:00+00:00", 1),
      ],
    });

    assert.deepEqual(
      result.internationals.map((match) => match.fixture.id),
      [1, 2],
    );
  });

  // The women's squad really has none scheduled: their qualifying group finished
  // and nothing has been announced since. That is a fact, and it is recorded.
  it("records no Internationals scheduled as a fetched fact", () => {
    const result = record({ ok: true, internationals: [] });

    assert.equal(result.status, "none-scheduled");
    assert.equal(result.fetchedAt, FETCHED_AT);
    assert.deepEqual(result.internationals, []);
  });

  it("tells a failed fetch apart from a squad with nothing scheduled", () => {
    const failed = record({ ok: false, reason: "rate limited" });

    assert.equal(failed.status, "unavailable");
    assert.notEqual(failed.status, "none-scheduled");
    assert.equal(failed.unavailableReason, "rate limited");
  });

  it("keeps what was last stored when a fetch fails, and says how old it is", () => {
    const failed = record({ ok: false, reason: "rate limited" }, stored());

    assert.equal(failed.status, "unavailable");
    assert.equal(failed.fetchedAt, EARLIER);
    assert.equal(failed.internationals.length, 1);
  });

  it("claims no fetch date for a squad that has never been fetched", () => {
    const failed = record({ ok: false, reason: "API_FOOTBALL_KEY is not set" });

    assert.equal(failed.fetchedAt, null);
    assert.deepEqual(failed.internationals, []);
  });

  // A window that has been played out, or called off, must clear rather than
  // linger: the previous run's matches are not evidence of a future one.
  it("lets a successful empty fetch clear what was stored", () => {
    const result = record({ ok: true, internationals: [] }, stored());

    assert.equal(result.status, "none-scheduled");
    assert.deepEqual(result.internationals, []);
  });

  it("records the squad it was asked about", () => {
    const women = recordSquadInternationals({
      squad: "women",
      teamId: 14455,
      result: { ok: true, internationals: [] },
      fetchedAt: FETCHED_AT,
    });

    assert.equal(women.squad, "women");
    assert.equal(women.teamId, 14455);
  });
});
