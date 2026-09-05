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
import { hasApiKey } from "../lib/api-football.ts";
import { createPacedClient } from "../lib/paced-api.ts";
import type { OverrideEntry, Squad } from "../lib/types.ts";

if (!hasApiKey()) {
  console.error("API_FOOTBALL_KEY is not set. Add it to .env.local.");
  process.exit(1);
}

const { call: api } = createPacedClient();

const PENDING_PATH = new URL("../data/pending-overrides.json", import.meta.url);
const OVERRIDES_PATH = new URL("../data/overrides.json", import.meta.url);

/** The hand-written input format; only this script reads it. */
interface Pending {
  player: string;
  squad: Squad;
  clubName: string;
  position?: string;
}

/**
 * A club to look up. Players are deduplicated onto these first, so N players at
 * one club cost one call rather than N.
 */
interface ClubLookup {
  squad: Squad;
  clubName: string;
}

const lookupKey = (squad: Squad, clubName: string) => `${squad}\u0000${clubName}`;

interface FoundTeam {
  id: number;
  name: string;
  country: string | null;
  women: boolean;
}

/**
 * API-Football rejects search terms containing anything but alphanumerics and
 * spaces, which rules out most Bosnian, Croatian and Polish club names. Accent
 * decomposition handles "ć"/"š"; the stroked letters ("Ł", "Đ", "ø") have no
 * decomposition and need mapping by hand.
 */
const STROKED: Record<string, string> = {
  Ł: "L", ł: "l", Đ: "D", đ: "d", Ø: "O", ø: "o", Ħ: "H", ħ: "h", Ə: "E", ə: "e",
};

function searchable(name: string): string {
  return name
    .replace(/[ŁłĐđØøĦħƏə]/g, (c) => STROKED[c] ?? c)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Upstream search is only partly diacritic-insensitive: it matches "Gornik"
 * against "Górnik" but not "Leczna" against "Łęczna". When a multi-word term
 * finds nothing, retry on the first word alone and let pickTeam narrow it.
 */
async function searchClubWithFallback(rawName: string): Promise<FoundTeam[]> {
  const found = await searchClub(rawName);
  if (found.length > 0) return found;

  const [firstWord] = searchable(rawName).split(" ");
  if (!firstWord || firstWord.length < 3 || firstWord === searchable(rawName)) {
    return found;
  }
  console.log(`      no match for "${rawName}", retrying on "${firstWord}"`);
  return searchClub(firstWord);
}

async function searchClub(rawName: string): Promise<FoundTeam[]> {
  const found = await api<{ team: { id: number; name: string }; country?: string }[]>(
    "teams",
    { search: searchable(rawName) },
  );

  return (found ?? []).map((r) => ({
    id: r.team.id,
    name: r.team.name,
    country: r.country ?? null,
    // API-Football suffixes women's sides with "W".
    women: /\bW$/.test(r.team.name),
  }));
}

/** Prefers a women's side. Ambiguity is surfaced rather than silently resolved. */
function pickTeam(
  candidates: FoundTeam[],
  wantWomen: boolean,
): { team: FoundTeam | null; ambiguous: FoundTeam[] } {
  const pool = wantWomen ? candidates.filter((c) => c.women) : candidates;
  if (pool.length === 0) return { team: null, ambiguous: [] };
  return { team: pool[0], ambiguous: pool.length > 1 ? pool : [] };
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

  const seen = new Set<string>();
  const uniqueClubs: ClubLookup[] = [];
  for (const entry of pending) {
    const key = lookupKey(entry.squad, entry.clubName);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueClubs.push({ squad: entry.squad, clubName: entry.clubName });
  }
  console.log(`${pending.length} players across ${uniqueClubs.length} distinct clubs.`);

  const resolved = new Map<string, FoundTeam>();
  const failed: string[] = [];

  for (const { squad, clubName } of uniqueClubs) {
    // One bad lookup must not discard the ones that already succeeded.
    let candidates: FoundTeam[];
    try {
      candidates = await searchClubWithFallback(clubName);
    } catch (err) {
      failed.push(clubName);
      console.log(`  ${clubName} -> ERROR (${(err as Error).message})`);
      continue;
    }

    const { team, ambiguous } = pickTeam(candidates, squad === "women");
    if (team) {
      resolved.set(lookupKey(squad, clubName), team);
      console.log(`  ${clubName} -> ${team.id} (${team.name})`);
      if (ambiguous.length) {
        console.log(
          `      ambiguous, picked the first of ${ambiguous.length}: ` +
            ambiguous.map((c) => `${c.id} ${c.name}`).join(", "),
        );
      }
    } else {
      failed.push(clubName);
      console.log(`  ${clubName} -> NOT FOUND (${candidates.length} candidates)`);
    }
  }

  const existing = JSON.parse(await readFile(OVERRIDES_PATH, "utf8")) as Record<
    Squad,
    OverrideEntry[]
  >;

  for (const entry of pending) {
    const team = resolved.get(lookupKey(entry.squad, entry.clubName));
    if (!team) continue;
    const list = (existing[entry.squad] ??= []);
    const next: OverrideEntry = {
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
