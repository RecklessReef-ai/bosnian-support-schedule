/**
 * The daily offline refresh: re-fetches both squad lists, every Club's upcoming
 * Club Fixtures, and both National Teams' own Internationals, then writes
 * data/roster.json, data/fixtures.json and data/internationals.json.
 *
 * This runs offline for the same reason the Roster does. Serving the Schedule used
 * to fetch every Club at request time, and every surface did it independently, so a
 * cold build made ~120 calls in a few seconds. That fits no free tier, and over the
 * per-minute cap the provider answers HTTP 200 with a `rateLimit` body, so failures
 * looked like "this club has no matches" and Clubs silently vanished from the
 * published Schedule.
 *
 * Fetching here instead costs one call per Club due a refresh, two for the squad
 * lists and two for the Internationals, all paced under the free tier's ~10/minute
 * cap. The app then serves every surface from those files with no upstream calls
 * at all.
 *
 *   npm run refresh:fixtures
 */
import { readFile, writeFile } from "node:fs/promises";
import { hasApiKey } from "../lib/api-football.ts";
import { trimFixtureRecord, type UpstreamFixture } from "../lib/fixture-record.ts";
import {
  recordSquadInternationals,
  type InternationalsFetch,
} from "../lib/internationals.ts";
import { buildMembersByClub } from "../lib/merge.ts";
import {
  fetchInternationals,
  KNOWN_SQUAD_TEAM_IDS,
  refreshSquads,
  resolveSquadTeamIds,
  type SquadTeamIds,
} from "../lib/national-team.ts";
import { createPacedClient } from "../lib/paced-api.ts";
import {
  applyOverrides,
  type OverridesFile,
  type RosterFile,
  type StoredMember,
} from "../lib/roster.ts";
import { needsRefresh } from "../lib/refresh-policy.ts";
import type {
  Club,
  ClubFetchRecord,
  FixturesFile,
  InternationalsFile,
  RawFixtureRecord,
  Squad,
  SquadInternationals,
} from "../lib/types.ts";

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

const ROSTER_PATH = new URL("../data/roster.json", import.meta.url);
const FIXTURES_PATH = new URL("../data/fixtures.json", import.meta.url);
const INTERNATIONALS_PATH = new URL("../data/internationals.json", import.meta.url);
const { call: api, stats } = createPacedClient();

