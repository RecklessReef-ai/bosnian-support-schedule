import overridesFile from "@/data/overrides.json";
import rosterFile from "@/data/roster.json";
import { syntheticMemberId } from "./ids";
import type { NationalTeamMember, OverrideEntry, Squad } from "./types";

interface RosterFile {
  generatedAt: string;
  members: NationalTeamMember[];
}

const overrides = overridesFile as Record<Squad, OverrideEntry[]>;
const roster = rosterFile as RosterFile;

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

function applyOverrides(members: NationalTeamMember[]): NationalTeamMember[] {
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

/**
 * The roster is resolved offline by `npm run refresh:roster` and committed to
 * data/roster.json, so serving a page costs no roster API calls. Manual Overrides
 * are layered on at read time.
 */
export function getRoster(): { members: NationalTeamMember[]; generatedAt: string } {
  return {
    members: applyOverrides(roster.members),
    generatedAt: roster.generatedAt,
  };
}
