import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SCHEDULE_REVALIDATE_SECONDS } from "./cache-policy.ts";

/**
 * Next.js requires `export const revalidate` to be a statically analysable literal,
 * so these files cannot import SCHEDULE_REVALIDATE_SECONDS. Nothing but this test
 * stops the two drifting apart — which they already did once, leaving the constant
 * at 24h while every route said 12h.
 */
const ROUTES = ["app/page.tsx", "app/api/schedule/route.ts"];

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("cache policy", () => {
  for (const route of ROUTES) {
    it(`${route} revalidates on SCHEDULE_REVALIDATE_SECONDS`, () => {
      const match = read(route).match(/export const revalidate = (\d+)/);
      assert.ok(match, `${route} declares no revalidate`);
      assert.equal(Number(match[1]), SCHEDULE_REVALIDATE_SECONDS);
    });
  }

  it("Cache-Control s-maxage agrees with SCHEDULE_REVALIDATE_SECONDS", () => {
    for (const route of ROUTES) {
      for (const [, seconds] of read(route).matchAll(/s-maxage=(\d+)/g)) {
        assert.equal(Number(seconds), SCHEDULE_REVALIDATE_SECONDS, `in ${route}`);
      }
    }
  });
});
