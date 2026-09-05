# Bosnian Support Schedule

A public, no-login site that merges the club fixture schedules of Bosnia and
Herzegovina's senior men's and women's national team players into one calendar,
so fans know when and where to watch each of them next.

Built by [Pričaj](https://pricaj.vercel.app) — speaking practice for Croatian,
Bosnian and Serbian — and it shares Pričaj's "Jadran" design system: the same
OKLCH tokens, Fraunces/Karla type, and light/dark toggle.

See [`CONTEXT.md`](./CONTEXT.md) for the domain vocabulary and
[`docs/adr/`](./docs/adr) for the data-source decisions.

## Getting started

```bash
cp .env.example .env.local   # add your API-Football key
npm run refresh:roster       # resolve squads + clubs into data/roster.json
npm run refresh:fixtures     # fetch each club's matches into data/fixtures.json
npm run dev
```

Both data files are committed, so `npm run dev` works with no key at all — the key
is only needed to refresh them.

## What it serves

| Surface | Path | Notes |
| --- | --- | --- |
| Website | `/` | Flat chronological feed, filterable by squad and player |
| Calendar feed | `/api/calendar.ics` | Subscribe in Google/Apple Calendar |
| JSON API | `/api/schedule` | Read-only, CORS-open |

Kickoff times render in the viewer's own timezone, with UTC shown underneath in
muted text.

## How the data flows

Both the roster and the fixtures are resolved **offline** and committed. Rendering
makes no upstream calls at all, which is what keeps the app inside the free tier —
see [ADR-0003](./docs/adr/0003-fetch-fixtures-offline-into-a-committed-file.md).

**Offline, via `npm run refresh:roster`:**

1. Resolve the men's and women's senior national team ids (or use the
   `BIH_*_TEAM_ID` env vars). Youth sides — U21, U19, U17 — are excluded, since
   API-Football also flags them `national: true`.
2. Fetch each squad, then each player's current Club from their team history,
   ignoring every Bosnian representative side.
3. Write `data/roster.json` and commit it.

**Offline, via `npm run refresh:fixtures`** (daily, by GitHub Actions):

4. Read `data/roster.json` and apply the Manual Override table
   (`data/overrides.json`) — see [`data/README.md`](./data/README.md).
5. Fetch upcoming matches for each distinct Club, one call each, paced under the
   free tier's ~10/minute cap. Clubs that fail are recorded, not silently skipped.
6. Write `data/fixtures.json` and commit it.

**At render time — no network:**

7. Merge into one chronological Schedule, keeping everything inside a **21-day
   horizon**, dropping matches that kicked off more than ~2 hours ago, and
   deduplicating fixtures that involve more than one National Team Member.

The horizon is a time bound, not a match count. An earlier fixed "next 5 per
club" silently dropped cup and continental ties for clubs playing twice a week.

## Testing

```bash
npm test        # node:test, no extra dependencies
```

The pure logic is covered: Schedule merging and the horizon (`lib/merge.ts`),
kickoff formatting and day grouping (`lib/kickoff.ts`), ICS generation
(`lib/ics.ts`), mojibake repair (`lib/text.ts`), bounded concurrency
(`lib/concurrency.ts`), retry/throttle policy (`lib/pacing.ts`), synthetic member
ids (`lib/ids.ts`), and rate-limit classification (`lib/api-football.ts`).

`lib/cache-policy.test.ts` is a guard rather than a unit test: Next.js needs
`export const revalidate` to be a literal, so the routes can't import
`FIXTURES_TTL_SECONDS`. The test asserts they agree, because they once drifted.

## Request budget

Nothing is fetched while rendering, so **traffic costs nothing** — one visitor or a
hundred thousand make the same zero upstream calls. Only the two refresh scripts
spend anything:

| Script | Calls | How often |
| --- | --- | --- |
| `refresh:fixtures` | ~19/day average (39 on a full refresh) | daily |
| `refresh:roster` | ~64 (1 per player), resumes from disk | after each call-up window |

That fits the **free tier** (100/day, ~10/minute), which is what this layout is for.
The scripts pace themselves at ~6.5s per call to stay under the per-minute cap.

`refresh:fixtures` only fetches clubs whose stored data has gone stale. One call
returns a club's next ~20 matches — months, against a 21-day display window — so
re-fetching every club daily spent most of its calls re-downloading unchanged data.
Clubs playing within three days are re-checked every run, since those are the
fixtures that move; everything else is re-checked at least every four days. Measured
over a week that is 136 calls rather than 273. Use `--all` to force a full refresh.

Rendering used to fetch every club, three times over (page, JSON, ICS), for ~120
calls a day. Over the per-minute cap API-Football replies HTTP 200 with a `rateLimit`
error body rather than 429, so those reads looked like "this club has no matches" and
clubs vanished from the published schedule unnoticed. See ADR-0003.

## Scope

**In v1:** website, ICS feed, read-only JSON API, upcoming fixtures only, all
competitions (league, cup, continental).

**Deferred to v2:** player stats (goals, appearances, cards, minutes — already
available from the same API), and an admin UI for editing Manual Overrides.

Fixture and squad data via API-Football. Not affiliated with NFSBiH.
