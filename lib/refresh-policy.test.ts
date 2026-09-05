import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FRESH_ENOUGH_MS,
  MAX_AGE_MS,
  needsRefresh,
  type RefreshCandidate,
} from "./refresh-policy.ts";

const NOW = Date.parse("2026-09-20T12:00:00.000Z");
const agoMs = (ms: number) => new Date(NOW - ms).toISOString();
const inDays = (d: number) => NOW + d * 24 * 60 * 60 * 1000;

const candidate = (over: Partial<RefreshCandidate> = {}): RefreshCandidate => ({
  lastFetchedAt: agoMs(HOURS(1)),
  nextKickoff: inDays(10),
  ...over,
});
function HOURS(n: number) {
  return n * 60 * 60 * 1000;
}

describe("needsRefresh", () => {
  it("fetches a club it has never seen", () => {
    assert.equal(needsRefresh(candidate({ lastFetchedAt: null }), NOW), true);
  });

  // The saving this exists for: one call returns months of fixtures, so a club with
  // nothing due for weeks does not need re-fetching every single day.
  it("skips a quiet club fetched recently", () => {
    assert.equal(
      needsRefresh({ lastFetchedAt: agoMs(HOURS(25)), nextKickoff: inDays(10) }, NOW),
      false,
    );
  });

  it("re-fetches a club playing within days", () => {
    assert.equal(
      needsRefresh({ lastFetchedAt: agoMs(HOURS(25)), nextKickoff: inDays(1) }, NOW),
      true,
    );
  });

  it("leaves an imminent club alone if it was just fetched", () => {
    assert.equal(
      needsRefresh({ lastFetchedAt: agoMs(HOURS(1)), nextKickoff: inDays(1) }, NOW),
      false,
    );
  });

  it("re-checks everything eventually, however quiet", () => {
    assert.equal(
      needsRefresh(
        { lastFetchedAt: agoMs(MAX_AGE_MS + 1), nextKickoff: inDays(60) },
        NOW,
      ),
      true,
    );
  });

  // Off-season clubs store no fixtures at all; they must still be retried.
  it("retries a club with no stored matches once it goes stale", () => {
    assert.equal(
      needsRefresh({ lastFetchedAt: agoMs(HOURS(25)), nextKickoff: null }, NOW),
      false,
    );
    assert.equal(
      needsRefresh({ lastFetchedAt: agoMs(MAX_AGE_MS + 1), nextKickoff: null }, NOW),
      true,
    );
  });

  it("fires just under a day so a daily job never skips an imminent club", () => {
    assert.ok(FRESH_ENOUGH_MS < 24 * 60 * 60 * 1000);
    assert.equal(
      needsRefresh(
        { lastFetchedAt: agoMs(FRESH_ENOUGH_MS + 1), nextKickoff: inDays(1) },
        NOW,
      ),
      true,
    );
  });

  it("refetches rather than trusting an unparseable or future timestamp", () => {
    assert.equal(needsRefresh(candidate({ lastFetchedAt: "not a date" }), NOW), true);
    assert.equal(
      needsRefresh(candidate({ lastFetchedAt: new Date(NOW + 5000).toISOString() }), NOW),
      true,
    );
  });
});
