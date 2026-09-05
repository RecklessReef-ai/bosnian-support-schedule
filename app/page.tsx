import { getSchedule } from "@/lib/schedule";
import { ScheduleFeed } from "./schedule-feed";
import { SquadList } from "./squad-list";
import { TimezoneNote } from "./kickoff-time";

export const revalidate = 86400;

export default async function Home() {
  const { fixtures, members, degraded } = await getSchedule();

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header className="mb-8 flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <span aria-hidden className="text-2xl">
            🇧🇦
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Bosnian Support Schedule
          </h1>
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Every upcoming club match for Bosnia and Herzegovina&apos;s senior men&apos;s
          and women&apos;s national team players, merged into one schedule.
        </p>
        <TimezoneNote />
        <div className="mt-1 flex flex-wrap gap-2">
          <a
            href="/api/calendar.ics"
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-[#0b1020] transition hover:brightness-110"
          >
            Subscribe to calendar
          </a>
          <a
            href="/api/schedule"
            className="rounded-lg border border-border-subtle px-3.5 py-2 text-sm font-medium text-muted transition hover:text-foreground"
          >
            JSON API
          </a>
        </div>
      </header>

      {degraded && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-foreground">
          No <code className="text-accent">API_FOOTBALL_KEY</code> is configured, so
          fixtures can&apos;t be loaded. The squads below come from the committed
          roster.
        </p>
      )}

      <ScheduleFeed fixtures={fixtures} members={members} />

      <SquadList members={members} />

      <footer className="mt-12 border-t border-border-subtle pt-5 text-xs text-faint">
        Fixture and squad data via API-Football. Not affiliated with NFSBiH.
      </footer>
    </main>
  );
}
