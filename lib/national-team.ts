import { trimFixtureRecord, type UpstreamFixture } from "./fixture-record.ts";
import type { PacedClient } from "./paced-api.ts";
import { planSquadMembers, type SquadPlayer, type StoredMember } from "./roster.ts";
import { repairMojibake } from "./text.ts";
import type { Club, RawFixtureRecord, Squad } from "./types.ts";

/**
 * Everything the offline scripts ask upstream about the National Team itself: who
 * is in each squad, which Club each Member plays for, and when the National Team
 * next plays.
 *
 * It lives here rather than in a script because two scripts need it — the daily
 * refresh and the standalone roster rebuild — and a second copy of the squad
 * logic would let the two drift, which is exactly how the fixtures fetched
 * offline could end up being for a different set of Clubs than the app renders.
 *
 * Every call goes through a paced client (`lib/paced-api.ts`), so the free tier's
 * per-minute cap is respected and a rate-limited call is retried rather than
 * mistaken for an empty answer.
 */

export type ApiCall = PacedClient["call"];

/** ~10 Internationals a year, so ten covers a year in a single call per squad. */
export const INTERNATIONALS_PER_SQUAD = 10;

export type SquadTeamIds = Record<Squad, number>;

/**
 * The senior National Teams' upstream ids as last verified. They are stable,
 * public facts, and they are here so that a failed lookup can degrade to the right
 * answer rather than to no answer at all. BIH_MEN_TEAM_ID and BIH_WOMEN_TEAM_ID
 * override them, and the lookup below is preferred over both.
 */
export const KNOWN_SQUAD_TEAM_IDS: SquadTeamIds = { men: 1113, women: 14455 };

/**
 * Every Bosnian representative side — senior, U21, U19, U17, and the women's
 * equivalents. A Member's team history includes these, and they must not be
 * mistaken for a Club.
 */
async function fetchBosnianNationalTeamIds(api: ApiCall): Promise<Map<number, string>> {
  const teams = await api<{ team: Club & { national: boolean } }[]>("teams", {
    search: "Bosnia",
  });
  const ids = new Map<number, string>();
  for (const { team } of teams) {
    if (/bosnia/i.test(team.name)) ids.set(team.id, team.name);
  }
  return ids;
}

/**
 * Cached for the life of the process. Both the squad-id lookup and the Club
 * resolution need this list, it does not change mid-run, and every script here is
 * a single short-lived run — so paying for it twice would just be a wasted call.
 */
let bosnianNationalTeams: Promise<Map<number, string>> | null = null;

function nationalTeamIds(api: ApiCall): Promise<Map<number, string>> {
  return (bosnianNationalTeams ??= fetchBosnianNationalTeamIds(api));
}

function pickSeniorTeam(
  nationalTeams: Map<number, string>,
  wantWomen: boolean,
): number {
  for (const [id, name] of nationalTeams) {
    const isYouth = /U\d{2}/i.test(name);
    const isWomen = /\bW$/.test(name);
    if (isYouth) continue;
    if (isWomen === wantWomen) return id;
  }
  throw new Error(`Could not resolve ${wantWomen ? "women's" : "men's"} senior team`);
}

/**
 * The two senior National Teams' upstream ids.
 *
 * Pinning both in the environment (BIH_MEN_TEAM_ID / BIH_WOMEN_TEAM_ID) skips the
 * lookup entirely, which is what keeps the daily run at two calls for the squads
 * rather than three. Without them it costs one call and works anyway, so a
 * missing variable degrades the budget rather than the result.
 */
export async function resolveSquadTeamIds(api: ApiCall): Promise<SquadTeamIds> {
  const men = Number(process.env.BIH_MEN_TEAM_ID) || 0;
  const women = Number(process.env.BIH_WOMEN_TEAM_ID) || 0;
  if (men && women) return { men, women };

  const nationalTeams = await nationalTeamIds(api);
  return {
    men: men || pickSeniorTeam(nationalTeams, false),
    women: women || pickSeniorTeam(nationalTeams, true),
  };
}

