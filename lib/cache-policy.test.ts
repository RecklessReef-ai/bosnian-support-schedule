import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FIXTURES_TTL_SECONDS } from "./api-football.ts";

/**
 * Next.js requires `export const revalidate` to be a statically analysable
 * literal, so these files cannot import FIXTURES_TTL_SECONDS. Nothing but this
 * test stops the two from drifting apart — which they already did once, leaving
 * the constant at 24h while every route said 12h.
 */
const ROUTES = [
  "app/page.tsx",
  "app/api/schedule/route.ts",
  "app/api/calendar.ics/route.ts",
];

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("cache policy", () => {
  for (const route of ROUTES) {
    it(`${route} revalidates on FIXTURES_TTL_SECONDS`, () => {
      const match = read(route).match(/export const revalidate = (\d+)/);
      assert.ok(match, `${route} declares no revalidate`);
      assert.equal(Number(match[1]), FIXTURES_TTL_SECONDS);
    });
  }

  it("Cache-Control s-maxage agrees with FIXTURES_TTL_SECONDS", () => {
    for (const route of ROUTES) {
      for (const [, seconds] of read(route).matchAll(/s-maxage=(\d+)/g)) {
        assert.equal(Number(seconds), FIXTURES_TTL_SECONDS, `in ${route}`);
      }
    }
  });
});
