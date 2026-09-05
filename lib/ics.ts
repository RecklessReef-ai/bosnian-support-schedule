import type { Fixture } from "./types";

const MATCH_DURATION_MINUTES = 115;

function toIcsTimestamp(iso: string): string {
  return `${iso.replace(/[-:]/g, "").split(".")[0]}Z`;
}

function escapeText(value: string): string {
  return value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

/** RFC 5545 caps content lines at 75 octets; continuations start with a single space. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) chunks.push(` ${rest}`);
  return chunks.join("\r\n");
}

export function buildIcs(fixtures: Fixture[], feedUrl: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bosnian Support Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Bosnian Support Schedule",
    "X-WR-CALDESC:Upcoming club matches for Bosnia and Herzegovina national team members",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  for (const fixture of fixtures) {
    const start = new Date(fixture.kickoff);
    const end = new Date(start.getTime() + MATCH_DURATION_MINUTES * 60_000);
    const names = fixture.members.map((m) => m.name).join(", ");
    const description = [
      `${fixture.competition}${fixture.round ? ` — ${fixture.round}` : ""}`,
      names ? `Bosnian players: ${names}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:fixture-${fixture.id}@bosnian-support-schedule`,
      `DTSTAMP:${toIcsTimestamp(new Date().toISOString())}`,
      `DTSTART:${toIcsTimestamp(start.toISOString())}`,
      `DTEND:${toIcsTimestamp(end.toISOString())}`,
      `SUMMARY:${escapeText(`${fixture.home.name} v ${fixture.away.name}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `URL:${escapeText(feedUrl)}`,
    );
    if (fixture.venue) lines.push(`LOCATION:${escapeText(fixture.venue)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
}
