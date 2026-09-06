import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SHOW_AFTER_KICKOFF_MINUTES } from "./assemble-schedule.ts";
import {
  formatCountdown,
  formatKickoff,
  IN_PROGRESS_MINUTES,
  kickoffDayKey,
} from "./kickoff.ts";

const KICKOFF = "2026-09-25T18:45:00.000Z";

/**
 * The instant this far before kickoff. Every countdown case is "asked at some
 * distance from the match", so the tests say the distance and let this do the
 * arithmetic; a negative field reads as after kickoff.
 */
function distanceFromKickoff({
  days = 0,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0,
}: {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  ms?: number;
}): Date {
  const away =
    ((days * 24 + hours) * 60 + minutes) * 60 * 1000 + seconds * 1000 + ms;
  return new Date(new Date(KICKOFF).getTime() - away);
}

describe("kickoffDayKey", () => {
  it("returns a sortable YYYY-MM-DD key", () => {
    assert.match(kickoffDayKey("2026-09-12T18:30:00.000Z", null), /^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to the UTC day before the viewer's timezone is known", () => {
    assert.equal(kickoffDayKey("2026-09-12T23:30:00.000Z", null), "2026-09-12");
  });

  it("groups by the viewer's day, not the UTC one", () => {
    // 23:30 UTC on the 12th is already the 13th in Sarajevo.
    assert.equal(kickoffDayKey("2026-09-12T23:30:00.000Z", "Europe/Sarajevo"), "2026-09-13");
    // ...and still the 12th in Chicago.
    assert.equal(kickoffDayKey("2026-09-12T23:30:00.000Z", "America/Chicago"), "2026-09-12");
  });

  it("puts two fixtures on the same local evening under one key", () => {
    const a = kickoffDayKey("2026-09-12T16:00:00.000Z", "Europe/Sarajevo");
    const b = kickoffDayKey("2026-09-12T19:45:00.000Z", "Europe/Sarajevo");
    assert.equal(a, b);
  });
});

describe("formatKickoff", () => {
  // The bug this guards: before hydration the server has no viewer timezone, and
  // the UTC clock used to be rendered bare in the primary slot — reading as if it
  // were the viewer's local time.
  it("labels the primary time as UTC when no timezone is known", () => {
    const out = formatKickoff("2026-09-12T18:30:00.000Z", null);
    assert.equal(out.primaryIsLocal, false);
    assert.match(out.primary, /UTC/);
  });

  it("never shows an unlabelled time it cannot vouch for", () => {
    const out = formatKickoff("2026-09-12T18:30:00.000Z", null);
    assert.notEqual(out.primary.trim(), "18:30");
  });

  it("puts local time primary and UTC secondary once the timezone is known", () => {
    const out = formatKickoff("2026-09-12T18:30:00.000Z", "America/Chicago");
    assert.equal(out.primaryIsLocal, true);
    assert.doesNotMatch(out.primary, /UTC/);
    assert.match(out.secondary, /18:30 UTC/);
  });

  it("converts into the viewer's timezone", () => {
    const chicago = formatKickoff("2026-09-12T18:30:00.000Z", "America/Chicago");
    const sarajevo = formatKickoff("2026-09-12T18:30:00.000Z", "Europe/Sarajevo");
    assert.notEqual(chicago.primary, sarajevo.primary);
    // Same instant, so the UTC line must agree.
    assert.equal(chicago.secondary, sarajevo.secondary);
  });

  it("disambiguates the UTC line with a date when the UTC day differs", () => {
    // 01:30 in Sarajevo on the 13th is 23:30 UTC on the 12th.
    const out = formatKickoff("2026-09-12T23:30:00.000Z", "Europe/Sarajevo");
    assert.match(out.secondary, /Sep/);
  });

  it("omits the date from the UTC line when both fall on the same day", () => {
    const out = formatKickoff("2026-09-12T14:00:00.000Z", "Europe/Sarajevo");
    assert.doesNotMatch(out.secondary, /Sep/);
  });
});

describe("formatCountdown", () => {
  it("counts weeks out in days, hours, minutes and seconds", () => {
    const out = formatCountdown(
      KICKOFF,
      distanceFromKickoff({ days: 23, hours: 4, minutes: 32, seconds: 11 }),
    );
    assert.equal(out.status, "counting");
    assert.equal(out.display, "23d 04h 32m 11s");
  });

  it("counts a few days out the same way", () => {
    const out = formatCountdown(
      KICKOFF,
      distanceFromKickoff({ days: 2, hours: 6, seconds: 9 }),
    );
    assert.equal(out.display, "2d 06h 00m 09s");
  });

  it("drops the day figure inside the last day rather than showing 0d", () => {
    const out = formatCountdown(
      KICKOFF,
      distanceFromKickoff({ hours: 5, minutes: 12, seconds: 3 }),
    );
    assert.equal(out.display, "05h 12m 03s");
  });

  it("drops down to seconds alone in the last minute", () => {
    const out = formatCountdown(KICKOFF, distanceFromKickoff({ seconds: 42 }));
    assert.equal(out.status, "counting");
    assert.equal(out.display, "42s");
  });

  // Digits are rendered in tabular figures so they do not jitter, which only
  // holds if the count keeps its own width too: 9 seconds must not narrow the line
  // to a single figure ten times a minute.
  it("zero-pads every figure below days, even when it leads", () => {
    assert.equal(
      formatCountdown(KICKOFF, distanceFromKickoff({ seconds: 9 })).display,
      "09s",
    );
    assert.equal(
      formatCountdown(KICKOFF, distanceFromKickoff({ minutes: 4, seconds: 4 }))
        .display,
      "04m 04s",
    );
    assert.equal(
      formatCountdown(
        KICKOFF,
        distanceFromKickoff({ days: 1, hours: 2, minutes: 3, seconds: 4 }),
      ).display,
      "1d 02h 03m 04s",
    );
  });

  it("counts down whole seconds rather than rounding up to the next one", () => {
    const out = formatCountdown(
      KICKOFF,
      distanceFromKickoff({ seconds: 9, ms: 900 }),
    );
    assert.equal(out.display, "09s");
  });

  // The bug this guards: a countdown that keeps subtracting past kickoff shows a
  // fan a negative number to interpret at exactly the moment the match starts.
  it("reads as under way at the moment of kickoff rather than reaching zero", () => {
    const out = formatCountdown(KICKOFF, new Date(KICKOFF));
    assert.equal(out.status, "in-progress");
    assert.equal(out.display, "");
  });

  it("still reads as under way at half-time", () => {
    const out = formatCountdown(
      KICKOFF,
      distanceFromKickoff({ minutes: -55 }),
    );
    assert.equal(out.status, "in-progress");
  });

  it("stops calling a match under way once the Schedule has dropped it", () => {
    const stillOn = formatCountdown(
      KICKOFF,
      distanceFromKickoff({ minutes: -(IN_PROGRESS_MINUTES - 1) }),
    );
    const over = formatCountdown(
      KICKOFF,
      distanceFromKickoff({ minutes: -IN_PROGRESS_MINUTES }),
    );
    assert.equal(stillOn.status, "in-progress");
    assert.equal(over.status, "finished");
    assert.equal(over.display, "");
  });

  // The banner sits directly above the feed, so the two must agree about how long
  // a kicked-off match is still a thing on this page.
  it("keeps in step with how long assembly keeps a kicked-off match", () => {
    assert.equal(IN_PROGRESS_MINUTES, SHOW_AFTER_KICKOFF_MINUTES);
  });

  it("is a pure function of the kickoff and the instant it is asked at", () => {
    const now = distanceFromKickoff({ days: 3, minutes: 7, seconds: 1 });
    assert.deepEqual(formatCountdown(KICKOFF, now), formatCountdown(KICKOFF, now));
  });

  it("reads a stored kickoff written with an offset, not just a Z", () => {
    // data/internationals.json writes "+00:00" where the app writes "Z".
    const offset = formatCountdown(
      "2026-09-25T18:45:00+00:00",
      distanceFromKickoff({ hours: 1 }),
    );
    assert.equal(offset.display, "01h 00m 00s");
  });
});
