import { getSchedule } from "@/lib/schedule";

export const revalidate = 86400;

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
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
