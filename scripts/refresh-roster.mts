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
import { repairMojibake } from "../lib/text.ts";

const BASE_URL = "https://v3.football.api-sports.io";
const KEY = process.env.API_FOOTBALL_KEY;

/**
 * Free tier allows ~10 requests/minute; Pro allows ~300. Override with
 * API_FOOTBALL_MIN_INTERVAL_MS — 6500 suits Free, 250 suits Pro.
 */
const MIN_CALL_INTERVAL_MS = Number(process.env.API_FOOTBALL_MIN_INTERVAL_MS ?? 6_500);
const MAX_RETRIES = 4;

if (!KEY) {
  console.error("API_FOOTBALL_KEY is not set. Add it to .env.local.");
  process.exit(1);
}

let callsUsed = 0;
let lastCallAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; ; attempt += 1) {
    const wait = lastCallAt + MIN_CALL_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);

    lastCallAt = Date.now();
    const res = await fetch(url, { headers: { "x-apisports-key": KEY! } });
    callsUsed += 1;

    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) throw new Error(`${path} -> rate limited, giving up`);
      const backoff = MIN_CALL_INTERVAL_MS * 2 ** (attempt + 1);
      console.log(`  rate limited, waiting ${Math.round(backoff / 1000)}s...`);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);

    const body = await res.json();
    const errors = body.errors;
    if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
      throw new Error(`${path} -> ${JSON.stringify(errors)}`);
    }
    return body.response as T;
  }
}

interface TeamRef {
  id: number;
  name: string;
  logo: string | null;
}

/**
 * Every Bosnian representative side — senior, U21, U19, U17, and the women's
 * equivalents. A player's team history includes these, and they must not be
 * mistaken for a Club.
 */
async function bosnianNationalTeamIds(): Promise<Map<number, string>> {
  const teams = await api<{ team: TeamRef & { national: boolean } }[]>("teams", {
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
): Promise<TeamRef | null> {
  const history = await api<{ team: TeamRef; seasons: number[] }[]>("players/teams", {
    player: playerId,
  });

  let best: TeamRef | null = null;
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

function hashName(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000_007;
  return hash;
}

const ROSTER_PATH = new URL("../data/roster.json", import.meta.url);

interface StoredMember {
  id: number;
  name: string;
  photo: string | null;
  position: string | null;
  squad: "men" | "women";
  club: TeamRef | null;
}

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

  for (const squad of ["men", "women"] as const) {
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
          id: -Math.abs(hashName(`${squad}:${name}`)),
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
  console.log(`API calls used: ${callsUsed}`);
  if (unresolved.length) {
    console.log(`\nNo club resolved (add to data/overrides.json):`);
    for (const u of unresolved) console.log(`  - ${u}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
