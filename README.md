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
5. Fetch the next 5 fixtures per distinct Club, across all competitions.
6. Merge into one chronological Schedule, deduplicating fixtures that involve
   more than one National Team Member.

## Request budget

The free API-Sports tier allows **100 requests/day** and roughly **10
requests/minute**. Both matter:

- **Roster refresh** costs ~1 call per player (~64 for both squads). This is why
  it's an offline script rather than a runtime fetch — doing it on a cold page
  load, plus fixtures, would exceed 100/day every day. The script paces itself at
  ~6.5s per call and checkpoints after each player, so an interrupted run resumes
  for free.
- **Fixtures** cost ~1 call per distinct club, cached 24h — about 50/day.

Together that's ~50/day steady-state, with headroom for an occasional roster
refresh. Move to the $19/mo tier if you shorten the fixture TTL.

## Scope

**In v1:** website, ICS feed, read-only JSON API, upcoming fixtures only, all
competitions (league, cup, continental).

**Deferred to v2:** player stats (goals, appearances, cards, minutes — already
available from the same API), and an admin UI for editing Manual Overrides.

Fixture and squad data via API-Football. Not affiliated with NFSBiH.
