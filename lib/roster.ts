import { syntheticMemberId } from "./ids.ts";
import type { NationalTeamMember, OverrideEntry, Squad } from "./types.ts";

export interface RosterFile {
  generatedAt: string;
  members: NationalTeamMember[];
}

export type OverridesFile = Record<Squad, OverrideEntry[]>;

/** What data/roster.json holds: the app's member shape, before overrides. */
export type StoredMember = Omit<NationalTeamMember, "clubOverridden"> & {
  /**
   * When this Member's Club was last looked up upstream, found or not. Only
   * carried for a Member who still has no Club, since one who has is never
   * looked up again.
   */
  clubCheckedAt?: string;
};

/**
 * How long a fruitless Club lookup is believed before being tried again.
 *
 * Twenty-nine of the sixty-one Members have no Club anywhere upstream — nearly
 * all of the women's squad, whose data upstream is sparse — and asking after each
 * of them costs a call. Daily that is a third of the free tier spent re-learning
 * the same nothing; weekly it is a rounding error, and a Member who does turn up
 * at a Club is still found within the week. Until then a Manual Override is the
 * fix, and twelve of them already have one.
 */
export const CLUB_LOOKUP_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

/** A player exactly as the upstream squad list gives them. */
export interface SquadPlayer {
  id: number;
  name: string;
  photo: string | null;
  position: string | null;
}

/** A squad member, and whether the refresh still owes them an upstream call. */
export interface PlannedMember {
  member: StoredMember;
  /** True when this Member's Club is not on record and has to be resolved. */
  needsClub: boolean;
}

/**
 * Reconciles a freshly fetched squad list against the roster already on disk.
 *
 * Both squad lists are re-fetched every day, one call each. Resolving a Member's
 * Club costs another call *per player*, and there are sixty-odd of them — more
 * than half the free tier's daily budget — so a Club already on record is reused
 * rather than looked up again, and a lookup that found nothing is remembered for
 * a week rather than repeated tomorrow. Only the Club is carried over: name,
 * photo and position arrive in the squad response for free, so the fresh ones are
 * the better ones.
 *
 * There is exactly one entry per fetched player, so a Member who has left the
 * squad stops appearing. That is the only way a retirement or a dropped call-up
 * reaches the Roster, since the upstream squad list has no concept of either.
 */
export function planSquadMembers(
  players: readonly SquadPlayer[],
  squad: Squad,
  cached: readonly StoredMember[],
  now: number,
): PlannedMember[] {
  const cachedById = new Map(cached.map((member) => [member.id, member]));

  return players.map((player) => {
    // A few upstream records carry id 0 and can't be looked up. Keep them in the
    // roster under a synthetic id so they're visible and can take an override.
    const identified = Boolean(player.id);
    const known = identified ? cachedById.get(player.id) : undefined;
    const club = known?.club ?? null;
    // Only meaningful while there is still no Club to show for it.
    const clubCheckedAt = club ? undefined : known?.clubCheckedAt;

    return {
      member: {
        id: identified ? player.id : syntheticMemberId(squad, player.name),
        name: player.name,
        photo: player.photo,
        position: player.position,
        squad,
        club,
        ...(clubCheckedAt ? { clubCheckedAt } : {}),
      },
      needsClub: identified && !club && lookupIsDue(clubCheckedAt, now),
    };
  });
}

function lookupIsDue(clubCheckedAt: string | undefined, now: number): boolean {
  if (!clubCheckedAt) return true;
  const age = now - Date.parse(clubCheckedAt);
  // An unparseable or future stamp is no reason to trust it.
  if (!Number.isFinite(age) || age < 0) return true;
  return age >= CLUB_LOOKUP_RETRY_MS;
}

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
