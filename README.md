# Bosnian Support Schedule

A public, no-login site that merges the club fixture schedules of Bosnia and
Herzegovina's senior men's and women's national team players into one calendar,
so fans know when and where to watch each of them next.

See [`CONTEXT.md`](./CONTEXT.md) for the domain vocabulary and
[`docs/adr/`](./docs/adr) for the data-source decisions.

## Getting started

```bash
cp .env.example .env.local   # add your API-Football key
npm run refresh:roster       # resolve squads + clubs into data/roster.json
npm run dev
```

Without `API_FOOTBALL_KEY` the site still runs: it renders the committed roster
from `data/roster.json` with a banner, and no fixtures.

## What it serves

| Surface | Path | Notes |
| --- | --- | --- |
| Website | `/` | Flat chronological feed, filterable by squad and player |
| Calendar feed | `/api/calendar.ics` | Subscribe in Google/Apple Calendar |
| JSON API | `/api/schedule` | Read-only, CORS-open |

Kickoff times render in the viewer's own timezone, with UTC shown underneath in
muted text.

## How the data flows

The roster is resolved **offline**; only fixtures are fetched at request time.
That split is what keeps the app inside the free tier — see the budget below.

**Offline, via `npm run refresh:roster`:**

1. Resolve the men's and women's senior national team ids (or use the
   `BIH_*_TEAM_ID` env vars). Youth sides — U21, U19, U17 — are excluded, since
   API-Football also flags them `national: true`.
2. Fetch each squad, then each player's current Club from their team history,
   ignoring every Bosnian representative side.
3. Write `data/roster.json` and commit it.

**At request time:**

4. Read `data/roster.json` and apply the Manual Override table
   (`data/overrides.json`) — see [`data/README.md`](./data/README.md).
5. Fetch fixtures per distinct Club, across all competitions, at most 4 clubs at
   a time so one cold request can't trip the provider's per-minute cap.
6. Merge into one chronological Schedule, keeping everything inside a **21-day
   horizon** and deduplicating fixtures that involve more than one National Team
   Member.

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

The free API-Sports tier allows **100 requests/day** and roughly **10
requests/minute**. Both matter:

- **Roster refresh** costs ~1 call per player (~64 for both squads). This is why
  it's an offline script rather than a runtime fetch — doing it on a cold page
  load, plus fixtures, would exceed 100/day every day. The script paces itself at
  ~6.5s per call and checkpoints after each player, so an interrupted run resumes
  for free.
- **Fixtures** cost ~1 call per distinct club, cached 24h (`FIXTURES_TTL_SECONDS`,
  mirrored by each route's `revalidate`) — about 39/day at the current roster.

The **per-minute cap binds first**. All three surfaces (page, JSON API, ICS feed)
compute the Schedule independently, so a cold build fans out over every club three
times — ~120 calls in a few seconds. Over the cap, API-Football answers HTTP 200
with a `rateLimit` error body rather than 429; `lib/api-football.ts` treats both as
retryable and backs off briefly. Anything else (bad key, daily quota gone) fails at
once instead of burning retries.

Clubs that still fail land in `ScheduleData.unavailableClubs` and are named on the
page and in the JSON. That matters because an empty fixture list otherwise looks
exactly like a club with no upcoming matches — one build quietly published a
schedule missing 12 of 39 clubs before this was added.

## Scope

**In v1:** website, ICS feed, read-only JSON API, upcoming fixtures only, all
competitions (league, cup, continental).

**Deferred to v2:** player stats (goals, appearances, cards, minutes — already
available from the same API), and an admin UI for editing Manual Overrides.

Fixture and squad data via API-Football. Not affiliated with NFSBiH.
