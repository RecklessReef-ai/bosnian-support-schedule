import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRateLimitBody } from "./api-football.ts";

/**
 * The bug this guards: the provider reports its per-minute cap two ways — HTTP 429,
 * and (far more often) HTTP 200 carrying a `rateLimit` error body. Only the 429 was
 * recognised, so the common case was treated as a permanent failure and never
 * retried. Twelve of thirty-nine clubs then vanished from a published Schedule with
 * no error anywhere.
 */
describe("isRateLimitBody", () => {
  it("recognises the 200-response rate-limit body", () => {
    assert.equal(
      isRateLimitBody({
        rateLimit:
          "Too many requests. You have exceeded the limit of requests per minute of your subscription.",
      }),
      true,
    );
  });

  it("does not mistake other error bodies for a rate limit", () => {
    assert.equal(isRateLimitBody({ token: "invalid api key" }), false);
    assert.equal(isRateLimitBody({ requests: "daily quota reached" }), false);
  });

  it("treats a successful response as no rate limit", () => {
    // A clean call returns an empty array here, not an object.
    assert.equal(isRateLimitBody([]), false);
    assert.equal(isRateLimitBody({}), false);
    assert.equal(isRateLimitBody(null), false);
    assert.equal(isRateLimitBody(undefined), false);
  });
});
