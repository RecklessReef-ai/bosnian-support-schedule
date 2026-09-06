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
 * The calendar day a kickoff falls on, as a sortable `YYYY-MM-DD` key, in the
 * viewer's timezone once it is known and UTC before that.
 *
 * The feed groups fixtures under day headings, so this has to agree with the day
 * the heading itself renders — otherwise one evening's matches split across two
 * headings. It takes the same `timeZone | null` as `formatKickoff` rather than a
 * hydrated flag, so both sides of that agreement are stated the same way.
 */
export function kickoffDayKey(iso: string, timeZone: string | null): string {
  // en-CA formats as YYYY-MM-DD, which sorts lexicographically.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timeZone ?? "UTC",
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

/**
 * How long after kickoff a match still reads as under way rather than finished.
 *
 * It has to be the same number as `SHOW_AFTER_KICKOFF_MINUTES` in
 * `lib/assemble-schedule.ts`, which decides how long a kicked-off Fixture stays on
 * the Schedule. If the two drifted apart the banner would contradict the feed
 * directly beneath it — still counting down to a match the feed had dropped, or
 * calling a match finished while it is listed a few rows below. It is restated
 * here rather than imported because this module is bundled into the browser and
 * assembly is not; `lib/kickoff.test.ts` pins the two together instead.
 */
export const IN_PROGRESS_MINUTES = 130;

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface CountdownDisplay {
  /**
   * Whether the match is still ahead, under way, or far enough past kickoff that
   * the Schedule has stopped listing it.
   */
  status: "counting" | "in-progress" | "finished";
  /**
   * The ticking figure — days, hours, minutes and seconds, largest unit first.
   * Empty unless `status` is "counting": the other two states are not a duration,
   * and wording them is the caller's job rather than this module's.
   */
  display: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * How long until a kickoff, as a fan reads it.
 *
 * Pure and total, taking the current instant rather than reading a clock, because
 * every interesting case is about *when* it is asked — the last minute before
 * kickoff, the moment of it, half-time — and none of those can be pinned by a test
 * against a real clock.
 *
 * Counting stops at kickoff rather than running negative. A fan who opens the page
 * at half-time wants to be told the match is on, not handed a minus sign to
 * interpret; and once the grace period is up the match has left the Schedule, so
 * the banner must stop claiming it is on as well.
 */
export function formatCountdown(iso: string, now: Date): CountdownDisplay {
  const remaining = new Date(iso).getTime() - now.getTime();

  if (remaining <= 0) {
    const since = -remaining;
    const status =
      since < IN_PROGRESS_MINUTES * MINUTE_MS ? "in-progress" : "finished";
    return { status, display: "" };
  }

  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((remaining % MINUTE_MS) / SECOND_MS);

  // Leading empty units are dropped rather than shown as "0d 00h": a fan five
  // hours out should read hours straight away instead of past two zeroes. A unit
  // only ever disappears once, so this costs nothing in jitter.
  //
  // Everything below days stays zero-padded even when it leads, because those are
  // exactly the figures that churn: "9s" narrowing from "09s" would move the line
  // ten times a minute, which is the jitter tabular figures are there to prevent.
  // Days are left bare — the count can run to three figures, so padding it to two
  // would be an arbitrary width, and it changes once a day rather than once a
  // second.
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (parts.length > 0 || hours > 0) parts.push(`${pad(hours)}h`);
  if (parts.length > 0 || minutes > 0) parts.push(`${pad(minutes)}m`);
  parts.push(`${pad(seconds)}s`);

  return { status: "counting", display: parts.join(" ") };
}
