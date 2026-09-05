import type { RawFixture } from "./api-football";
import type { Fixture, NationalTeamMember } from "./types";

/**
 * Pure Schedule assembly, kept free of I/O so it can be tested directly.
 * `lib/schedule.ts` owns the fetching and calls in here.
 */

function toFixture(raw: RawFixture, members: NationalTeamMember[]): Fixture {
  return {
    id: raw.fixture.id,
    kickoff: new Date(raw.fixture.date).toISOString(),
    competition: raw.league.name,
    competitionLogo: raw.league.logo,
    round: raw.league.round,
    venue: raw.fixture.venue?.name ?? null,
    home: raw.teams.home,
    away: raw.teams.away,
    members,
  };
}

export function buildMembersByClub(
  members: readonly NationalTeamMember[],
): Map<number, NationalTeamMember[]> {
  const byClub = new Map<number, NationalTeamMember[]>();
  for (const member of members) {
    if (!member.club) continue;
    const existing = byClub.get(member.club.id);
    if (existing) existing.push(member);
    else byClub.set(member.club.id, [member]);
  }
  return byClub;
}

/**
 * Folds every club's fixture list into one chronological Schedule, keeping only
 * matches inside [`windowStart`, `horizonEnd`].
 *
 * Two National Team Members at the same club — or facing each other — share a
 * single Fixture, so the same match can arrive from several clubs' feeds and must
 * collapse to one entry listing everyone involved.
 *
 * `windowStart` matters because fixtures now come from a file refreshed once a day
 * rather than a live "next 20" query. Upstream only ever returned upcoming matches,
 * so nothing needed to drop them; a stored fixture, by contrast, becomes a past
 * fixture just by sitting there. Callers pass a start slightly in the past so a
 * match already under way still shows.
 */
export function mergeFixtures(
  raws: readonly RawFixture[],
  membersByClub: Map<number, NationalTeamMember[]>,
  horizonEnd: Date,
  windowStart: Date = new Date(0),
): Fixture[] {
  const merged = new Map<number, Fixture>();

  for (const raw of raws) {
    const kickoff = new Date(raw.fixture.date);
    if (kickoff > horizonEnd || kickoff < windowStart) continue;

    const involved = [
      ...(membersByClub.get(raw.teams.home.id) ?? []),
      ...(membersByClub.get(raw.teams.away.id) ?? []),
    ];
    if (involved.length === 0) continue;

    const existing = merged.get(raw.fixture.id);
    if (existing) {
      for (const member of involved) {
        if (!existing.members.some((m) => m.id === member.id)) {
          existing.members.push(member);
        }
      }
    } else {
      merged.set(raw.fixture.id, toFixture(raw, involved));
    }
  }

  return [...merged.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}