const writeJson = (path: URL, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

/**
 * Re-fetches both squad lists and rewrites data/roster.json.
 *
 * Two calls, plus one per Member whose Club is not already on record — usually
 * none, since the squads only change at a call-up. A squad that cannot be fetched
 * keeps whatever was stored, and the run carries on: the Club Fixtures are the
 * more perishable half of the refresh and must not be held hostage to the Roster.
 */
async function refreshRoster(
  teamIds: SquadTeamIds,
  stored: RosterFile | null,
): Promise<StoredMember[]> {
  const existing = (stored?.members ?? []) as StoredMember[];

  try {
    const { members, unresolved, unavailableSquads } = await refreshSquads(
      api,
      teamIds,
      { existing, log: (line) => console.log(`  ${line}`) },
    );

    const roster: RosterFile = { generatedAt: new Date().toISOString(), members };
    await writeJson(ROSTER_PATH, roster);

    if (unavailableSquads.length) {
      console.log(`  squads that failed: ${unavailableSquads.join(", ")}`);
    }
    if (unresolved.length) {
      // Named one by one in `npm run refresh:roster`; a count is enough here, or
      // the daily log is a wall of the same names every morning.
      console.log(`  ${unresolved.length} members have no club (see overrides.json)`);
    }
    return members;
  } catch (error) {
    console.log(`  FAILED (${(error as Error).message}); keeping the stored roster.`);
    return existing;
  }
}

/**
 * Fetches both National Teams' own matches and writes data/internationals.json.
 *
 * Both squads are always recorded, whatever happened. The women's squad currently
 * has no Internationals scheduled at all — their qualifying group is over — and
 * that has to read differently from a squad we could not reach, or a fan is told
 * there is nothing coming when the truth is that we do not know.
 */
async function refreshInternationals(teamIds: SquadTeamIds) {
  const previous = await readOptional<InternationalsFile>("internationals.json");
  const storedBySquad = new Map(
    (previous?.squads ?? []).map((record) => [record.squad, record]),
  );

  const fetchedAt = new Date().toISOString();
  const squads: SquadInternationals[] = [];

  for (const squad of ["men", "women"] as const satisfies readonly Squad[]) {
    const teamId = teamIds[squad];
    let result: InternationalsFetch;
    try {
      result = { ok: true, internationals: await fetchInternationals(api, teamId) };
    } catch (error) {
      result = { ok: false, reason: (error as Error).message };
    }

    const record = recordSquadInternationals({
      squad,
      teamId,
      result,
      previous: storedBySquad.get(squad),
      fetchedAt,
    });
    squads.push(record);
    console.log(`  ${squad} -> ${describeInternationals(record)}`);
  }

  const out: InternationalsFile = { generatedAt: fetchedAt, squads };
  await writeJson(INTERNATIONALS_PATH, out);
  return squads;
}

function describeInternationals(record: SquadInternationals): string {
  switch (record.status) {
    case "scheduled":
      return `${record.internationals.length} internationals`;
    case "none-scheduled":
      return "none scheduled";
    case "unavailable":
      return (
        `FAILED (${record.unavailableReason}), ` +
        `showing ${record.internationals.length} already stored`
      );
  }
}

async function main() {
  // --all ignores freshness and re-fetches everything, for when the stored data is
  // suspect rather than merely old.
  const forceAll = process.argv.includes("--all");

  // Free when both ids are pinned in the environment, which the workflow does.
  const teamIds = await resolveSquadTeamIds(api).catch((error: Error) => {
    console.log(`Could not look up the squads (${error.message}); using the known ids.`);
    return KNOWN_SQUAD_TEAM_IDS;
  });

  // Re-fetch the squads first, so a Member called up today has their Club's
  // fixtures fetched in the same run rather than the next one.
  console.log(`Squad lists (men=${teamIds.men}, women=${teamIds.women}):`);
  const storedRoster = await readOptional<RosterFile>("roster.json");
  const refreshedMembers = await refreshRoster(teamIds, storedRoster);

  // Read the overrides the app reads, through the same override logic, so the
  // clubs fetched here are exactly the clubs the app will look for.
  const overrides = await read<OverridesFile>("overrides.json");
  const members = applyOverrides(refreshedMembers, overrides);
  const byClub = buildMembersByClub(members);
  const clubs = [...byClub.values()].map((forClub) => forClub[0].club!);

  const previous = await readOptional<FixturesFile>("fixtures.json");
  const lastFetched = new Map(
    (previous?.clubs ?? []).map((record) => [record.id, record.fetchedAt]),
  );
  const keptByClub = new Map<number, RawFixtureRecord[]>();
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
    `\n${clubs.length} clubs; ${due.length} need fetching` +
      `${forceAll ? " (--all)" : `, ${clubs.length - due.length} still fresh`}.`,
  );

  const fixtures: RawFixtureRecord[] = [];
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
      const raw = await api<UpstreamFixture[]>("fixtures", {
        team: club.id,
        next: FIXTURES_PER_CLUB,
      });
      fixtures.push(...raw.map(trimFixtureRecord));
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
  await writeJson(FIXTURES_PATH, out);

  console.log(`\nInternationals:`);
  const squads = await refreshInternationals(teamIds);

  const internationals = squads.reduce((n, s) => n + s.internationals.length, 0);
  console.log(
    `\nWrote ${refreshedMembers.length} members, ${deduped.length} fixtures across ` +
      `${clubs.length} clubs, and ${internationals} internationals across ` +
      `${squads.length} squads.`,
  );
  console.log(`API calls used: ${stats.calls} (the free tier allows 100/day).`);
  if (unavailableClubs.length) {
    console.log(`\nClubs that failed (showing whatever was already stored):`);
    for (const club of unavailableClubs) console.log(`  - ${club.name} (${club.id})`);
    console.log(`Re-run to retry them.`);
  }
  for (const record of squads) {
    if (record.status !== "unavailable") continue;
    console.log(
      `\nThe ${record.squad}'s internationals could not be fetched. Re-run to retry.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
