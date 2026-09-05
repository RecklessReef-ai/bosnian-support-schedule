/**
 * Fetches each Club's upcoming fixtures and writes data/fixtures.json.
 *
 * This runs offline for the same reason the roster does. Serving the Schedule used
 * to fetch every Club at request time, and each of the three surfaces — page, JSON
 * API, ICS feed — did it independently, so a cold build made ~120 calls in a few
 * seconds. That fits no free tier, and over the per-minute cap the provider answers
 * HTTP 200 with a `rateLimit` body, so failures looked like "this club has no
 * matches" and Clubs silently vanished from the published Schedule.
 *
 * Fetching here instead costs one call per Club, paced under the free tier's
 * ~10/minute cap, and the app then serves all three surfaces from this file with no
 * upstream calls at all.
 *
 *   npm run refresh:fixtures
 */
import { readFile, writeFile } from "node:fs/promises";
import { hasApiKey, type RawFixture } from "../lib/api-football.ts";
import { buildMembersByClub } from "../lib/merge.ts";
import { createPacedClient } from "../lib/paced-api.ts";
import {
  applyOverrides,
  type OverridesFile,
  type RosterFile,
} from "../lib/roster.ts";
import { repairMojibake } from "../lib/text.ts";
import type { Club, FixturesFile } from "../lib/types.ts";

const read = async <T,>(name: string): Promise<T> =>
  JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"));

/** Upper bound per club; the app applies the real time horizon when it renders. */
const FIXTURES_PER_CLUB = 20;

if (!hasApiKey()) {
  console.error("API_FOOTBALL_KEY is not set. Add it to .env.local.");
  process.exit(1);
}

const FIXTURES_PATH = new URL("../data/fixtures.json", import.meta.url);
const { call: api, stats } = createPacedClient();

/**
 * Keeps only the fields the app renders. The upstream record is several times
 * larger, and the rest would just bloat a committed file.
 */
function trim(raw: RawFixture): RawFixture {
  return {
    fixture: {
      id: raw.fixture.id,
      date: raw.fixture.date,
      venue: raw.fixture.venue?.name ? { name: raw.fixture.venue.name } : null,
    },
    league: {
      name: repairMojibake(raw.league.name),
      logo: raw.league.logo,
      round: raw.league.round,
    },
    teams: {
      home: trimClub(raw.teams.home),
      away: trimClub(raw.teams.away),
    },
  };
}

function trimClub(club: Club): Club {
  return { id: club.id, name: repairMojibake(club.name), logo: club.logo };
}

async function main() {
  // Read the same two files the app reads, through the same override logic, so the
  // clubs fetched here are exactly the clubs the app will look for.
  const roster = await read<RosterFile>("roster.json");
  const overrides = await read<OverridesFile>("overrides.json");
  const members = applyOverrides(roster.members, overrides);
  const byClub = buildMembersByClub(members);
  const clubs = [...byClub.values()].map((forClub) => forClub[0].club!);
  console.log(`${clubs.length} distinct clubs to fetch.`);

  const fixtures: RawFixture[] = [];
  const unavailableClubs: Club[] = [];

  for (const club of clubs) {
    try {
      const raw = await api<RawFixture[]>("fixtures", {
        team: club.id,
        next: FIXTURES_PER_CLUB,
      });
      fixtures.push(...raw.map(trim));
      console.log(`  ${club.name} -> ${raw.length}`);
    } catch (error) {
      // Recorded rather than swallowed: an empty fixture list is indistinguishable
      // from a club with no upcoming matches, so the app has to be told which it is.
      unavailableClubs.push(club);
      console.log(`  ${club.name} -> FAILED (${(error as Error).message})`);
    }
  }

  // The same fixture arrives from both clubs when two of them meet.
  const deduped = [...new Map(fixtures.map((f) => [f.fixture.id, f])).values()].sort(
    (a, b) => a.fixture.date.localeCompare(b.fixture.date),
  );

  const out: FixturesFile = {
    generatedAt: new Date().toISOString(),
    fixtures: deduped,
    unavailableClubs,
  };
  await writeFile(FIXTURES_PATH, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`\nWrote ${deduped.length} fixtures from ${clubs.length} clubs.`);
  console.log(`API calls used: ${stats.calls}`);
  if (unavailableClubs.length) {
    console.log(`\nClubs that failed (their matches are missing):`);
    for (const club of unavailableClubs) console.log(`  - ${club.name} (${club.id})`);
    console.log(`Re-run to retry them.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
