"use client";

import { competitionLine } from "@/lib/competition-line";
import { useEffect, useState } from "react";
import { DayHeading } from "./kickoff-time";
import { useHydrated } from "./use-hydrated";
import { useViewerTimeZone } from "./use-viewer-timezone";
import { formatCountdown, formatKickoff } from "@/lib/kickoff";
import {
  squadBannerRow,
  type SquadBannerRow,
} from "@/lib/squad-banner-row";
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
          hydration — which matters more now the banner is pinned: a strip that
          grew a few pixels at hydration would shove the whole Schedule down. */}
      <div className="flex min-h-[26px] items-center sm:min-h-[30px]">
        {countdown?.status === "counting" && (
          <span
            aria-live="off"
            // Tabular figures, and the body face rather than the display one:
            // this is the only text on the site that redraws every second, and
            // `KickoffTime` already leans on Karla's figures being even. Fraunces
            // is a variable serif whose figures are not guaranteed to be, and a
            // headline that shivers once a second is worse than a plainer one.
            className="text-[22px] font-bold leading-none tracking-tight text-fg tabular-nums sm:text-[26px] md:text-[30px]"
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

/**
 * One squad's row. What it says is decided in `lib/squad-banner-row.ts`; all this
 * does is dress the answer, so the rule that a fan actually depends on lives
 * somewhere `npm test` can reach.
 */
function SquadRow({
  squad,
  row,
  now,
}: {
  squad: Squad;
  row: SquadBannerRow;
  now: Date | null;
}) {
  return (
    // Stacked on a narrow screen and side by side from `sm` up. Two stacked rows
    // cost twice the height of one, and height is what a pinned strip spends: a
    // wide screen has room to show both squads in the space of a single row, so it
    // does.
    <li className="flex flex-1 flex-col gap-1 border-t border-line p-3.5 first:border-t-0 sm:gap-1.5 sm:border-l sm:border-t-0 sm:p-4 sm:first:border-l-0">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-faint">
        {SQUAD_LABEL[squad]}
      </p>

      {row.show === "next-international" ? (
        <>
          <p className="text-[15px] font-semibold leading-snug text-fg">
            {row.next.home.name}{" "}
            <span className="font-normal text-faint">v</span>{" "}
            {row.next.away.name}
          </p>
          <Countdown kickoff={row.next.kickoff} now={now} />
          {/* The one line the pinned strip gives up on a narrow screen, where
              every pixel it keeps is a pixel of Schedule the fan cannot see.
              Which competition it is survives verbatim on the International's own
              card in the feed below; when it kicks off does not survive anywhere
              above the fold, which is the whole reason this banner exists. */}
          <p className="hidden text-[12.5px] leading-snug text-muted sm:block">
            {competitionLine(row.next)}
          </p>
          {row.couldNotRefresh && (
            // Underneath the answer rather than instead of it. The match above is
            // the last thing that was stored and the feed below is listing it, so
            // a warning in place of the countdown would have this banner
            // contradicting the page it sits on. Honey, quieter than the row
            // below, because a stale answer is still an answer.
            <p className="rounded-[10px] bg-honey-soft px-2.5 py-1.5 text-[12.5px] leading-snug text-honey-text">
              This couldn&apos;t be refreshed just now, so a newer match may be
              missing. It usually clears on the next refresh.
            </p>
          )}
        </>
      ) : row.show === "unavailable" ? (
        // Honey, the colour this site already uses for "something is missing
        // here". An outage and a quiet calendar must not look alike: a fan who
        // reads an outage as an empty calendar stops checking back.
        <p className="rounded-[12px] bg-honey-soft px-3 py-2 text-[13.5px] leading-relaxed text-honey-text">
          Their matches couldn&apos;t be loaded, so the next one may be missing
          here. This usually clears on the next refresh.
        </p>
      ) : row.show === "all-played" ? (
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
 *
 * Pinned with `position: sticky`, not `fixed`. Sticky keeps the banner in the
 * flow, so it occupies its own space at rest: nothing below has to be padded away
 * from it, there is no height to keep in sync with a padding rule, and the page
 * lands exactly where it renders rather than shifting once the styles apply.
 * Fixed would have taken the banner out of the flow and made every one of those a
 * separate thing to get right.
 *
 * It sticks for as long as the Schedule is on screen and no longer — `page.tsx`
 * wraps the banner and the feed together, and that wrapper is what bounds it. Past
 * the feed the banner has nothing to be above: the Roster and the footer are not
 * things a fan is scrolling through to find a kickoff, and an anchor jump to
 * `#roster` should not land underneath it.
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
    // The strip that does the sticking is a plain opaque band, not the card
    // itself: it bleeds out to the column's own padding (`-mx-5 px-5`, exactly
    // cancelling `main`'s) so a Fixture sliding underneath goes behind an edge
    // rather than up the side of a rounded card and out through its corners.
    <div className="sticky top-0 z-10 -mx-5 bg-app px-5 pb-4 pt-3 sm:-mx-8 sm:px-8">
      <section
        aria-labelledby="next-internationals"
        className="overflow-hidden rounded-[20px] border border-line bg-card"
      >
        {/* Named for a screen reader on every screen, drawn only where there is
            height to spare. On a phone the rows label themselves — "Men's
            national team", a fixture and a countdown — and a title bar reading
            "Next internationals" above them would cost a twelfth of the viewport
            to repeat what they already say. */}
        <h2
          id="next-internationals"
          className="sr-only sm:not-sr-only sm:block sm:border-b sm:border-line sm:px-4 sm:py-2.5 sm:text-[11.5px] sm:font-semibold sm:uppercase sm:tracking-[0.12em] sm:text-muted"
        >
          Next internationals
        </h2>
        {/* A ceiling, for the short viewport this cannot otherwise plan for — a
            phone held sideways, a desktop window dragged down to a sliver. The
            rows are well under it at any ordinary size, so nothing scrolls in
            here in practice; it exists so the banner can never take the screen. */}
        <ul className="flex max-h-[46svh] flex-col overflow-y-auto sm:flex-row">
          {SQUADS.map((squad) => (
            <SquadRow
              key={squad}
              squad={squad}
              row={squadBannerRow({ squad, states, internationals, now })}
              now={now}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