async function currentClubFor(
  api: ApiCall,
  playerId: number,
  nationalTeams: Map<number, string>,
): Promise<Club | null> {
  const history = await api<{ team: Club; seasons: number[] }[]>("players/teams", {
    player: playerId,
  });

  let best: Club | null = null;
  let bestSeason = -Infinity;
  for (const entry of history) {
    if (nationalTeams.has(entry.team.id)) continue;
    if (entry.seasons.length === 0) continue;
    const latest = Math.max(...entry.seasons);
    if (latest > bestSeason) {
      bestSeason = latest;
      best = entry.team;
    }
  }
  return best;
}

export interface RefreshSquadsOptions {
  /** The roster already on disk. A Member's Club is reused from it, never re-resolved. */
  existing?: readonly StoredMember[];
  /** Called after each newly resolved Member, so a long run can checkpoint. */
  onProgress?: (members: StoredMember[]) => Promise<void> | void;
  log?: (line: string) => void;
}

export interface SquadsRefresh {
  members: StoredMember[];
  /** Members left with no Club at all; they need a Manual Override. */
  unresolved: string[];
  /** Squads whose list could not be fetched. Their Members are the stored ones. */
  unavailableSquads: Squad[];
}

/**
 * Re-fetches both squad lists and returns the Roster they describe.
 *
 * A squad whose list cannot be fetched keeps whatever Members were already stored
 * rather than emptying: a failed call must never read as "nobody is in the squad".
 * The other squad is refreshed regardless, since one outage is no reason to hold
 * back the half that worked.
 */
export async function refreshSquads(
  api: ApiCall,
  teamIds: SquadTeamIds,
  options: RefreshSquadsOptions = {},
): Promise<SquadsRefresh> {
  const { existing = [], onProgress, log = () => {} } = options;

  const members: StoredMember[] = [];
  const unavailableSquads: Squad[] = [];
  const now = Date.now();

  for (const squad of ["men", "women"] as const satisfies readonly Squad[]) {
    let players: SquadPlayer[];
    try {
      const response = await api<{ players: SquadPlayer[] }[]>("players/squads", {
        team: teamIds[squad],
      });
      players = (response[0]?.players ?? []).map((player) => ({
        ...player,
        name: repairMojibake(player.name),
      }));
    } catch (error) {
      unavailableSquads.push(squad);
      members.push(...existing.filter((member) => member.squad === squad));
      log(`${squad}: FAILED (${(error as Error).message}), keeping the stored squad`);
      continue;
    }

    log(`${squad}: ${players.length} players`);

    for (const planned of planSquadMembers(players, squad, existing, now)) {
      if (!planned.needsClub) {
        members.push(planned.member);
        continue;
      }

      // The national-team list is only fetched when a Club actually has to be
      // resolved, so an ordinary day — every Member's Club already on record —
      // never pays for it.
      const teams = await nationalTeamIds(api);
      const club = await currentClubFor(api, planned.member.id, teams);
      members.push({
        ...planned.member,
        club: club && { ...club, name: repairMojibake(club.name) },
        // Stamped when the lookup found nothing, so a Member upstream knows
        // nothing about is not asked after again tomorrow.
        clubCheckedAt: club ? undefined : new Date(now).toISOString(),
      });
      await onProgress?.(members);
    }
  }

  // Whoever is left without a Club, whether they were looked up this run or are
  // still inside the week a fruitless lookup is believed for. A Member with no
  // Club has no Fixtures, so they are invisible until an override names one.
  const unresolved = members
    .filter((member) => !member.club)
    .map(
      (member) =>
        `${member.squad}: ${member.name}` +
        // Synthetic ids are negative; upstream could not identify these at all.
        `${member.id < 0 ? " (no upstream player id)" : ""}`,
    );

  return { members, unresolved, unavailableSquads };
}

/**
 * A National Team's own upcoming matches — the Internationals.
 *
 * One call per squad, and deliberately not subject to the Club Fixture staleness
 * rules: there are two of these a day against a hundred, and an International
 * moving is news rather than noise.
 */
export async function fetchInternationals(
  api: ApiCall,
  teamId: number,
): Promise<RawFixtureRecord[]> {
  const raw = await api<UpstreamFixture[]>("fixtures", {
    team: teamId,
    next: INTERNATIONALS_PER_SQUAD,
  });
  return raw.map(trimFixtureRecord);
}
