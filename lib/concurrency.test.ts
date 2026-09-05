import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapWithConcurrency } from "./concurrency.ts";

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe("mapWithConcurrency", () => {
  // The bug this guards: getSchedule used Promise.all over every distinct club,
  // so one cold public request fired ~31 simultaneous upstream calls.
  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 31 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return null;
    });

    assert.ok(peak <= 4, `peak concurrency was ${peak}`);
  });

  it("preserves input order regardless of completion order", async () => {
    const out = await mapWithConcurrency([30, 5, 20, 1], 4, async (ms) => {
      await tick(ms);
      return ms;
    });
    assert.deepEqual(out, [30, 5, 20, 1]);
  });

  it("visits every item exactly once", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      seen.push(n);
      return n;
    });
    assert.deepEqual(seen.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  });

  it("handles an empty input", async () => {
    assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
  });

  it("propagates a rejection rather than swallowing it", async () => {
    await assert.rejects(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
      /boom/,
    );
  });
});
