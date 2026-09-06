import type { Fixture, NationalTeamMember, Squad } from "./types.ts";

/** The squad toggle above the feed: one squad, or both. */
export type SquadFilter = Squad | "all";

/**
 * What a fan has narrowed the Schedule to. Both fields are independent, and either
 * may be left wide open.
 *
 * `member` is the selected National Team Member rather than their id, because the
 * rule below needs their squad as well as their identity, and looking that up is
 * the caller's job — it already has the Roster in hand.
 */
export interface ScheduleFilter {
  squad: SquadFilter;
  /** The selected Member, or null when no player is picked. */
  member: NationalTeamMember | null;
}

/**
 * The Fixtures a filter leaves on screen, in the order they were given.
 *
 * Lives here rather than inside the feed component so the rule can be pinned by a
 * test without rendering anything — it is the one piece of thinking the feed does.
 */
export function visibleFixtures(
  fixtures: readonly Fixture[],
  filter: ScheduleFilter,
): Fixture[] {
  return fixtures.filter((fixture) => isVisible(fixture, filter));
}

function isVisible(fixture: Fixture, filter: ScheduleFilter): boolean {
  // Deliberate, and it will look like a bug to whoever reads it next: the player
  // filter does not narrow an International to the Members named on it. A National
  // Team Member is in one by being in the squad, not by which Side they turn out
  // for that weekend — so matching on names would hide the very match a fan
  // filtering to their favourite is most likely after. Filter to Džeko and his last
  // international is still his.
  //
  // It narrows to their squad instead. An International the selected Member could
  // not possibly play in is not their match either, so filtering to a women's
  // player with the squad toggle left on "all" must not leave every men's
  // International on screen.
  //
  // Matched on the Fixture's own `squad` rather than on its members, so the rule
  // holds even for a squad whose Roster came back empty — an International with
  // nobody attached is still that squad's match.
  if (fixture.kind === "international") {
    const squad = internationalSquad(filter);
    return squad === "all" || fixture.squad === squad;
  }

  return fixture.members.some(
    (m) =>
      (filter.squad === "all" || m.squad === filter.squad) &&
      (filter.member === null || m.id === filter.member.id),
  );
}

/**
 * Which squad's Internationals a filter is asking for.
 *
 * The squad toggle wins where both are set — it is the explicit answer to this
 * exact question, and a fan who picked a squad meant it. The selected Member's own
 * squad is the fallback, not an override.
 */
function internationalSquad(filter: ScheduleFilter): SquadFilter {
  if (filter.squad !== "all") return filter.squad;
  return filter.member?.squad ?? "all";
}
