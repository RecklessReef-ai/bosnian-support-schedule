import { getSchedule } from "@/lib/schedule";

export const revalidate = 3600;

export async function GET() {
  const schedule = await getSchedule();

  return Response.json(
    {
      generatedAt: schedule.generatedAt,
      source: "API-Football",
      // The Roster's own stamp, separate from `generatedAt` above, which is the
      // fixtures'. The two refreshes are independent, so a consumer must not have
      // to assume one date covers both.
      rosterGeneratedAt: schedule.rosterGeneratedAt,
      members: schedule.members,
      fixtures: schedule.fixtures,
      // Non-empty when some clubs' fixtures are missing, so a consumer can tell an
      // incomplete Schedule from a quiet week.
      unavailableClubs: schedule.unavailableClubs,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
