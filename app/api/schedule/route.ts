import { getSchedule } from "@/lib/schedule";

export const revalidate = 3600;

export async function GET() {
  const schedule = await getSchedule();

  return Response.json(
    {
      generatedAt: schedule.generatedAt,
      // The Roster's own stamp, separate from `generatedAt` above, which is the
      // fixtures'. The two refreshes are independent, so a consumer must not have
      // to assume one date covers both.
      rosterGeneratedAt: schedule.rosterGeneratedAt,
      members: schedule.members,
      // One chronological array of both kinds, so a consumer never has to merge and
      // re-sort two lists. Each Fixture declares its `kind` and its own `source`;
      // the top-level `source: "API-Football"` this used to carry is gone, because
      // one site-wide credit cannot be true of a match a human entered from the
      // federation's announcement. See `docs/adr/0004`.
      fixtures: schedule.fixtures,
      // Non-empty when some clubs' fixtures are missing, so a consumer can tell an
      // incomplete Schedule from a quiet week.
      unavailableClubs: schedule.unavailableClubs,
      // Both squads, always. `status` is "scheduled", "none-scheduled" or
      // "unavailable" — an empty calendar and an outage are different facts.
      squadInternationals: schedule.squadInternationals,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
