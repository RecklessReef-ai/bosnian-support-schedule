/**
 * Resolves both national team squads and each player's current Club, then writes
 * data/roster.json.
 *
 * This runs offline, not at request time: it costs ~1 call per player, which would
 * blow the free tier's 100/day budget if it happened on a cold page load. Re-run it
 * after each call-up window.
 *
 *   npm run refresh:roster
 */
import { readFile, writeFile } from "node:fs/promises";
import { hasApiKey } from "../lib/api-football.ts";
import { syntheticMemberId } from "../lib/ids.ts";
import { createPacedClient } from "../lib/paced-api.ts";
import { repairMojibake } from "../lib/text.ts";
import type { Club, NationalTeamMember, Squad } from "../lib/types.ts";

if (!hasApiKey()) {
  console.error("API_FOOTBALL_KEY is not set. Add it to .env.local.");
  process.exit(1);
}

const { call: api, stats } = createPacedClient();

/**
 * Every Bosnian representative side — senior, U21, U19, U17, and the women's
 * equivalents. A player's team history includes these, and they must not be
 * mistaken for a Club.
 */
async function bosnianNationalTeamIds(): Promise<Map<number, string>> {
  const teams = await api<{ team: Club & { national: boolean } }[]>("teams", {
    search: "Bosnia",
  });
  const ids = new Map<number, string>();
  for (const { team } of teams) {
    if (/bosnia/i.test(team.name)) ids.set(team.id, team.name);
  }
  return ids;
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

interface SquadPlayer {
  id: number;
  name: string;
  photo: string | null;
  position: string | null;
}

async function currentClubFor(
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

const ROSTER_PATH = new URL("../data/roster.json", import.meta.url);

/** What data/roster.json holds: the app's member shape, before overrides. */
type StoredMember = Omit<NationalTeamMember, "clubOverridden">;

/** Re-runs resume from what's already on disk, so a rate-limit stop costs nothing. */
async function loadExisting(): Promise<Map<number, StoredMember>> {
  try {
    const raw = JSON.parse(await readFile(ROSTER_PATH, "utf8"));
    const members: StoredMember[] = raw.members ?? [];
    return new Map(members.filter((m) => m.club).map((m) => [m.id, m]));
  } catch {
    return new Map();
  }
}

async function save(members: StoredMember[]) {
  const out = { generatedAt: new Date().toISOString(), members };
  await writeFile(ROSTER_PATH, `${JSON.stringify(out, null, 2)}\n`);
}

async function main() {
  const existing = await loadExisting();
  if (existing.size) console.log(`Resuming: ${existing.size} players already resolved.`);

  const nationalTeams = await bosnianNationalTeamIds();
  const squads = {
    men: Number(process.env.BIH_MEN_TEAM_ID) || pickSeniorTeam(nationalTeams, false),
    women: Number(process.env.BIH_WOMEN_TEAM_ID) || pickSeniorTeam(nationalTeams, true),
  };
  console.log(`Squads: men=${squads.men} women=${squads.women}`);

  const members: StoredMember[] = [];
  const unresolved: string[] = [];

  for (const squad of ["men", "women"] as const satisfies readonly Squad[]) {
    const response = await api<{ players: SquadPlayer[] }[]>("players/squads", {
      team: squads[squad],
    });
    const players = response[0]?.players ?? [];
    console.log(`${squad}: ${players.length} players`);

    for (const player of players) {
      const name = repairMojibake(player.name);

      // A few upstream records carry id 0 and can't be looked up. Keep them in the
      // roster under a synthetic id so they're visible and can take an override.
      if (!player.id) {
        unresolved.push(`${squad}: ${name} (no upstream player id)`);
        members.push({
          id: syntheticMemberId(squad, name),
          name,
          photo: player.photo,
          position: player.position,
          squad,
          club: null,
        });
        continue;
      }

      const cached = existing.get(player.id);
      if (cached) {
        members.push({ ...cached, name, squad });
        continue;
      }

      const club = await currentClubFor(player.id, nationalTeams);
      if (!club) unresolved.push(`${squad}: ${name}`);
      members.push({
        id: player.id,
        name,
        photo: player.photo,
        position: player.position,
        squad,
        club: club && { ...club, name: repairMojibake(club.name) },
      });
      await save(members); // checkpoint after every resolved player
    }
  }

  await save(members);

  const clubs = new Set(members.filter((m) => m.club).map((m) => m.club!.id));
  console.log(`\nWrote ${members.length} members across ${clubs.size} distinct clubs.`);
  console.log(`API calls used: ${stats.calls}`);
  if (unresolved.length) {
    console.log(`\nNo club resolved (add to data/overrides.json):`);
    for (const u of unresolved) console.log(`  - ${u}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
