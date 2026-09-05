import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairMojibake } from "./text.ts";

// "Ä\x87" is the mojibake run for "ć". Upstream records are only PARTLY corrupted:
// "ž" survives intact in the same string, which is what broke the first attempt —
// a whole-string Latin-1 round-trip turned "ž" (U+017E, no Latin-1 form) into "~".
const C = "Ä";

describe("repairMojibake", () => {
  it("repairs a mojibake run", () => {
    assert.equal(repairMojibake(`I. Fakovi${C}`), "I. Faković");
  });

  it("repairs a run without corrupting correct characters beside it", () => {
    assert.equal(repairMojibake(`A. Hodži${C}`), "A. Hodžić");
  });

  it("leaves already-correct strings untouched", () => {
    for (const name of ["I. Dumanjić", "A. Delić", "Đ. Velagić", "E. Šabanagić"]) {
      assert.equal(repairMojibake(name), name);
    }
  });

  it("leaves plain ASCII untouched", () => {
    assert.equal(repairMojibake("Red Bull Salzburg"), "Red Bull Salzburg");
  });

  it("leaves non-Bosnian diacritics untouched", () => {
    assert.equal(repairMojibake("Beşiktaş"), "Beşiktaş");
    assert.equal(repairMojibake("Górnik Łęczna"), "Górnik Łęczna");
  });

  it("is idempotent", () => {
    const once = repairMojibake(`E. Hasanbegovi${C}`);
    assert.equal(repairMojibake(once), once);
  });
});
