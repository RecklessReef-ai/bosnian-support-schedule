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
  let hash = 0;
  for (const char of `${squad}:${name}`) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000_007;
  }
  return -hash;
}
