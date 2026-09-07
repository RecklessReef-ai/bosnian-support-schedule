# Bosnian Support Schedule

A public, no-login site that merges the club fixture schedules of Bosnia and
Herzegovina's senior men's and women's national team players into one calendar,
so fans know when and where to watch each of them next.

Built by [Pričaj](https://pricaj.vercel.app) — speaking practice for Bosnian, Croatian,
English, and Serbian.

The front end is a single 640px column on the flag navy (`#0D2551`), with gold
(`#E8B93C`) spent on exactly one thing per screen: the next match. One theme, no
toggle, and system faces only — no web font request stands between a cold load on
a phone and the next kickoff. Tokens live at the top of
[`app/globals.css`](./app/globals.css).

See [`CONTEXT.md`](./CONTEXT.md) for the domain vocabulary and
[`docs/adr/`](./docs/adr) for the data-source decisions.

## Getting started

```bash
cp .env.example .env.local   # add your API-Football key
npm run refresh:roster       # resolve squads + clubs into data/roster.json
npm run refresh:fixtures     # the daily refresh: squads, club fixtures, internationals
npm run dev
```

Every data file is committed, so `npm run dev` works with no key at all — the key
is only needed to refresh them.

## What it serves

| Surface | Path | Notes |
| --- | --- | --- |
| Website | `/` | Flat chronological feed, filterable by squad |
| JSON API | `/api/schedule` | Read-only, CORS-open |

Kickoff times render in the viewer's own timezone, with UTC shown underneath in
muted text.

Both surfaces serve **one chronological feed of both kinds of Fixture** — Club
Fixtures and Internationals together. Every Fixture in the JSON carries its own
`kind` (`"club"` or `"international"`) and its own `source`; the top-level
`source: "API-Football"` the API used to claim is **gone**, because one site-wide
credit cannot be true of a match a human entered from NFSBiH's announcement — see
[ADR-0004](./docs/adr/0004-nfsbih-rss-as-second-source-with-per-record-provenance.md).
`squadInternationals` reports each squad as `scheduled`, `none-scheduled` or
`unavailable`, so an empty calendar and an outage never read alike.

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

4. Re-fetch both squad lists, one call each, and rewrite `data/roster.json`. A
   Member's Club is only looked up when there isn't one on record already.
5. Apply the Manual Override table (`data/overrides.json`) — see
   [`data/README.md`](./data/README.md).
6. Fetch upcoming matches for each distinct Club, one call each, paced under the
   free tier's ~10/minute cap. Clubs that fail are recorded, not silently skipped.
   Write `data/fixtures.json`.
7. Fetch each squad's own upcoming **Internationals**, one call each, into
   `data/internationals.json`. Both squads are recorded whatever happens, and a
   squad with none scheduled reads differently from one that could not be fetched.

**At render time — no network:**

8. Merge both kinds into one chronological Schedule, dropping matches that kicked
   off more than ~2 hours ago and deduplicating Club Fixtures that involve more
   than one National Team Member. Club Fixtures are kept inside a **21-day
   horizon**; Internationals are not bounded by it, and arrive one **International
   Window** at a time. All of it happens in `lib/assemble-schedule.ts`, which is
   pure and takes the current time as an argument.

The horizon is a time bound, not a match count. An earlier fixed "next 5 per
club" silently dropped cup and continental ties for clubs playing twice a week.

It bounds Club Fixtures only. It exists to stop a dense feed sprawling — 61
Members across 39 Clubs — and there are about ten Internationals a year, which
cannot sprawl. Applied to them it would only cut the next break in half: with the
committed data it would show the 25 September match and hide the 28th's, three
days later in the same break. So Internationals are selected by **window**
instead: consecutive matches belong to the same one while no more than 14 days
separate them, and the whole of the next window is shown however far off its later
matches fall. Fourteen days sits in a wide gap between matches inside a break
(three or four days apart) and separate breaks (never closer than about three
weeks, since club football has to resume in between).

## Watching the federation

API-Football does not carry everything NFSBiH announces — a retirement, a call-up,
or a match the federation has fixed and the API has not. So a second daily job
(`npm run watch:feed`, and `.github/workflows/watch-federation-feed.yml`) reads the
federation's public RSS feed, keeps only senior national team items, and opens a
GitHub issue for each new one, labelled `federation-news`.

The feed is a **trigger for a human, never a fixture source**. It yields prose — a
headline, a paragraph of Bosnian, a photo — so nothing is parsed out of it and no
match details are ever inferred from it. The issue links to the article and waits.

Items are classified by the category slug in their URL: `a-reprezentacija-m` and
`a-reprezentacija-z` are kept, youth (`omladinske-selekcije-*`), the domestic
leagues and futsal are rejected. A handful of items are published with no category
at all; those are kept when the headline names the national team and doesn't name an
age group, because one such item turned out to be about ticketing for upcoming
national team matches. That errs towards a spurious issue rather than a missed one.

Deduplication reads the issues themselves — each carries an HTML comment naming the
article — rather than a committed state file, so re-running the workflow never opens
a duplicate and a closed issue never comes back. The run needs no API key and makes
no metered calls. Without a `GITHUB_TOKEN` it is a dry run that prints what it would
open.

## Testing

```bash
npm test        # node:test, no extra dependencies
```

The pure logic is covered: Schedule merging and the horizon (`lib/merge.ts`),
kickoff formatting and day grouping (`lib/kickoff.ts`), mojibake repair
(`lib/text.ts`), bounded concurrency (`lib/concurrency.ts`), retry/throttle policy
(`lib/pacing.ts`), club staleness (`lib/refresh-policy.ts`), squad reconciliation
and Club-lookup reuse (`lib/roster.ts`), the Internationals record and its three
states (`lib/internationals.ts`), upstream record trimming
(`lib/fixture-record.ts`), synthetic member ids (`lib/ids.ts`), rate-limit
classification (`lib/api-football.ts`), and the federation feed's parsing and
filtering (`lib/nfsbih-feed.ts`, against a captured sample of the live feed in
`lib/nfsbih-feed.sample.xml`).

`lib/cache-policy.test.ts` is a guard rather than a unit test: Next.js needs
`export const revalidate` to be a literal, so the routes can't import
`FIXTURES_TTL_SECONDS`. The test asserts they agree, because they once drifted.

## Request budget

Nothing is fetched while rendering, so **traffic costs nothing** — one visitor or a
hundred thousand make the same zero upstream calls. Only the two refresh scripts
spend anything:

| Script | Calls | How often |
| --- | --- | --- |
| `refresh:fixtures` | ~23/day average (~45 on a full refresh) | daily |
| `refresh:roster` | ~64 (1 per player), resumes from disk | only to rebuild a suspect roster |

The daily ~23 is ~19 stale clubs, two squad lists and two Internationals. On the
days a squad changes, add a call for each new Member's Club.

That fits the **free tier** (100/day, ~10/minute), which is what this layout is for.
The scripts pace themselves at ~6.5s per call to stay under the per-minute cap.

`refresh:fixtures` only fetches clubs whose stored data has gone stale. One call
returns a club's next ~20 matches — months, against a 21-day display window — so
re-fetching every club daily spent most of its calls re-downloading unchanged data.
Clubs playing within three days are re-checked every run, since those are the
fixtures that move; everything else is re-checked at least every four days. Measured
over a week that is 136 calls rather than 273. Use `--all` to force a full refresh.

The squads work the same way in miniature: the two list calls happen every run, but
a Member's Club is only looked up when there isn't one on record, and a lookup that
finds nothing isn't repeated for a week. Without that, the twenty-nine Members
upstream has no Club for would cost twenty-nine calls every morning to learn the
same nothing.

Rendering used to fetch every club, and each surface did it independently, for
~120 calls a day. Over the per-minute cap API-Football replies HTTP 200 with a
`rateLimit` error body rather than 429, so those reads looked like "this club has no
matches" and clubs vanished from the published schedule unnoticed. See ADR-0003.

## Scope

**In v1:** website and read-only JSON API, upcoming fixtures only, all competitions
(league, cup, continental). An ICS calendar feed was published early on and then
withdrawn, so there are two surfaces to keep correct rather than three.

**Deferred to v2:** player stats (goals, appearances, cards, minutes — already
available from the same API), and an admin UI for editing Manual Overrides.

Fixture and squad data via API-Football. Not affiliated with NFSBiH.
