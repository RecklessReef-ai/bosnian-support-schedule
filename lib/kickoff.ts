export interface KickoffDisplay {
  /** The prominent time. Carries a "UTC" label whenever it is not the viewer's own. */
  primary: string;
  /** True once the viewer's timezone is known and `primary` is in it. */
  primaryIsLocal: boolean;
  /** The de-emphasised UTC line. Empty when `primary` is already the UTC time. */
  secondary: string;
}

function timePart(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

function dayPart(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(iso));
}

/**
 * Chooses what to show for a kickoff.
 *
 * The server cannot know the viewer's timezone, so before hydration there is no
 * honest local time to show. Rendering the UTC clock bare in the prominent slot
 * would read as the viewer's own time and be wrong by hours — so when `timeZone`
 * is null the primary time is explicitly labelled UTC instead.
 */
export function formatKickoff(
  iso: string,
  timeZone: string | null,
): KickoffDisplay {
  const utcTime = `${timePart(iso, "UTC")} UTC`;

  if (!timeZone) {
    return { primary: utcTime, primaryIsLocal: false, secondary: "" };
  }

  // A late kickoff can land on a different UTC date than the viewer's, so the
  // bare UTC clock would be ambiguous under a local-day heading.
  const sameDay = dayPart(iso, timeZone) === dayPart(iso, "UTC");

  return {
    primary: timePart(iso, timeZone),
    primaryIsLocal: true,
    secondary: sameDay ? utcTime : `${dayPart(iso, "UTC")} ${utcTime}`,
  };
}
