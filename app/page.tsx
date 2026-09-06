import { getSchedule } from "@/lib/schedule";
import type { Squad, SquadInternationalsState } from "@/lib/types";
import { ScheduleFeed } from "./schedule-feed";
import { SquadList } from "./squad-list";
import { TimezoneNote } from "./kickoff-time";
import { ThemeToggle } from "./theme-toggle";

export const revalidate = 3600;

const SQUAD_LABEL: Record<Squad, string> = { men: "men's", women: "women's" };

/**
 * What each squad's international calendar is doing, when it is not simply full.
 *
 * The two quiet answers must not read alike. The women's side genuinely has
 * nothing scheduled — their qualifying group finished in June 2026 and the
 * federation has announced nothing since — and a fan who reads that as a broken
 * page goes looking for matches that do not exist, while a fan who reads an outage
 * as an empty calendar stops checking back. So one is a plain statement and the
 * other is a warning, in the colour the site already uses for "something is
 * missing here".
 */
function InternationalsNotes({ states }: { states: SquadInternationalsState[] }) {
  const quiet = states.filter((state) => state.status !== "scheduled");
  if (quiet.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      {quiet.map((state) =>
        state.status === "unavailable" ? (
          <p
            key={state.squad}
            className="rounded-[16px] bg-honey-soft p-4 text-[13.5px] leading-relaxed text-honey-text"
          >
            The {SQUAD_LABEL[state.squad]} national team&apos;s own matches
            couldn&apos;t be loaded, so any of theirs may be missing from the
            schedule below. This usually clears on the next refresh.
          </p>
        ) : (
          <p
            key={state.squad}
            className="rounded-[16px] border border-line bg-card p-4 text-[13.5px] leading-relaxed text-muted"
          >
            The {SQUAD_LABEL[state.squad]} national team has no international
            matches scheduled. That is the calendar as it stands, not a problem
            loading it.
          </p>
        ),
      )}
    </div>
  );
}

export default async function Home() {
  const { fixtures, members, degraded, unavailableClubs, squadInternationals } =
    await getSchedule();

  return (
    // The framed column from Pričaj, widened for a fixture list: soft side
    // rules on desktop, full-bleed on mobile.
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col bg-app px-5 pb-10 pt-4 sm:border-x sm:border-line sm:px-8">
      <div className="flex items-center justify-between">
        <span className="font-display text-[19px] font-semibold tracking-tight text-fg">
          <span aria-hidden className="mr-1.5">🇧🇦</span>
          Support Schedule
        </span>
        <ThemeToggle />
      </div>

      <header className="mt-8 mb-7 flex flex-col gap-3">
        <h1 className="m-0 font-display text-[30px] font-semibold leading-[1.08] tracking-[-0.022em] text-fg sm:text-[36px]">
          Know when <em className="font-normal text-coral">our players</em> are
          next on.
        </h1>

        <div className="wave-rule my-1 w-[120px]" aria-hidden="true" />

        <p className="max-w-2xl text-[14.5px] leading-[1.55] text-muted">
          Every upcoming club match and international for Bosnia and
          Herzegovina&apos;s senior men&apos;s and women&apos;s national team
          players, merged into one schedule.
        </p>
        <TimezoneNote />
        <div className="mt-1 flex flex-wrap gap-2">
          <a
            href="/api/schedule"
            className="rounded-full border border-line bg-card px-5 py-3 text-[14.5px] font-semibold text-muted transition-colors hover:text-fg"
          >
            JSON API
          </a>
        </div>
      </header>

      {degraded && (
        <p className="mb-6 rounded-[16px] bg-honey-soft p-4 text-[13.5px] leading-relaxed text-honey-text">
          No fixtures are stored yet, so only the squads are shown. Run{" "}
          <code className="font-semibold">npm run refresh:fixtures</code> to
          fetch them.
        </p>
      )}

      {unavailableClubs.length > 0 && (
        <p className="mb-6 rounded-[16px] bg-honey-soft p-4 text-[13.5px] leading-relaxed text-honey-text">
          Fixtures for {unavailableClubs.map((club) => club.name).join(", ")}{" "}
          couldn&apos;t be loaded, so matches for players at{" "}
          {unavailableClubs.length === 1 ? "that club" : "those clubs"} are
          missing below. This usually clears on the next refresh.
        </p>
      )}

      <InternationalsNotes states={squadInternationals} />

      <ScheduleFeed fixtures={fixtures} members={members} />

      <SquadList members={members} />

      <footer className="mt-12 flex flex-col gap-2.5 border-t border-line pt-6 text-[12.5px] leading-[1.6]">
        <p className="max-w-2xl text-muted">
          Built by{" "}
          <a
            href="https://pricaj.vercel.app"
            className="font-semibold text-fg underline decoration-line underline-offset-2 hover:decoration-fg"
          >
            Pričaj
          </a>{" "}
          — speaking practice for Croatian, Bosnian and Serbian. You talk out
          loud to a patient tutor, at your own pace, until real conversations
          stop being frightening.
        </p>
        <p className="text-[12px] text-faint">
          Fixture and squad data via API-Football. Not affiliated with NFSBiH.
        </p>
      </footer>
    </main>
  );
}
