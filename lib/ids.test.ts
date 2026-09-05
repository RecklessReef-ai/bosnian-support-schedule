import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { syntheticMemberId } from "./ids.ts";

describe("syntheticMemberId", () => {
  it("stays clear of upstream ids by being negative", () => {
    assert.ok(syntheticMemberId("women", "M. Hrelja") < 0);
  });

  it("is stable for the same squad and name", () => {
    assert.equal(
      syntheticMemberId("men", "A. Delić"),
      syntheticMemberId("men", "A. Delić"),
    );
  });

  it("separates the same name in the two squads", () => {
    assert.notEqual(
      syntheticMemberId("men", "A. Delić"),
      syntheticMemberId("women", "A. Delić"),
    );
  });

  // The bug this guards: this was two functions with different inputs — the roster
  // script hashed `squad:name`, the override layer hashed the bare name — so one
  // player could take two ids depending on which produced them. Both now call this.
  it("matches the id already persisted in data/roster.json", () => {
    const roster = JSON.parse(
      readFileSync(new URL("../data/roster.json", import.meta.url), "utf8"),
    ) as { members: { id: number; name: string; squad: "men" | "women" }[] };

    const synthetic = roster.members.filter((m) => m.id < 0);
    assert.ok(synthetic.length > 0, "expected at least one synthetic id on disk");

    for (const member of synthetic) {
      assert.equal(
        member.id,
        syntheticMemberId(member.squad, member.name),
        `${member.name} would be renumbered by the next roster refresh`,
      );
    }
  });

  it("gives every member on disk a distinct id", () => {
    const roster = JSON.parse(
      readFileSync(new URL("../data/roster.json", import.meta.url), "utf8"),
    ) as { members: { id: number }[] };
    const ids = new Set(roster.members.map((m) => m.id));
    assert.equal(ids.size, roster.members.length);
  });
});
