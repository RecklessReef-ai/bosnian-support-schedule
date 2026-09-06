/**
 * Resolves both national team squads and each National Team Member's current
 * Club, then writes data/roster.json.
 *
 * The daily refresh (`npm run refresh:fixtures`) already re-fetches both squad
 * lists, so this exists for the rebuild case: a fresh checkout, or a roster whose
 * stored Clubs are suspect. It resumes from whatever is already on disk, so a
 * re-run after a rate-limit stop costs nothing for the Members already resolved.
 * Delete a Member's entry — or the whole file — to force them to be re-resolved.
 *
 *   npm run refresh:roster
 */
import { readFile, writeFile } from "node:fs/promises";
import { hasApiKey } from "../lib/api-football.ts";
import { refreshSquads, resolveSquadTeamIds } from "../lib/national-team.ts";
import { createPacedClient } from "../lib/paced-api.ts";
import type { StoredMember } from "../lib/roster.ts";

if (!hasApiKey()) {
  console.error("API_FOOTBALL_KEY is not set. Add it to .env.local.");
  process.exit(1);
}

const { call: api, stats } = createPacedClient();

const ROSTER_PATH = new URL("../data/roster.json", import.meta.url);

/** Re-runs resume from what's already on disk, so a rate-limit stop costs nothing. */
async function loadExisting(): Promise<StoredMember[]> {
  try {
    const raw = JSON.parse(await readFile(ROSTER_PATH, "utf8"));
    return (raw.members ?? []) as StoredMember[];
  } catch {
    return [];
  }
}

async function save(members: StoredMember[]) {
  const out = { generatedAt: new Date().toISOString(), members };
  await writeFile(ROSTER_PATH, `${JSON.stringify(out, null, 2)}\n`);
}

async function main() {
  const existing = await loadExisting();
  const resolved = existing.filter((member) => member.club).length;
  if (resolved) console.log(`Resuming: ${resolved} players already resolved.`);

  const teamIds = await resolveSquadTeamIds(api);
  console.log(`Squads: men=${teamIds.men} women=${teamIds.women}`);

  const { members, unresolved, unavailableSquads } = await refreshSquads(api, teamIds, {
    existing,
    onProgress: save, // checkpoint after every resolved player
    log: (line) => console.log(line),
  });

  await save(members);

  const clubs = new Set(members.filter((m) => m.club).map((m) => m.club!.id));
  console.log(`\nWrote ${members.length} members across ${clubs.size} distinct clubs.`);
  console.log(`API calls used: ${stats.calls}`);
  if (unavailableSquads.length) {
    console.log(
      `\nSquads that failed (kept whatever was stored): ${unavailableSquads.join(", ")}.`,
    );
    console.log(`Re-run to retry them.`);
  }
  if (unresolved.length) {
    console.log(`\nNo club resolved (add to data/overrides.json):`);
    for (const u of unresolved) console.log(`  - ${u}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
