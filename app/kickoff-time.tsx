"use client";

import { formatKickoff } from "@/lib/kickoff";
import { useHydrated } from "./use-hydrated";
import { useViewerTimeZone } from "./use-viewer-timezone";

export function KickoffTime({ kickoff }: { kickoff: string }) {
  const { primary, primaryIsLocal, secondary } = formatKickoff(
    kickoff,
    useViewerTimeZone(),
  );

  return (
    <div className="flex flex-col items-start tabular-nums">
      <span
        className={
          primaryIsLocal
            ? "text-lg font-semibold text-foreground"
            : "text-lg font-semibold text-muted"
        }
      >
        {primary}
      </span>
      {secondary && <span className="text-[11px] text-faint">{secondary}</span>}
    </div>
  );
}

export function DayHeading({ kickoff }: { kickoff: string }) {
  const hydrated = useHydrated();
  if (!hydrated) return <>{kickoff.slice(0, 10)}</>;
  return (
    <>
      {new Date(kickoff).toLocaleDateString([], {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
    </>
  );
}

export function TimezoneNote() {
  const zone = useViewerTimeZone();

  // Before hydration every time on the page is labelled UTC, so say that rather
  // than rendering nothing and leaving the reader to assume it's local.
  if (!zone) {
    return <p className="text-xs text-faint">Times shown in UTC.</p>;
  }

  return (
    <p className="text-xs text-faint">
      Times shown in your timezone ({zone}), with UTC underneath.
    </p>
  );
}
