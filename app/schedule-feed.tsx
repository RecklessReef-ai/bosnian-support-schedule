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
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border-subtle bg-surface p-1">
          {(["all", "men", "women"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSquad(option);
                setPlayerId("all");
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                squad === option
                  ? "bg-accent text-[#0b1020]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {option === "all" ? "Both squads" : option}
            </button>
          ))}
        </div>

        <select
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground"
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

        <span className="text-sm text-muted">
          {visible.length} upcoming {visible.length === 1 ? "match" : "matches"}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface p-6 text-sm text-muted">
          No upcoming matches for this filter.
        </p>
      ) : (
        groups.map(([key, dayFixtures]) => (
          <section key={key} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
              <DayHeading kickoff={dayFixtures[0].kickoff} />
            </h2>
            <ul className="flex flex-col gap-2">
              {dayFixtures.map((fixture) => (
                <li
                  key={fixture.id}
                  className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border-subtle bg-surface p-4"
                >
                  <KickoffTime kickoff={fixture.kickoff} />

                  <div className="min-w-[14rem] flex-1">
                    <p className="font-medium text-foreground">
                      {fixture.home.name}{" "}
                      <span className="text-faint">v</span> {fixture.away.name}
                    </p>
                    <p className="text-xs text-muted">
                      {fixture.competition}
                      {fixture.round ? ` · ${fixture.round}` : ""}
                    </p>
                  </div>

                  <ul className="flex flex-wrap gap-1.5">
                    {fixture.members.map((member) => (
                      <li
                        key={member.id}
                        className="rounded-full border border-border-subtle bg-surface-raised px-2.5 py-1 text-xs text-foreground"
                        title={`${member.name} — ${member.squad === "women" ? "Women's" : "Men's"} national team`}
                      >
                        {member.name}
                        {member.squad === "women" && (
                          <span className="ml-1 text-accent">W</span>
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
