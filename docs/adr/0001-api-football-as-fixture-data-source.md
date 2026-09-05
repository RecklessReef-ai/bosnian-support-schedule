# Use API-Football as the club fixture data source

We need club fixture data spanning the many different leagues (Bundesliga, Süper Lig, Championship, and others, including women's leagues) that Bosnia and Herzegovina national team members play in. We evaluated API-Football, football-data.org, TheSportsDB, and Sportmonks. football-data.org's free tier misses key leagues (e.g. Süper Lig); Sportmonks covers enough leagues only at ~€99/mo; TheSportsDB is too shallow for reliable fixture/stat data. We chose API-Football: broad multi-league coverage in one subscription, a free tier sufficient for daily-cached polling, and a $19/mo tier if we outgrow it.

## Consequences

API-Football's terms of service do not grant an explicit redistribution license — we display fixture data publicly at our own risk (a common, widely-tolerated practice for non-commercial hobby fan sites), and credit "Data via API-Football." We cache fixtures in our own database and serve the merged Schedule from our own backend; we never proxy live API-Football calls directly to public users, both to stay within rate limits and to reduce ToS exposure.

### The per-minute cap binds before the daily one

Staying inside the daily budget turned out not to be the hard part. Each of the three
surfaces — the page, the JSON API, and the ICS feed — computes the Schedule
independently, so a cold build fans out over every Club three times: ~120 calls in a
few seconds against a 300/minute cap, not the ~40 the daily budget suggests.

When that cap is hit the provider answers **HTTP 200 with a `rateLimit` error body**,
not 429. We classified only the 429, so those reads looked like permanent failures,
and a failed Club resolved to an empty fixture list — indistinguishable from a Club
with no upcoming matches. One build published a Schedule missing twelve of
thirty-nine Clubs, Leeds and Young Boys among them, with nothing logged.

Two rules follow, and `lib/api-football.ts` now holds both:

- A rate limit is identified by the error **body** as well as the status code, and is
  retried on a short budget. Everything else — a bad key, an exhausted daily quota —
  still fails immediately, because retrying it would only waste calls.
- A Club whose fixtures cannot be fetched is reported in `ScheduleData.unavailableClubs`
  and shown to the reader. An incomplete Schedule must never render as a complete one.
