"use client";

import { useEffect, useState } from "react";
import { DayHeading } from "./kickoff-time";
import { useHydrated } from "./use-hydrated";
import { useViewerTimeZone } from "./use-viewer-timezone";
import { formatCountdown, formatKickoff } from "@/lib/kickoff";
import { squadBannerRow, type SquadBannerRow } from "@/lib/squad-banner-row";
import type {
  International,
  Squad,
  SquadInternationalsState,
} from "@/lib/types";

/**
 * Both squads, in a fixed order, so neither can quietly fall out of the card.
 *
 * Only one of them can be the headline — the point of a single gold card is that
 * there is one next thing — but the other still gets its line. Showing the men's
 * International and saying nothing at all about the women's would silently erase a
 * side the rest of the site gives equal billing.
 */
const SQUADS: readonly Squad[] = ["men", "women"];

const SQUAD_LABEL: Record<Squad, string> = {
  men: "Men's national team",
  women: "Women's national team",
};

type SquadRow = { squad: Squad; row: SquadBannerRow };
type ScheduledRow = {
  squad: Squad;
  row: Extract<SquadBannerRow, { show: "next-international" }>;
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
 * When the headline International kicks off, said twice over: once in figures that
 * tick, once in words that do not.
 *
 * The words are not a caption for the figures — they are the card's actual answer
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
      {/* Height is reserved so the card does not grow when the count appears at
          hydration and shove the whole Schedule down a few pixels. */}
      <div className="flex min-h-[28px] items-center">
        {countdown?.status === "counting" && (
          <span
            aria-live="off"
            className="text-[24px] font-extrabold leading-none tracking-tight text-on-gold tabular-nums"
          >
            {countdown.display}
          </span>
        )}
        {countdown?.status === "in-progress" && (
          <span className="text-[18px] font-extrabold leading-none text-on-gold">
            Under way now
          </span>
        )}
      </div>

      <p className="text-[13px] font-semibold leading-snug text-on-gold">
        {countdown?.status === "in-progress" ? "Kicked off " : "Kicks off "}
        <DayHeading kickoff={kickoff} /> at {primary}
        {secondary ? ` (${secondary})` : ""}
      </p>
    </>
  );
}

/** The other squad's match, named and dated but not counted down. */
function AsideFixture({ next }: { next: International }) {
  const { primary } = formatKickoff(next.kickoff, useViewerTimeZone());

  return (
    <>
      {next.home.name} v {next.away.name} — <DayHeading kickoff={next.kickoff} />{" "}
      at {primary}
    </>
  );
}

/**
 * One line for the squad that is not the headline, whatever its situation.
 *
 * Four situations, and the difference between them is the whole point of
 * `squadBannerRow`: "we could not ask" and "there is nothing on" are opposite
 * claims about the world, and either told in place of the other sends a fan away —
 * one stops checking back because the calendar looked empty, the other keeps
 * checking a calendar that genuinely is. Compressing them into a single line loses
 * none of that; it only stops them competing with the gold card for attention.
 *
 * Staleness included. `couldNotRefresh` is the fifth thing this line has to carry,
 * and it is not a fifth situation — it rides along with a match that is still
 * ahead, exactly as it does on the headline. Dropping it here would tell a fan the
 * quiet squad's fixture is current when the headline's identical case says it may
 * not be, which is the same "we could not ask" told as "here is the answer" that
 * the four situations exist to prevent.
 */
function SquadAside({ squad, row }: SquadRow) {
  return (
    <>
      <span className="font-semibold">{SQUAD_LABEL[squad]}</span>
      {" · "}
      {row.show === "next-international" ? (
        <>
          <AsideFixture next={row.next} />
          {row.couldNotRefresh && (
            <> (couldn&apos;t be refreshed, so a newer match may be missing)</>
          )}
        </>
      ) : row.show === "unavailable" ? (
        <>their matches couldn&apos;t be loaded, so the next one may be missing</>
      ) : row.show === "all-played" ? (
        <>those matches have been played — reload for what comes next</>
      ) : (
        <>no matches scheduled, which is the calendar as it stands rather than a
        problem loading it</>
      )}
    </>
  );
}

