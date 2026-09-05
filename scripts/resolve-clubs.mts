/**
 * Turns a list of player -> club-name pairs into Manual Override entries with real
 * API-Football team ids.
 *
 * Input:  data/pending-overrides.json  (hand-written or research-assisted)
 *   [{ "player": "A. Hodžić", "squad": "women", "clubName": "SFK 2000 Sarajevo" }]
 *
 * Output: data/overrides.json, merged with whatever is already there.
 *
 * Club names are deduplicated before lookup, so N players at the same club cost
 * one call, not N.
 *
 *   npm run resolve:clubs
 */
import { readFile, writeFile } from "node:fs/promises";

const BASE_URL = "https://v3.football.api-sports.io";
const KEY = process.env.API_FOOTBALL_KEY;
const MIN_CALL_INTERVAL_MS = Number(process.env.API_FOOTBALL_MIN_INTERVAL_MS ?? 6_500);

if (!KEY) {
  console.error("API_FOOTBALL_KEY is not set. Add it to .env.local.");
  process.exit(1);
}

const PENDING_PATH = new URL("../data/pending-overrides.json", import.meta.url);
const OVERRIDES_PATH = new URL("../data/overrides.json", import.meta.url);

type Squad = "men" | "women";

interface Pending {
  player: string;
  squad: Squad;
  clubName: string;
  position?: string;
}

interface Override {
  player: string;
  clubId: number;
  clubName: string;
  position?: string;
}

let lastCallAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FoundTeam {
  id: number;
  name: string;
  country: string | null;
  women: boolean;
}

async function searchClub(name: string): Promise<FoundTeam[]> {
  const wait = lastCallAt + MIN_CALL_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();

  const url = new URL(`${BASE_URL}/teams`);
  url.searchParams.set("search", name);
  const res = await fetch(url, { headers: { "x-apisports-key": KEY! } });
  if (!res.ok) throw new Error(`teams?search=${name} -> HTTP ${res.status}`);

  const body = await res.json();
  if (body.errors && !Array.isArray(body.errors) && Object.keys(body.errors).length) {
    throw new Error(`teams?search=${name} -> ${JSON.stringify(body.errors)}`);
  }

  return (body.response ?? []).map(
    (r: { team: { id: number; name: string }; country?: string }) => ({
      id: r.team.id,
      name: r.team.name,
      country: r.country ?? null,
      // API-Football suffixes women's sides with "W".
      women: /\bW$/.test(r.team.name),
    }),
  );
}

/** Prefers a women's side, then an exact-ish name match. */
function pickTeam(candidates: FoundTeam[], wantWomen: boolean): FoundTeam | null {
  const pool = wantWomen ? candidates.filter((c) => c.women) : candidates;
  if (pool.length === 0) return null;
  return pool[0];
}

async function main() {
  let pending: Pending[];
  try {
    pending = JSON.parse(await readFile(PENDING_PATH, "utf8"));
  } catch {
    console.error(
      `No data/pending-overrides.json found. Create it with entries like:\n` +
        `  [{ "player": "A. Hodžić", "squad": "women", "clubName": "SFK 2000 Sarajevo" }]`,
    );
    process.exit(1);
  }

  const uniqueClubs = [...new Set(pending.map((p) => `${p.squad}|${p.clubName}`))];
  console.log(`${pending.length} players across ${uniqueClubs.length} distinct clubs.`);

  const resolved = new Map<string, FoundTeam>();
  const failed: string[] = [];

  for (const key of uniqueClubs) {
    const [squad, clubName] = key.split("|") as [Squad, string];
    const candidates = await searchClub(clubName);
    const team = pickTeam(candidates, squad === "women");
    if (team) {
      resolved.set(key, team);
      console.log(`  ${clubName} -> ${team.id} (${team.name})`);
    } else {
      failed.push(clubName);
      console.log(`  ${clubName} -> NOT FOUND (${candidates.length} candidates)`);
    }
  }

  const existing = JSON.parse(await readFile(OVERRIDES_PATH, "utf8")) as Record<
    Squad,
    Override[]
  >;

  for (const entry of pending) {
    const team = resolved.get(`${entry.squad}|${entry.clubName}`);
    if (!team) continue;
    const list = (existing[entry.squad] ??= []);
    const next: Override = {
      player: entry.player,
      clubId: team.id,
      clubName: team.name,
      ...(entry.position ? { position: entry.position } : {}),
    };
    const at = list.findIndex(
      (o) => o.player.toLowerCase() === entry.player.toLowerCase(),
    );
    if (at >= 0) list[at] = next;
    else list.push(next);
  }

  await writeFile(OVERRIDES_PATH, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`\nWrote data/overrides.json.`);
  if (failed.length) {
    console.log(`\nUnresolved club names (fix in pending-overrides.json):`);
    for (const f of new Set(failed)) console.log(`  - ${f}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
