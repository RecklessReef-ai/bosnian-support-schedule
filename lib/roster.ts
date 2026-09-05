import { syntheticMemberId } from "./ids.ts";
import type { NationalTeamMember, OverrideEntry, Squad } from "./types.ts";

export interface RosterFile {
  generatedAt: string;
  members: NationalTeamMember[];
}

export type OverridesFile = Record<Squad, OverrideEntry[]>;

function memberFromOverride(entry: OverrideEntry, squad: Squad): NationalTeamMember {
  return {
    id: syntheticMemberId(squad, entry.player),
    name: entry.player,
    photo: null,
    position: entry.position ?? null,
    squad,
    club: { id: entry.clubId, name: entry.clubName, logo: null },
    clubOverridden: true,
  };
}

/**
 * Layers the Manual Override table over a resolved roster: a matching name corrects
 * that member's Club, a name with no match adds them.
 *
 * Pure, and takes both files as arguments, because the app loads them through the
 * bundler's JSON imports while the offline scripts read them off disk — and both
 * must end up with exactly the same member list, or the fixtures fetched offline
 * would be for a different set of Clubs than the app renders.
 */
export function applyOverrides(
  members: readonly NationalTeamMember[],
  overrides: OverridesFile,
): NationalTeamMember[] {
  const used = new Set<string>();

  const corrected = members.map((member) => {
    const entry = (overrides[member.squad] ?? []).find(
      (o) => o.player.toLowerCase() === member.name.toLowerCase(),
    );
    if (!entry) return member;
    used.add(`${member.squad}:${entry.player.toLowerCase()}`);
    return {
      ...member,
      club: { id: entry.clubId, name: entry.clubName, logo: null },
      clubOverridden: true,
    };
  });

  const added = (["men", "women"] as const).flatMap((squad) =>
    (overrides[squad] ?? [])
      .filter((o) => !used.has(`${squad}:${o.player.toLowerCase()}`))
      .map((o) => memberFromOverride(o, squad)),
  );

  return [...corrected, ...added];
}
