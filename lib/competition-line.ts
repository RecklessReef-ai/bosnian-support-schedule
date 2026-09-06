import type { Fixture } from "./types.ts";

/**
 * A Fixture's competition and round, as one line: "UEFA Nations League · Round 1".
 *
 * Upstream gives an International's round as a bare number, which reads as a stray
 * digit — "UEFA Nations League · 1" — wherever it appears. The word is supplied
 * only when the round really is just a number, so a named round ("Group Stage",
 * "Regular Season - 4") is never mangled into "Round Group Stage".
 *
 * Shared rather than local to one component: the banner and the feed show the same
 * Fixture within a screen of each other, and they briefly disagreed — the banner
 * saying "Round 1" while the card below it said "· 1".
 */
export function competitionLine({
  competition,
  round,
}: Pick<Fixture, "competition" | "round">): string {
  if (!round) return competition;
  return `${competition} · ${/^\d+$/.test(round) ? `Round ${round}` : round}`;
}
