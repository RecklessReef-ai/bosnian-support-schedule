import { getUpcomingFixtures, hasApiKey, type RawFixture } from "./api-football";
import { getRoster } from "./roster";
import type { Fixture, NationalTeamMember, ScheduleData } from "./types";

const FIXTURES_PER_CLUB = 5;

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

export async function getSchedule(): Promise<ScheduleData> {
  const { members } = getRoster();
  const generatedAt = new Date().toISOString();

  if (!hasApiKey()) {
    return { fixtures: [], members, generatedAt, degraded: true };
  }

  const membersByClub = new Map<number, NationalTeamMember[]>();
  for (const member of members) {
    if (!member.club) continue;
    const existing = membersByClub.get(member.club.id);
    if (existing) existing.push(member);
    else membersByClub.set(member.club.id, [member]);
  }

  const perClub = await Promise.all(
    [...membersByClub.keys()].map((clubId) =>
      getUpcomingFixtures(clubId, FIXTURES_PER_CLUB).catch(() => [] as RawFixture[]),
    ),
  );

  // Two National Team Members at the same club, or facing each other, share one Fixture.
  const merged = new Map<number, Fixture>();
  for (const raw of perClub.flat()) {
    const involved = [
      ...(membersByClub.get(raw.teams.home.id) ?? []),
      ...(membersByClub.get(raw.teams.away.id) ?? []),
    ];
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

  const fixtures = [...merged.values()].sort((a, b) =>
    a.kickoff.localeCompare(b.kickoff),
  );

  return { fixtures, members, generatedAt, degraded: false };
}
