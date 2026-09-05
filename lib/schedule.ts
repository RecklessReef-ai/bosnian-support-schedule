import { getUpcomingFixtures, hasApiKey, type RawFixture } from "./api-football";
import { mapWithConcurrency } from "./concurrency";
import { buildMembersByClub, mergeFixtures } from "./merge";
import { getRoster } from "./roster";
import type { Club, ScheduleData } from "./types";

/**
 * How far ahead the Schedule looks. Bounding by time rather than by a match count
 * is what a calendar wants: a fixed per-club limit silently truncated clubs deep
 * in a cup run.
 */
const HORIZON_DAYS = 21;

/** Upper bound per club — generous enough that HORIZON_DAYS is the real limit. */
const FIXTURES_PER_CLUB = 20;

/** Concurrent upstream calls. Keeps a cold request under the per-minute cap. */
const FETCH_CONCURRENCY = 4;

interface ClubResult {
  club: Club;
  fixtures: RawFixture[];
  failed: boolean;
}

export async function getSchedule(): Promise<ScheduleData> {
  const { members } = getRoster();
  const generatedAt = new Date().toISOString();

  if (!hasApiKey()) {
    return { fixtures: [], members, generatedAt, degraded: true, unavailableClubs: [] };
  }

  const membersByClub = buildMembersByClub(members);
  const clubs = [...membersByClub.values()].map((forClub) => forClub[0].club!);

  const results = await mapWithConcurrency<Club, ClubResult>(
    clubs,
    FETCH_CONCURRENCY,
    async (club) => {
      try {
        return {
          club,
          fixtures: await getUpcomingFixtures(club.id, FIXTURES_PER_CLUB),
          failed: false,
        };
      } catch (error) {
        // A failed club used to resolve to an empty list, which is indistinguishable
        // from a club with no upcoming matches — so a partial outage published a
        // confidently wrong Schedule. Report it instead.
        console.error(`[schedule] fixtures for ${club.name} (${club.id}) failed:`, error);
        return { club, fixtures: [], failed: true };
      }
    },
  );

  const horizonEnd = new Date(Date.now() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const fixtures = mergeFixtures(
    results.flatMap((result) => result.fixtures),
    membersByClub,
    horizonEnd,
  );

  return {
    fixtures,
    members,
    generatedAt,
    degraded: false,
    unavailableClubs: results.filter((r) => r.failed).map((r) => r.club),
  };
}
