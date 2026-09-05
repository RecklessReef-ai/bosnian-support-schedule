import { buildIcs } from "@/lib/ics";
import { getSchedule } from "@/lib/schedule";

export const revalidate = 86400;

export async function GET(request: Request) {
  const { fixtures } = await getSchedule();
  const feedUrl = new URL("/", request.url).toString();

  return new Response(buildIcs(fixtures, feedUrl), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="bosnian-support-schedule.ics"',
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
    },
  });
}