/**
 * The answer to "when are we next on", above everything a fan would have to scroll
 * through to find it.
 *
 * Internationals ignore the Schedule's 21-day horizon, which means that between
 * International Windows the next one sits below a hundred-odd Club Fixtures. Nobody
 * scrolls that far, so the match most fans came for is the hardest one on the page
 * to find. This card is what fixes that; the International's own row further down
 * is where it lives, not where it is discovered.
 *
 * Gold, and the only gold on the page. It is spent on the single most important
 * thing per screen, which is why the second squad rides along as one quiet line
 * underneath rather than as a card of its own: two gold cards would mean neither is
 * the answer. When *neither* squad has a match ahead there is no headline to spend
 * gold on, so the card steps down to an ordinary navy panel and simply says what
 * each squad's situation is.
 *
 * What each squad has to say is decided in `lib/squad-banner-row.ts`; all this does
 * is dress the answer, so the rule a fan actually depends on lives somewhere
 * `npm test` can reach.
 */
export function NextMatch({
  internationals,
  states,
}: {
  internationals: International[];
  states: SquadInternationalsState[];
}) {
  const now = useTickingClock(internationals.length > 0);

  const rows: SquadRow[] = SQUADS.map((squad) => ({
    squad,
    row: squadBannerRow({ squad, states, internationals, now }),
  }));

  // The soonest match across both squads is the headline — not the men's by
  // default. Whichever side is on first is the one a fan is about to watch.
  const scheduled: ScheduledRow[] = rows.flatMap((entry) =>
    entry.row.show === "next-international"
      ? [{ squad: entry.squad, row: entry.row }]
      : [],
  );
  const headline =
    scheduled.sort(
      (a, b) => Date.parse(a.row.next.kickoff) - Date.parse(b.row.next.kickoff),
    )[0] ?? null;

  const asides = rows.filter((entry) => entry.squad !== headline?.squad);

  if (!headline) {
    return (
      <section
        aria-labelledby="next-match-label"
        className="mx-5 mt-4 rounded-[14px] bg-surface px-5 py-4"
      >
        <h2
          id="next-match-label"
          className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.04em] text-muted"
        >
          Next match
        </h2>
        <ul className="flex flex-col gap-2">
          {asides.map((entry) => (
            <li
              key={entry.squad}
              className="text-[13px] leading-snug text-subtle"
            >
              <SquadAside {...entry} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="next-match-label"
      className="mx-5 mt-4 flex flex-col gap-1.5 rounded-[14px] bg-gold px-5 py-[18px]"
    >
      <h2
        id="next-match-label"
        className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-on-gold"
      >
        Next match · {SQUAD_LABEL[headline.squad]}
      </h2>

      <p className="text-[19px] font-extrabold leading-[1.25] text-on-gold">
        {headline.row.next.home.name} v {headline.row.next.away.name}
      </p>

      <Countdown kickoff={headline.row.next.kickoff} now={now} />

      {headline.row.couldNotRefresh && (
        // Underneath the answer rather than instead of it. The match above is the
        // last thing that was stored and the feed below is listing it, so a warning
        // in place of the countdown would have this card contradicting the page it
        // sits on. A stale answer is still an answer.
        <p className="mt-1 rounded-[10px] bg-on-gold/10 px-2.5 py-1.5 text-[12.5px] leading-snug text-on-gold">
          This couldn&apos;t be refreshed just now, so a newer match may be
          missing. It usually clears on the next refresh.
        </p>
      )}

      {asides.map((entry) => (
        <p
          key={entry.squad}
          className="mt-1 border-t border-on-gold/20 pt-2.5 text-[12.5px] leading-snug text-on-gold/75"
        >
          <SquadAside {...entry} />
        </p>
      ))}
    </section>
  );
}
