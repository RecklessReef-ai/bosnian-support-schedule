"use client";

import { useMemo, useState } from "react";
import { DayHeading, KickoffTime } from "./kickoff-time";
import { useViewerTimeZone } from "./use-viewer-timezone";
import { competitionLine } from "@/lib/competition-line";
import { kickoffDayKey } from "@/lib/kickoff";
import { visibleFixtures, type SquadFilter } from "@/lib/schedule-filter";
import type {
  ClubFixture,
  Fixture,
  International,
  Squad,
} from "@/lib/types";

const SQUAD_LABEL: Record<Squad, string> = { men: "men's", women: "women's" };

/** The three filter pills, in order. */
const FILTERS: readonly { value: SquadFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "men", label: "Men’s" },
  { value: "women", label: "Women’s" },
];

/** The one-letter marker after a Member's name, and what it stands for. */
const SQUAD_MARK: Record<Squad, string> = { men: "M", women: "W" };
const SQUAD_IN_WORDS: Record<Squad, string> = {
  men: "Men's national team",
  women: "Women's national team",
};

/** Where the squad count on an International sends a fan. See `SquadList`. */
const ROSTER_HREF = "#roster";

/**
 * Which squad a named Member belongs to, as one letter after their name.
 *
 * Both squads are marked, and in the same neutral colour. Marking only the
 * women's — as this once did — makes the men's squad the unmarked default and the
 * women's the annotated exception, which is not what a site covering both equally
 * should say; colouring one and not the other rebuilds that asymmetry in hue.
 *
 * The letter is hidden from screen readers, which would announce it as a stray
 * character, and the squad is spelled out for them instead.
 */
function SquadMark({ squad }: { squad: Squad }) {
  return (
    <>
      <span aria-hidden className="ml-0.5 font-semibold text-muted">
        {SQUAD_MARK[squad]}
      </span>
      <span className="sr-only"> — {SQUAD_IN_WORDS[squad]}</span>
    </>
  );
}

/**
 * One row of the feed, and there is deliberately only one shape of it.
 *
 * A Club Fixture and an International are drawn identically — same surface, same
 * radius, same three columns — because a list where every row looks the same is a
 * list you can scan without deciding what each variation means. What tells them
 * apart is content, not styling: an International's competition line names the
 * tournament and it carries a squad count on the right where a Club Fixture
 * carries the players it involves.
 */
function FixtureRow({
  fixture,
  children,
}: {
  fixture: Fixture;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex min-h-[56px] items-center gap-3.5 rounded-[12px] bg-surface px-3.5 py-3">
      <KickoffTime kickoff={fixture.kickoff} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[14.5px] font-semibold text-fg [overflow-wrap:anywhere]">
          {fixture.home.name} <span className="font-normal text-muted">v</span>{" "}
          {fixture.away.name}
        </p>
        <p className="text-[12px] leading-snug text-muted">
          {competitionLine(fixture)}
          {/* Named only where it differs from the footer's site-wide credit.
              Repeating "API-Football" on every one of hundreds of rows is noise; a
              match a human took from the federation's own announcement must never
              sit under a credit saying the API supplied it. See `docs/adr/0004`. */}
          {fixture.source !== "API-Football" && <> · via {fixture.source}</>}
        </p>
        {children}
      </div>
    </li>
  );
}

/**
 * A Club Fixture: the ordinary row. It involves one or two National Team Members,
 * and naming them costs a line and answers "why is this match here at all".
 *
 * A plain line rather than the pills this once used. Pills read as controls you can
 * press, and these are not; at two or three names a row they also stacked into a
 * second block of visual noise under every fixture, which is the opposite of what a
 * scannable list needs.
 */
