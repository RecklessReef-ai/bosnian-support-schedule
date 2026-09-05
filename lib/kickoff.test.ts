import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatKickoff } from "./kickoff.ts";

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
