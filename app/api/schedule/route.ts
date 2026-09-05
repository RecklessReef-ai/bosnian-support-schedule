import { getSchedule } from "@/lib/schedule";

export const revalidate = 43200;

export async function GET() {
  const schedule = await getSchedule();

  return Response.json(
    {
      generatedAt: schedule.generatedAt,
      source: "API-Football",
      members: schedule.members,
      fixtures: schedule.fixtures,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
