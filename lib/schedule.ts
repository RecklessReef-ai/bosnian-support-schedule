import { getFixturesFile, getRoster } from "./data-files";
import { buildMembersByClub, mergeFixtures } from "./merge";
import type { ScheduleData } from "./types";

/**
 * How far ahead the Schedule looks. Bounding by time rather than by a match count
 * is what a calendar wants: a fixed per-club limit silently truncated clubs deep
 * in a cup run.
 */
const HORIZON_DAYS = 21;

/**
 * How long a kicked-off match stays on the Schedule. Roughly a match plus stoppage
 * and half-time, so a game in progress is still listed while a finished one drops
 * off. Fixtures come from a file now, so nothing else removes them.
 */
const SHOW_AFTER_KICKOFF_MINUTES = 130;

/**
 * Assembles the Schedule from the committed data files. Makes no upstream calls:
 * `npm run refresh:fixtures` does that offline, so all three surfaces — page, JSON
 * API, ICS feed — cost nothing to serve however often they are rendered.
 *
 * The horizon is applied here rather than at fetch time, so it stays measured from
 * now and not from whenever the refresh last ran.
 */
export async function getSchedule(): Promise<ScheduleData> {
  const { members } = getRoster();
  const { fixtures: raw, generatedAt, unavailableClubs } = getFixturesFile();

  const now = Date.now();
  const horizonEnd = new Date(now + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const windowStart = new Date(now - SHOW_AFTER_KICKOFF_MINUTES * 60 * 1000);
  const fixtures = mergeFixtures(
    raw,
    buildMembersByClub(members),
    horizonEnd,
    windowStart,
  );

  return {
    fixtures,
    members,
    generatedAt,
    degraded: raw.length === 0,
    unavailableClubs,
  };
}
