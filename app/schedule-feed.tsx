"use client";

import { useMemo, useState } from "react";
import { DayHeading, KickoffTime } from "./kickoff-time";
import { useViewerTimeZone } from "./use-viewer-timezone";
import { kickoffDayKey } from "@/lib/kickoff";
import type { Fixture, NationalTeamMember, Squad } from "@/lib/types";

type SquadFilter = Squad | "all";

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
    return fixtures.filter((fixture) =>
      fixture.members.some(
        (m) =>
          (squad === "all" || m.squad === squad) &&
          (playerId === "all" || String(m.id) === playerId),
      ),
    );
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
              {dayFixtures.map((fixture) => (
                <li
                  key={fixture.id}
                  className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] border border-line bg-card p-4"
                >
                  <KickoffTime kickoff={fixture.kickoff} />

                  <div className="min-w-[14rem] flex-1">
                    <p className="text-[15px] font-semibold text-fg">
                      {fixture.home.name}{" "}
                      <span className="font-normal text-faint">v</span>{" "}
                      {fixture.away.name}
                    </p>
                    <p className="text-[12.5px] text-muted">
                      {fixture.competition}
                      {fixture.round ? ` · ${fixture.round}` : ""}
                      {/* Named only where it differs from the footer's site-wide
                          credit. Repeating "API-Football" on every one of hundreds
                          of rows is noise; a match a human took from the
                          federation's own announcement must never sit under a
                          credit saying the API supplied it. See docs/adr/0004. */}
                      {fixture.source !== "API-Football" && (
                        <span className="text-faint"> · via {fixture.source}</span>
                      )}
                    </p>
                  </div>

                  <ul className="flex flex-wrap gap-1.5">
                    {fixture.members.map((member) => (
                      <li
                        key={member.id}
                        className="rounded-full border border-line bg-bg px-2.5 py-1 text-[12px] text-fg"
                        title={`${member.name} — ${member.squad === "women" ? "Women's" : "Men's"} national team`}
                      >
                        {member.name}
                        {member.squad === "women" && (
                          <span className="ml-1 font-semibold text-coral-text">
                            W
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
