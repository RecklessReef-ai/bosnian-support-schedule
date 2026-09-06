/**
 * Fetches each Club's upcoming fixtures and writes data/fixtures.json.
 *
 * This runs offline for the same reason the roster does. Serving the Schedule used
 * to fetch every Club at request time, and every surface did it independently, so a
 * cold build made ~120 calls in a few seconds. That fits no free tier, and over the
 * per-minute cap the provider answers HTTP 200 with a `rateLimit` body, so failures
 * looked like "this club has no matches" and Clubs silently vanished from the
 * published Schedule.
 *
 * Fetching here instead costs one call per Club, paced under the free tier's
 * ~10/minute cap, and the app then serves every surface from this file with no
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
import { needsRefresh } from "../lib/refresh-policy.ts";
import { repairMojibake } from "../lib/text.ts";
import type { Club, ClubFetchRecord, FixturesFile } from "../lib/types.ts";

const read = async <T,>(name: string): Promise<T> =>
  JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"));

async function readOptional<T>(name: string): Promise<T | null> {
  try {
    return await read<T>(name);
  } catch {
    return null;
  }
}

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
  // --all ignores freshness and re-fetches everything, for when the stored data is
  // suspect rather than merely old.
  const forceAll = process.argv.includes("--all");

  // Read the same two files the app reads, through the same override logic, so the
  // clubs fetched here are exactly the clubs the app will look for.
  const roster = await read<RosterFile>("roster.json");
  const overrides = await read<OverridesFile>("overrides.json");
  const members = applyOverrides(roster.members, overrides);
  const byClub = buildMembersByClub(members);
  const clubs = [...byClub.values()].map((forClub) => forClub[0].club!);

  const previous = await readOptional<FixturesFile>("fixtures.json");
  const lastFetched = new Map(
    (previous?.clubs ?? []).map((record) => [record.id, record.fetchedAt]),
  );
  const keptByClub = new Map<number, RawFixture[]>();
  for (const fixture of previous?.fixtures ?? []) {
    for (const id of [fixture.teams.home.id, fixture.teams.away.id]) {
      if (!byClub.has(id)) continue;
      const list = keptByClub.get(id);
      if (list) list.push(fixture);
      else keptByClub.set(id, [fixture]);
    }
  }

  const now = Date.now();
  const nextKickoffFor = (clubId: number): number | null => {
    const upcoming = (keptByClub.get(clubId) ?? [])
      .map((f) => new Date(f.fixture.date).getTime())
      .filter((t) => t > now)
      .sort((a, b) => a - b);
    return upcoming[0] ?? null;
  };

  const due = clubs.filter(
    (club) =>
      forceAll ||
      needsRefresh(
        {
          lastFetchedAt: lastFetched.get(club.id) ?? null,
          nextKickoff: nextKickoffFor(club.id),
        },
        now,
      ),
  );

  console.log(
    `${clubs.length} clubs; ${due.length} need fetching` +
      `${forceAll ? " (--all)" : `, ${clubs.length - due.length} still fresh`}.`,
  );

  const fixtures: RawFixture[] = [];
  const unavailableClubs: Club[] = [];
  const records: ClubFetchRecord[] = [];

  for (const club of clubs) {
    if (!due.includes(club)) {
      // Keep what we already hold; one call covers months, so most clubs are still
      // accurate for the 21-day window without spending anything.
      fixtures.push(...(keptByClub.get(club.id) ?? []));
      records.push({
        id: club.id,
        name: club.name,
        fetchedAt: lastFetched.get(club.id)!,
      });
      continue;
    }

    try {
      const raw = await api<RawFixture[]>("fixtures", {
        team: club.id,
        next: FIXTURES_PER_CLUB,
      });
      fixtures.push(...raw.map(trim));
      records.push({ id: club.id, name: club.name, fetchedAt: new Date().toISOString() });
      console.log(`  ${club.name} -> ${raw.length}`);
    } catch (error) {
      // Recorded rather than swallowed: an empty fixture list is indistinguishable
      // from a club with no upcoming matches, so the app has to be told which it is.
      // Keep the stale fixtures rather than blanking the club.
      fixtures.push(...(keptByClub.get(club.id) ?? []));
      unavailableClubs.push(club);
      const previousFetch = lastFetched.get(club.id);
      if (previousFetch) {
        records.push({ id: club.id, name: club.name, fetchedAt: previousFetch });
      }
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
    clubs: records.sort((a, b) => a.id - b.id),
  };
  await writeFile(FIXTURES_PATH, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`\nWrote ${deduped.length} fixtures across ${clubs.length} clubs.`);
  console.log(`API calls used: ${stats.calls}`);
  if (unavailableClubs.length) {
    console.log(`\nClubs that failed (showing whatever was already stored):`);
    for (const club of unavailableClubs) console.log(`  - ${club.name} (${club.id})`);
    console.log(`Re-run to retry them.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
