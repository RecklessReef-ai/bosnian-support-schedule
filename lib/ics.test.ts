import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIcs } from "./ics.ts";
import type { Fixture, NationalTeamMember } from "./types.ts";

function member(name: string): NationalTeamMember {
  return {
    id: 1,
    name,
    photo: null,
    position: null,
    squad: "men",
    club: { id: 1, name: "Club", logo: null },
  };
}

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 101,
    kickoff: "2026-09-12T18:30:00.000Z",
    competition: "Bundesliga",
    competitionLogo: null,
    round: "Regular Season - 3",
    venue: "RheinEnergieStadion",
    home: { id: 1, name: "1. FC Köln", logo: null },
    away: { id: 2, name: "VfB Stuttgart", logo: null },
    members: [member("N. Katic")],
    ...overrides,
  };
}

const lines = (ics: string) => ics.split("\r\n");

describe("buildIcs", () => {
  it("emits one VEVENT per fixture", () => {
    const ics = buildIcs([fixture({ id: 1 }), fixture({ id: 2 })], "https://x.test/");
    assert.equal(lines(ics).filter((l) => l === "BEGIN:VEVENT").length, 2);
  });

  it("uses CRLF line endings", () => {
    assert.ok(buildIcs([fixture()], "https://x.test/").includes("\r\n"));
  });

  it("writes DTSTART as a UTC instant and DTEND 115 minutes later", () => {
    const ics = buildIcs([fixture()], "https://x.test/");
    assert.ok(ics.includes("DTSTART:20260912T183000Z"));
    assert.ok(ics.includes("DTEND:20260912T202500Z"));
  });

  it("escapes commas, semicolons and backslashes", () => {
    const ics = buildIcs(
      [fixture({ away: { id: 2, name: "Stuttgart; with, commas", logo: null } })],
      "https://x.test/",
    );
    assert.ok(ics.includes("Stuttgart\\; with\\, commas"));
  });

  // The bug this guards: folding counted UTF-16 string length, but RFC 5545 caps
  // content lines at 75 OCTETS. Bosnian diacritics and the em-dash in DESCRIPTION
  // pushed real lines past the limit.
  it("folds every line to 75 octets or fewer", () => {
    const ics = buildIcs(
      [
        fixture({
          competition: "UEFA Women’s Champions League — Qualifying Round Two",
          home: { id: 1, name: "Željezničar Sarajevo Šabanagić", logo: null },
          members: [member("S. Krajšumović"), member("E. Hasanbegović")],
        }),
      ],
      "https://x.test/",
    );
    for (const line of lines(ics)) {
      assert.ok(
        Buffer.byteLength(line, "utf8") <= 75,
        `line exceeds 75 octets: ${line}`,
      );
    }
  });

  it("survives an unfold round-trip without losing characters", () => {
    const name = "Željezničar Sarajevo Šabanagić";
    const ics = buildIcs([fixture({ home: { id: 1, name, logo: null } })], "https://x.test/");
    assert.ok(ics.replace(/\r\n /g, "").includes(name));
  });

  it("emits a valid calendar wrapper even with no fixtures", () => {
    const out = lines(buildIcs([], "https://x.test/"));
    assert.equal(out[0], "BEGIN:VCALENDAR");
    assert.equal(out.at(-1), "END:VCALENDAR");
  });
});
