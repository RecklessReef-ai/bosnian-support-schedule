import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retryDelayMs, throttleDelayMs } from "./pacing.ts";

describe("throttleDelayMs", () => {
  it("waits out the remainder of the interval", () => {
    assert.equal(throttleDelayMs(1_000, 3_500, 6_500), 4_000);
  });

  it("does not wait when the interval has already elapsed", () => {
    assert.equal(throttleDelayMs(1_000, 20_000, 6_500), 0);
  });

  it("never returns a negative delay", () => {
    assert.ok(throttleDelayMs(0, Number.MAX_SAFE_INTEGER, 6_500) >= 0);
  });

  it("does not throttle the first call", () => {
    assert.equal(throttleDelayMs(0, Date.now(), 6_500), 0);
  });
});

describe("retryDelayMs", () => {
  it("backs off exponentially from the pacing interval", () => {
    assert.equal(retryDelayMs(0, 1_000, 4), 2_000);
    assert.equal(retryDelayMs(1, 1_000, 4), 4_000);
    assert.equal(retryDelayMs(2, 1_000, 4), 8_000);
  });

  it("gives up once retries are exhausted", () => {
    assert.equal(retryDelayMs(4, 1_000, 4), null);
    assert.equal(retryDelayMs(5, 1_000, 4), null);
  });

  it("waits longer on each successive attempt", () => {
    const delays = [0, 1, 2, 3].map((n) => retryDelayMs(n, 6_500, 4)!);
    for (let i = 1; i < delays.length; i += 1) {
      assert.ok(delays[i] > delays[i - 1]);
    }
  });
});
