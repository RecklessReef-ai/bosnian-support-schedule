import { getUpcomingFixtures, hasApiKey, type RawFixture } from "./api-football";
import { mapWithConcurrency } from "./concurrency";
import { buildMembersByClub, mergeFixtures } from "./merge";
import { getRoster } from "./roster";
import type { ScheduleData } from "./types";

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

export async function getSchedule(): Promise<ScheduleData> {
  const { members } = getRoster();
  const generatedAt = new Date().toISOString();

  if (!hasApiKey()) {
    return { fixtures: [], members, generatedAt, degraded: true };
  }

  const membersByClub = buildMembersByClub(members);
  const perClub = await mapWithConcurrency(
    [...membersByClub.keys()],
    FETCH_CONCURRENCY,
    (clubId) =>
      getUpcomingFixtures(clubId, FIXTURES_PER_CLUB).catch(() => [] as RawFixture[]),
  );

  const horizonEnd = new Date(Date.now() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const fixtures = mergeFixtures(perClub.flat(), membersByClub, horizonEnd);

  return { fixtures, members, generatedAt, degraded: false };
}
