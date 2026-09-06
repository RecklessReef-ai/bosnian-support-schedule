"use client";

import { useMemo, useState } from "react";
import { DayHeading, KickoffTime } from "./kickoff-time";
import { useViewerTimeZone } from "./use-viewer-timezone";
import { competitionLine } from "@/lib/competition-line";
import { kickoffDayKey } from "@/lib/kickoff";
import type {
  ClubFixture,
  Fixture,
  International,
  NationalTeamMember,
  Squad,
} from "@/lib/types";

type SquadFilter = Squad | "all";

const SQUAD_LABEL: Record<Squad, string> = { men: "men's", women: "women's" };

/** Where the squad count on an International sends a fan. See `SquadList`. */
const ROSTER_HREF = "#roster";

/**
 * The match itself — the two Sides and what they are playing in — which reads the
 * same whichever kind of Fixture it belongs to. Only the framing around it differs.
 */
function MatchLine({ fixture }: { fixture: Fixture }) {
  return (
    <div className="min-w-[14rem] flex-1">
      <p className="text-[15px] font-semibold text-fg">
        {fixture.home.name} <span className="font-normal text-faint">v</span>{" "}
        {fixture.away.name}
      </p>
      <p className="text-[12.5px] text-muted">
        {competitionLine(fixture)}
        {/* Named only where it differs from the footer's site-wide credit.
            Repeating "API-Football" on every one of hundreds of rows is noise; a
            match a human took from the federation's own announcement must never
            sit under a credit saying the API supplied it. See `docs/adr/0004`.
            Lives here rather than in each kind's framing, so a hand-entered
            International and a hand-entered Club Fixture are credited alike. */}
        {fixture.source !== "API-Football" && (
          <span className="text-faint"> · via {fixture.source}</span>
        )}
      </p>
    </div>
  );
}

/**
 * A Club Fixture: the ordinary row. It involves one or two National Team Members,
 * so naming them costs a pill or two and answers "why is this match here at all".
 */
function ClubFixtureRow({ fixture }: { fixture: ClubFixture }) {
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] border border-line bg-card p-4">
      <KickoffTime kickoff={fixture.kickoff} />
      <MatchLine fixture={fixture} />

      <ul className="flex flex-wrap gap-1.5">
        {fixture.members.map((member) => (
          <li
            key={member.id}
            className="rounded-full border border-line bg-bg px-2.5 py-1 text-[12px] text-fg"
            title={`${member.name} — ${member.squad === "women" ? "Women's" : "Men's"} national team`}
          >
            {member.name}
            {member.squad === "women" && (
              <span className="ml-1 font-semibold text-coral-text">W</span>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * An International: the same row, given emphasis rather than an alarm.
 *
 * Three things set it apart and only one of them is colour. It is labelled
 * "Men's international" in words, so a fan who cannot see the sage tint or the
 * rail down its edge is still told outright. It carries a squad count where a Club
 * Fixture carries names — an International involves the whole squad, and
 * twenty-six pills bury the match they are meant to explain while making every
 * International look like every other one. And the tint is `sage`, the one accent
 * the site had spare: honey already means "something is missing here", coral marks
 * the women's squad, teal marks an active filter, so any of those would have said
 * something untrue.
 *
 * The count is a link rather than a note, because "26 players" invites exactly one
 * question and the Roster further down the same page is the answer.
 */
function InternationalCard({ fixture }: { fixture: International }) {
  const squadSize = fixture.members.length;
  const squadLabel = SQUAD_LABEL[fixture.squad];

  return (
    <li className="relative flex flex-wrap items-center gap-x-5 gap-y-3 overflow-hidden rounded-[20px] border border-sage/40 bg-sage-soft p-4 pl-5">
      {/* Decorative: the label below says the same thing in words. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-sage" />

      <p className="basis-full text-[11.5px] font-semibold uppercase tracking-[0.12em] text-sage">
        {squadLabel} international
      </p>

      <KickoffTime kickoff={fixture.kickoff} />
      <MatchLine fixture={fixture} />

      {squadSize > 0 && (
        <a
          href={ROSTER_HREF}
          aria-label={`${squadSize} players in the ${squadLabel} squad — see the full squad list`}
          className="whitespace-nowrap rounded-full border border-sage/40 bg-card px-3 py-1.5 text-[12px] font-semibold text-sage transition-colors hover:bg-sage hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        >
          {squadSize} players
          <span aria-hidden> →</span>
        </a>
      )}
    </li>
  );
}

export function ScheduleFeed({
  fixtures,
  members,
}: {
  fixtures: Fixture[];
  members: NationalTeamMember[];
}) {
  const timeZone = useViewerTimeZone();
  const [squad, setSquad] = useState<SquadFilter>("all");
  const [playerId, setPlayerId] = useState<string>("all");

  const selectablePlayers = useMemo(
    () =>
      members
        .filter((m) => squad === "all" || m.squad === squad)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members, squad],
  );

  const visible = useMemo(() => {
    return fixtures.filter((fixture) => {
      // Deliberate, and it will look like a bug to whoever reads it next: the
      // player filter is ignored for an International. A National Team Member is
      // in one by being in the squad, not by which Side they turn out for that
      // weekend — so narrowing to a single name would hide the very match a fan
      // filtering to their favourite is most likely after. Filter to Džeko and his
      // last international is still his.
      //
      // The squad filter does still apply: a men's break is not a women's one.
      //
      // Matched on the Fixture's own `squad` rather than on its members, so the
      // rule holds even for a squad whose Roster came back empty — an
      // International with nobody attached is still that squad's match.
      if (fixture.kind === "international") {
        return squad === "all" || fixture.squad === squad;
      }

      return fixture.members.some(
        (m) =>
          (squad === "all" || m.squad === squad) &&
          (playerId === "all" || String(m.id) === playerId),
      );
    });
  }, [fixtures, squad, playerId]);

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex gap-1 rounded-full border border-line bg-card p-1">
          {(["all", "men", "women"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSquad(option);
                setPlayerId("all");
              }}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold capitalize transition-colors ${
                squad === option
                  ? "bg-teal-soft text-teal"
                  : "text-muted hover:text-fg"
              }`}
            >
              {option === "all" ? "Both squads" : option}
            </button>
          ))}
        </div>

        <select
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          className="rounded-full border border-line bg-card px-4 py-2 text-[13px] text-fg outline-none focus:border-teal"
          aria-label="Filter by player"
        >
          <option value="all">All players</option>
          {selectablePlayers.map((member) => (
            <option key={member.id} value={String(member.id)}>
              {member.name}
              {member.club ? ` — ${member.club.name}` : ""}
            </option>
          ))}
        </select>

        <span className="text-[13px] text-muted">
          {visible.length} upcoming {visible.length === 1 ? "match" : "matches"}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-[20px] border border-line bg-card p-7 text-center text-[14px] text-muted">
          No upcoming matches for this filter.
        </p>
      ) : (
        groups.map(([key, dayFixtures]) => (
          <section key={key} className="flex flex-col gap-2">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-honey-text">
              <DayHeading kickoff={dayFixtures[0].kickoff} />
            </h2>
            <ul className="flex flex-col gap-2">
              {dayFixtures.map((fixture) =>
                fixture.kind === "international" ? (
                  <InternationalCard key={fixture.id} fixture={fixture} />
                ) : (
                  <ClubFixtureRow key={fixture.id} fixture={fixture} />
                ),
              )}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
