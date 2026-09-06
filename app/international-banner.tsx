"use client";

import { competitionLine } from "@/lib/competition-line";
import { useEffect, useState } from "react";
import { DayHeading } from "./kickoff-time";
import { useHydrated } from "./use-hydrated";
import { useViewerTimeZone } from "./use-viewer-timezone";
import { formatCountdown, formatKickoff } from "@/lib/kickoff";
import type {
  International,
  Squad,
  SquadInternationalsState,
} from "@/lib/types";

/**
 * Both squads, in a fixed order, so the banner cannot quietly lose one.
 *
 * Iterating this rather than whatever the Schedule happened to report is what
 * makes "always both rows" a property of the component instead of a property of
 * the data. A squad the Schedule says nothing about still gets a row, and that row
 * says we do not know — which is the truth, and never the same claim as an empty
 * calendar.
 */
const SQUADS: readonly Squad[] = ["men", "women"];

const SQUAD_LABEL: Record<Squad, string> = {
  men: "Men's national team",
  women: "Women's national team",
};

/**
 * The current second while the tab is being looked at, or null until hydration.
 *
 * Null before hydration because the server has no idea what time it is where the
 * viewer is — the same reason `DayHeading` waits — and a countdown rendered on the
 * server would be wrong by however long the page sat in a cache.
 *
 * Ticking stops while the tab is hidden. A schedule is exactly the kind of page
 * left open in a background tab all afternoon, and a once-a-second re-render there
 * buys nothing: nobody is reading it, and it costs battery on a phone for as long
 * as the tab lives. The clock is re-read on the way back rather than resumed, so a
 * tab hidden for an hour shows the right figure immediately instead of counting up
 * from where it was paused.
 */
function useTickingClock(active: boolean): Date | null {
  const hydrated = useHydrated();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };

    const start = () => {
      stop();
      setNow(new Date());
      timer = setInterval(() => setNow(new Date()), 1000);
    };

    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active]);

  return hydrated ? now : null;
}

/**
 * When one International kicks off, said twice over: once in figures that tick,
 * once in words that do not.
 *
 * The words are not a caption for the figures — they are the row's actual answer
 * for anyone not watching it. The ticking element is marked `aria-live="off"` (the
 * default, stated so nobody makes it polite later): a live region updating every
 * second reads the countdown over the top of whatever else the user is doing and
 * makes the page unusable. Marking it `aria-hidden` was the other option and is
 * worse — the count is real information, and a screen reader user who navigates
 * onto it should find it there. Off means it is reachable on demand and never
 * announced on its own.
 */
function Countdown({ kickoff, now }: { kickoff: string; now: Date | null }) {
  const { primary, secondary } = formatKickoff(kickoff, useViewerTimeZone());
  const countdown = now ? formatCountdown(kickoff, now) : null;

  return (
    <>
      {/* Height is reserved so the row does not jump when the count appears at
          hydration. */}
      <div className="flex min-h-[30px] items-center">
        {countdown?.status === "counting" && (
          <span
            aria-live="off"
            // Tabular figures, and the body face rather than the display one:
            // this is the only text on the site that redraws every second, and
            // `KickoffTime` already leans on Karla's figures being even. Fraunces
            // is a variable serif whose figures are not guaranteed to be, and a
            // headline that shivers once a second is worse than a plainer one.
            className="text-[26px] font-bold leading-none tracking-tight text-fg tabular-nums sm:text-[30px]"
          >
            {countdown.display}
          </span>
        )}
        {countdown?.status === "in-progress" && (
          <span className="text-[17px] font-semibold leading-none text-fg">
            Under way now
          </span>
        )}
      </div>

      <p className="text-[12.5px] leading-snug text-faint">
        {countdown?.status === "in-progress" ? "Kicked off " : "Kicks off "}
        <DayHeading kickoff={kickoff} /> at {primary}
        {secondary ? ` (${secondary})` : ""}
      </p>
    </>
  );
}

function SquadRow({
  squad,
  state,
  matches,
  now,
}: {
  squad: Squad;
  state: SquadInternationalsState | undefined;
  matches: International[];
  now: Date | null;
}) {
  // With no clock yet, the row shows what the server chose. Assembly already
  // dropped anything past its grace period when the page was rendered, so the
  // first match is the right one — and picking it the same way on both sides of
  // hydration is what keeps the markup from mismatching.
  const next = now
    ? matches.find((m) => formatCountdown(m.kickoff, now).status !== "finished")
    : matches[0];

  return (
    <li className="flex flex-col gap-1.5 border-t border-line p-4 first:border-t-0">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-faint">
        {SQUAD_LABEL[squad]}
      </p>

      {state === undefined || state.status === "unavailable" ? (
        // Honey, the colour this site already uses for "something is missing
        // here". An outage and a quiet calendar must not look alike: a fan who
        // reads an outage as an empty calendar stops checking back.
        <p className="rounded-[12px] bg-honey-soft px-3 py-2 text-[13.5px] leading-relaxed text-honey-text">
          Their matches couldn&apos;t be loaded, so the next one may be missing
          here. This usually clears on the next refresh.
        </p>
      ) : next ? (
        <>
          <p className="text-[15px] font-semibold leading-snug text-fg">
            {next.home.name} <span className="font-normal text-faint">v</span>{" "}
            {next.away.name}
          </p>
          <Countdown kickoff={next.kickoff} now={now} />
          <p className="text-[12.5px] leading-snug text-muted">
            {competitionLine(next)}
          </p>
        </>
      ) : matches.length > 0 ? (
        // Reached only by a tab left open past the last match of a Window. The
        // page cannot know what follows it without asking again, so it says so
        // rather than inventing an empty calendar.
        <p className="text-[13.5px] leading-relaxed text-muted">
          Those matches have been played. Reload the page for what comes next.
        </p>
      ) : (
        // A plain statement, deliberately not a warning. This is the women's
        // squad today: their qualifying group finished in June 2026 and nothing
        // has been announced since, which is a fact about the calendar rather
        // than a symptom of anything.
        <p className="text-[13.5px] leading-relaxed text-muted">
          No matches scheduled. That is the calendar as it stands, not a problem
          loading it.
        </p>
      )}
    </li>
  );
}

/**
 * The answer to "when are we next on", above everything a fan would have to
 * scroll through to find it.
 *
 * Internationals ignore the Schedule's 21-day horizon, which means that between
 * International Windows the next one sits below a hundred-odd Club Fixtures.
 * Nobody scrolls that far, so the match most fans came for is the hardest one on
 * the page to find. This banner is what fixes that; the International's own card
 * further down is where it lives, not where it is discovered.
 *
 * One row per squad, always both. Hiding the squad with nothing scheduled would
 * silently erase a side the rest of the site gives equal billing.
 */
export function InternationalBanner({
  internationals,
  states,
}: {
  internationals: International[];
  states: SquadInternationalsState[];
}) {
  const now = useTickingClock(internationals.length > 0);

  return (
    <section
      aria-labelledby="next-internationals"
      className="mb-6 overflow-hidden rounded-[20px] border border-line bg-card"
    >
      <h2
        id="next-internationals"
        className="border-b border-line px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted"
      >
        Next internationals
      </h2>
      <ul className="flex flex-col">
        {SQUADS.map((squad) => (
          <SquadRow
            key={squad}
            squad={squad}
            state={states.find((state) => state.squad === squad)}
            matches={internationals.filter(
              (international) => international.squad === squad,
            )}
            now={now}
          />
        ))}
      </ul>
    </section>
  );
}