function ClubFixtureRow({ fixture }: { fixture: ClubFixture }) {
  if (fixture.members.length === 0) return <FixtureRow fixture={fixture} />;

  return (
    <FixtureRow fixture={fixture}>
      <p className="text-[12px] leading-snug text-subtle">
        {fixture.members.map((member, index) => (
          <span key={member.id}>
            {index > 0 && ", "}
            {member.name}
            <SquadMark squad={member.squad} />
          </span>
        ))}
      </p>
    </FixtureRow>
  );
}

/**
 * An International: the same row, with a squad count instead of names.
 *
 * An International involves the whole squad, and twenty-six names bury the match
 * they are meant to explain while making every International look like every other
 * one. The count is a link rather than a note, because "26 players" invites exactly
 * one question and the Squad list further down the same page is the answer.
 *
 * Which squad is playing is carried on that link's label rather than in a coloured
 * badge on the row. Colour cannot say "men's" to a fan who cannot see it, the
 * filter pills above are how a fan narrows to one squad, and a tint per kind would
 * break the one thing this list has going for it — that every row looks alike.
 */
function InternationalRow({ fixture }: { fixture: International }) {
  const squadSize = fixture.members.length;

  if (squadSize === 0) return <FixtureRow fixture={fixture} />;

  return (
    <FixtureRow fixture={fixture}>
      <a
        href={ROSTER_HREF}
        aria-label={`${squadSize} players in the ${SQUAD_LABEL[fixture.squad]} squad — see the full squad list`}
        className="mt-0.5 text-[12px] font-bold text-gold-ink"
      >
        {squadSize} players
        <span aria-hidden> →</span>
      </a>
    </FixtureRow>
  );
}

export function ScheduleFeed({ fixtures }: { fixtures: Fixture[] }) {
  const timeZone = useViewerTimeZone();
  const [squad, setSquad] = useState<SquadFilter>("all");

  // `member` is left open: the per-player picker this page used to carry is gone,
  // but the rule in `lib/schedule-filter.ts` still takes one, so a future surface
  // can narrow by player without that logic moving.
  const visible = useMemo(
    () => visibleFixtures(fixtures, { squad, member: null }),
    [fixtures, squad],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Fixture[]>();
    for (const fixture of visible) {
      const key = kickoffDayKey(fixture.kickoff, timeZone);
      const list = map.get(key);
      if (list) list.push(fixture);
      else map.set(key, [fixture]);
    }
    return [...map.entries()];
  }, [visible, timeZone]);

  return (
    // This wrapper is what bounds the pills' stickiness: a sticky element is pinned
    // only while its containing block is on screen, so the pills ride the feed and
    // then release it. Left as a sibling of the Squad list they would have stayed
    // pinned over it, filtering nothing.
    <div>
      {/* Pinned directly under the 64px header, so the squad toggle is still in
          reach after a swipe or two — it is the one control on the page, and a
          filter you have to scroll back up to find is a filter nobody uses. */}
      <div className="sticky top-16 z-[4] flex gap-2 bg-app px-5 pb-3 pt-[18px]">
        {FILTERS.map((filter) => {
          const active = squad === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              aria-pressed={active}
              onClick={() => setSquad(filter.value)}
              className={`min-h-[44px] flex-1 rounded-[22px] text-[14px] ${
                active
                  ? "bg-fg font-bold text-app"
                  : "border border-edge font-semibold text-fg"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <div className="px-5 pb-2">
        {groups.length === 0 ? (
          <p className="rounded-[12px] bg-surface p-6 text-center text-[14px] text-muted">
            No upcoming matches for this filter.
          </p>
        ) : (
          groups.map(([key, dayFixtures]) => (
            <section key={key} className="mt-5">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.04em] text-muted">
                <DayHeading kickoff={dayFixtures[0].kickoff} />
              </h2>
              <ul className="flex flex-col gap-2">
                {dayFixtures.map((fixture) =>
                  fixture.kind === "international" ? (
                    <InternationalRow key={fixture.id} fixture={fixture} />
                  ) : (
                    <ClubFixtureRow key={fixture.id} fixture={fixture} />
                  ),
                )}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
