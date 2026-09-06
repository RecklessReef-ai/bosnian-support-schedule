import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syntheticMemberId } from "./ids.ts";
import {
  CLUB_LOOKUP_RETRY_MS,
  planSquadMembers,
  type SquadPlayer,
  type StoredMember,
} from "./roster.ts";
import type { Club } from "./types.ts";

const NOW = Date.parse("2026-09-20T12:00:00.000Z");
const agoMs = (ms: number) => new Date(NOW - ms).toISOString();
const ROMA: Club = { id: 497, name: "AS Roma", logo: null };

const player = (over: Partial<SquadPlayer> = {}): SquadPlayer => ({
  id: 100,
  name: "E. Džeko",
  photo: "https://media.api-sports.io/football/players/100.png",
  position: "Attacker",
  ...over,
});

const cachedMember = (over: Partial<StoredMember> = {}): StoredMember => ({
  id: 100,
  name: "E. Džeko",
  photo: null,
  position: "Attacker",
  squad: "men",
  club: ROMA,
  ...over,
});

const plan = (
  players: SquadPlayer[],
  cached: StoredMember[] = [],
  squad: "men" | "women" = "men",
) => planSquadMembers(players, squad, cached, NOW);

describe("planSquadMembers", () => {
  // The saving this exists for: sixty-odd Members at one call each would eat most
  // of a 100/day budget, and a squad barely changes between call-ups.
  it("reuses a Club already on record rather than resolving it again", () => {
    const [planned] = plan([player()], [cachedMember()]);

    assert.equal(planned.needsClub, false);
    assert.deepEqual(planned.member.club, ROMA);
  });

  it("asks for a Club only for a Member who has none on record", () => {
    const planned = plan([player(), player({ id: 200, name: "A. Delić" })], [
      cachedMember(),
    ]);

    assert.deepEqual(
      planned.map((entry) => entry.needsClub),
      [false, true],
    );
    assert.equal(planned[1].member.club, null);
  });

  it("takes everything but the Club from the fresh squad list", () => {
    const [planned] = plan(
      [player({ name: "Edin Džeko", position: "Midfielder" })],
      [cachedMember({ name: "E. Džeko", photo: null, position: "Attacker" })],
    );

    assert.equal(planned.member.name, "Edin Džeko");
    assert.equal(planned.member.position, "Midfielder");
    assert.equal(planned.member.photo, player().photo);
    assert.deepEqual(planned.member.club, ROMA);
  });

  // Twenty-nine Members have no Club anywhere upstream. Asking after each of them
  // every morning would spend a third of the daily budget re-learning nothing.
  it("does not ask again about a Member looked up recently and not found", () => {
    const [planned] = plan(
      [player()],
      [cachedMember({ club: null, clubCheckedAt: agoMs(CLUB_LOOKUP_RETRY_MS - 1) })],
    );

    assert.equal(planned.needsClub, false);
    assert.equal(planned.member.club, null);
    assert.equal(planned.member.clubCheckedAt, agoMs(CLUB_LOOKUP_RETRY_MS - 1));
  });

  it("tries a fruitless lookup again once it is a week old", () => {
    const [planned] = plan(
      [player()],
      [cachedMember({ club: null, clubCheckedAt: agoMs(CLUB_LOOKUP_RETRY_MS) })],
    );

    assert.equal(planned.needsClub, true);
  });

  it("looks up a Member who has never been looked up", () => {
    const [planned] = plan([player()], [cachedMember({ club: null })]);

    assert.equal(planned.needsClub, true);
  });

  it("looks up rather than trusting an unparseable or future stamp", () => {
    assert.equal(
      plan([player()], [cachedMember({ club: null, clubCheckedAt: "not a date" })])[0]
        .needsClub,
      true,
    );
    assert.equal(
      plan(
        [player()],
        [cachedMember({ club: null, clubCheckedAt: new Date(NOW + 5000).toISOString() })],
      )[0].needsClub,
      true,
    );
  });

  it("forgets the stamp once a Member has a Club", () => {
    const [planned] = plan(
      [player()],
      [cachedMember({ clubCheckedAt: agoMs(CLUB_LOOKUP_RETRY_MS - 1) })],
    );

    assert.equal(planned.member.clubCheckedAt, undefined);
  });

  // Id 0 means upstream cannot identify them, so there is nothing to look up.
  it("gives an unidentified player a synthetic id and no lookup", () => {
    const [planned] = plan([player({ id: 0, name: "M. Hrelja" })], [], "women");

    assert.equal(planned.member.id, syntheticMemberId("women", "M. Hrelja"));
    assert.equal(planned.needsClub, false);
    assert.equal(planned.member.club, null);
  });

  it("drops a Member who is no longer in the squad", () => {
    const planned = plan([player({ id: 200, name: "A. Delić" })], [cachedMember()]);

    assert.deepEqual(
      planned.map((entry) => entry.member.name),
      ["A. Delić"],
    );
  });

  it("stamps the squad it was given onto every Member", () => {
    const planned = plan([player({ id: 300, name: "M. Hrelja" })], [], "women");

    assert.deepEqual(
      planned.map((entry) => entry.member.squad),
      ["women"],
    );
  });
});
