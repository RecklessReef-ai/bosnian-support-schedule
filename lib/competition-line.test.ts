import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { competitionLine } from "./competition-line.ts";

describe("competitionLine", () => {
  it("names a bare numeric round, which would otherwise read as a stray digit", () => {
    assert.equal(
      competitionLine({ competition: "UEFA Nations League", round: "1" }),
      "UEFA Nations League · Round 1",
    );
  });

  it("leaves an already-named round alone rather than prefixing it", () => {
    for (const round of ["Group Stage", "Regular Season - 4", "1st Round"]) {
      assert.equal(
        competitionLine({ competition: "Cup", round }),
        `Cup · ${round}`,
        round,
      );
    }
  });

  it("shows the competition alone when there is no round", () => {
    assert.equal(competitionLine({ competition: "Friendly", round: null }), "Friendly");
    assert.equal(competitionLine({ competition: "Friendly", round: "" }), "Friendly");
  });
});
