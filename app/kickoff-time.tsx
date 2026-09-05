"use client";

import { useHydrated } from "./use-hydrated";

function utcLabel(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

export function KickoffTime({ kickoff }: { kickoff: string }) {
  const hydrated = useHydrated();
  const local = hydrated
    ? new Date(kickoff).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : utcLabel(kickoff).replace(" UTC", "");

  return (
    <div className="flex flex-col items-start tabular-nums">
      <span className="text-lg font-semibold text-foreground">{local}</span>
      <span className="text-[11px] text-faint">{utcLabel(kickoff)}</span>
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
  const hydrated = useHydrated();
  if (!hydrated) return null;

  return (
    <p className="text-xs text-faint">
      Times shown in your timezone (
      {Intl.DateTimeFormat().resolvedOptions().timeZone}), with UTC underneath.
    </p>
  );
}
