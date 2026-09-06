# Fetch fixtures offline into a committed file

Fixtures used to be fetched while rendering. Each of the three surfaces — the page,
the JSON API and the ICS feed — assembled the Schedule independently, and each one
fetched every distinct Club. A cold build therefore made about 120 upstream calls in
a few seconds against a 300/minute cap, rather than the ~40 the daily budget implied.

Over that cap, API-Football answers **HTTP 200 with a `rateLimit` error body** rather
than 429 (the same way it reports a missing `season`: 200, with the complaint in
`errors`). A failed Club then resolved to an empty fixture list, which is
indistinguishable from a Club with no upcoming matches. One build published a
Schedule missing twelve of thirty-nine Clubs — Leeds, Young Boys and Astana among
them — with nothing logged and nothing visibly wrong.

Making the app fit the **free tier** settled the question. The free tier allows 100
requests/day and ~10/minute. Thirty-nine Clubs at ten a minute is about four minutes
of fetching: no visitor waits four minutes, so request-time fetching is not merely
wasteful at that tier, it is impossible.

## Decision

Fetch fixtures offline, exactly as the roster already is. `npm run refresh:fixtures`
resolves every Club's upcoming matches, paced under the per-minute cap, and writes
`data/fixtures.json`, which is committed. The app reads that file and makes **no
upstream calls when rendering**, so all three surfaces cost nothing to serve however
often they are rendered, and however many people read them.

A GitHub Actions workflow runs the refresh daily and commits the result.

Fixtures are stored in their upstream (trimmed) shape rather than already merged into
a Schedule, so correcting the roster or a Manual Override takes effect on the next
render instead of waiting for another API refresh.

## Consequences

**Cost.** A refresh is ~39 calls. Steady state is ~39/day against the free tier's 100,
down from ~120/day. A roster refresh is another ~64, so **don't run both on the same
day** — together they exceed 100.

**Rendering is free, so it can be frequent.** Revalidation dropped from 24 hours to 1,
because the interval no longer buys anything but freshness. See `lib/cache-policy.ts`;
it was an API budget and is now only a staleness bound.

**Past matches need removing explicitly.** A live "next 20" query only ever returned
upcoming matches, so nothing had to drop the finished ones. A stored fixture becomes a
past fixture just by sitting there, so `mergeFixtures` now takes a window start as
well as a horizon. Without it, yesterday's matches would sit at the top of the feed.

**Freshness is bounded by the refresh, not the render.** A fixture rescheduled after
the last refresh is wrong until the next one. For a 21-day horizon on a daily refresh
that is an acceptable trade; it would not be for live scores, which is one reason v2
stats want rethinking rather than bolting onto this.

**A failed Club is now recorded, not inferred.** The refresh writes `unavailableClubs`
into the file, and the app names them on the page and in the JSON. An incomplete
Schedule must never render as a complete one.

## Amended

The body above records the decision as taken. Two of its statements have since stopped
being true, and are corrected here rather than edited away.

**There are two surfaces, not three.** The ICS feed was removed in `d495c40`, leaving
the page and the JSON API. The reasoning is unaffected — it counted surfaces only to
show how request-time fetching multiplied the call cost.

**One refresh now covers both, so "don't run both on the same day" no longer applies.**
The Cost consequence above splits the work into a ~39-call fixture refresh and a
separate ~64-call roster refresh that together exceed the free tier's 100/day. Since
`72c9d35`, `npm run refresh:fixtures` is the single daily run: it re-fetches both squad
lists, every Club due a refresh, and both National Teams' own Internationals, writing
`data/roster.json`, `data/fixtures.json` and `data/internationals.json`.

Its cost is two calls for the squad lists, two for the Internationals, one per Club due
a refresh, and one per Member whose Club is not already on record — usually none, since
squads only change at a call-up. A fruitless Club lookup is believed for a week, which
matters because twenty-nine of sixty-one Members have no Club anywhere upstream and
asking after each every morning would spend a third of the tier learning the same
nothing. Steady state is roughly 23 calls a day against 100, and the run reports its own
usage on finishing.

`npm run refresh:roster` is no longer part of the daily budget. It is now the tool for a
*suspect* Roster rather than a stale one — a full rebuild, run by hand when the stored
Roster looks wrong.
