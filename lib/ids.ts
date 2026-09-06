import type { Squad } from "./types.ts";

/**
 * Derives a stable id for a National Team Member the upstream feed cannot
 * identify: a squad record that arrives with no player id, or a Manual Override
 * naming someone the squad feed omits entirely.
 *
 * Ids are negative so they can never collide with upstream ids, which are
 * positive, and are namespaced by squad because the men's and women's squads are
 * separate feeds that could each list the same name.
 *
 * This lived in two places before — the roster script hashed `squad:name`, the
 * override layer hashed the bare name — so the same player could take two
 * different ids depending on which path produced them. Nothing had collided yet,
 * but only because no override had ever added a player rather than corrected one.
 */
export function syntheticMemberId(squad: Squad, name: string): number {
  return -hash(`${squad}:${name}`);
}

/**
 * Derives a stable id for a Fixture the upstream feed has no id for: an
 * International a maintainer entered by hand from the federation's announcement,
 * which upstream does not carry at all.
 *
 * Negative for the same reason a Member's synthetic id is — upstream ids are
 * positive, so the two spaces cannot meet, and a match the API later starts
 * carrying cannot end up sharing an id with a different fixture. Derived from the
 * squad and the calendar day, which is what identifies the match, so correcting a
 * kickoff time or a venue leaves the id where it was.
 */
export function syntheticFixtureId(squad: Squad, day: string): number {
  return -hash(`${squad}:${day}`);
}

function hash(key: string): number {
  let value = 0;
  for (const char of key) {
    value = (value * 31 + char.charCodeAt(0)) % 1_000_000_007;
  }
  return value;
}
