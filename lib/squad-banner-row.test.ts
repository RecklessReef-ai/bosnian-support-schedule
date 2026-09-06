import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { squadBannerRow } from "./squad-banner-row.ts";
import type { International, Squad, SquadInternationalsState } from "./types.ts";

/**
 * The three facts this has to keep apart are the whole point of the feature: a
 * squad we could not ask about, a squad with an empty calendar, and a squad whose
 * next match we know about from data we could not refresh. Each of the first two
 * read as the other somewhere in the site's history, and the third used to be
 * swallowed by the first.
 */

const NOW = new Date("2026-09-12T12:00:00.000Z");
const MINUTES = 60 * 1000;
const DAYS = 24 * 60 * MINUTES;

const fromNow = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

function international(
  id: number,
  kickoff: string,
  squad: Squad = "men",
): International {
  return {
    id,
    kind: "international",
    kickoff,
    competition: "UEFA Nations League",
    competitionLogo: null,
    round: "1",
    venue: "Bilino Polje",
    home: { id: 20, name: "Bosnia and Herzegovina", logo: null },
    away: { id: 21, name: "Wales", logo: null },
    source: "API-Football",
    squad,
    members: [],
  };
}

function state(
  squad: Squad,
  status: SquadInternationalsState["status"],
): SquadInternationalsState {
  return {
    squad,
    status,
    fetchedAt: "2026-09-10T06:00:00.000Z",
    ...(status === "unavailable" ? { unavailableReason: "rate limited" } : {}),
  };
}

describe("squadBannerRow", () => {
  it("counts down to a stored International even though the fetch failed, and says the data is stale", () => {
    const next = international(900, fromNow(3 * DAYS));

    assert.deepEqual(
      squadBannerRow({
        squad: "men",
        states: [state("men", "unavailable")],
        internationals: [next],
        now: NOW,
      }),
      { show: "next-international", next, couldNotRefresh: true },
    );
  });

  it("shows the unavailable state alone when the failed fetch left nothing stored", () => {
    assert.deepEqual(
      squadBannerRow({
        squad: "men",
        states: [state("men", "unavailable")],
        internationals: [],
        now: NOW,
      }),
      { show: "unavailable" },
    );
  });

  it("reads a squad we know nothing about as unavailable rather than as an empty calendar", () => {
    assert.deepEqual(
      squadBannerRow({
        squad: "women",
        states: [state("men", "scheduled")],
        internationals: [],
        now: NOW,
      }),
      { show: "unavailable" },
    );
  });

  it("reads a genuinely quiet calendar as nothing scheduled, never as an outage", () => {
    assert.deepEqual(
      squadBannerRow({
        squad: "women",
        states: [state("women", "none-scheduled")],
        internationals: [],
        now: NOW,
      }),
      { show: "none-scheduled" },
    );
  });

  it("does not claim to know what comes next when a failed squad's stored matches have all been played", () => {
    assert.deepEqual(
      squadBannerRow({
        squad: "men",
        states: [state("men", "unavailable")],
        internationals: [international(900, fromNow(-5 * DAYS))],
        now: NOW,
      }),
      { show: "unavailable" },
    );
  });

  it("says the stored matches have been played when the fetch itself was fine", () => {
    assert.deepEqual(
      squadBannerRow({
        squad: "men",
        states: [state("men", "scheduled")],
        internationals: [international(900, fromNow(-5 * DAYS))],
        now: NOW,
      }),
      { show: "all-played" },
    );
  });

  it("counts down to the first match still ahead, skipping one already finished", () => {
    const next = international(902, fromNow(2 * DAYS));

    assert.deepEqual(
      squadBannerRow({
        squad: "men",
        states: [state("men", "scheduled")],
        internationals: [international(901, fromNow(-5 * DAYS)), next],
        now: NOW,
      }),
      { show: "next-international", next, couldNotRefresh: false },
    );
  });

  it("keeps counting a match that has kicked off but is still under way", () => {
    const next = international(903, fromNow(-20 * MINUTES));

    assert.deepEqual(
      squadBannerRow({
        squad: "men",
        states: [state("men", "scheduled")],
        internationals: [next],
        now: NOW,
      }),
      { show: "next-international", next, couldNotRefresh: false },
    );
  });

  it("picks the first stored match before there is a clock, so both sides of hydration agree", () => {
    const first = international(904, fromNow(-5 * DAYS));

    assert.deepEqual(
      squadBannerRow({
        squad: "men",
        states: [state("men", "scheduled")],
        internationals: [first, international(905, fromNow(2 * DAYS))],
        now: null,
      }),
      { show: "next-international", next: first, couldNotRefresh: false },
    );
  });

  it("answers for the squad it was asked about and no other", () => {
    const womens = international(906, fromNow(4 * DAYS), "women");

    assert.deepEqual(
      squadBannerRow({
        squad: "women",
        states: [state("men", "scheduled"), state("women", "scheduled")],
        internationals: [international(907, fromNow(2 * DAYS), "men"), womens],
        now: NOW,
      }),
      { show: "next-international", next: womens, couldNotRefresh: false },
    );
  });
});
