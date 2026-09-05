# Use API-Football as the club fixture data source

We need club fixture data spanning the many different leagues (Bundesliga, Süper Lig, Championship, and others, including women's leagues) that Bosnia and Herzegovina national team members play in. We evaluated API-Football, football-data.org, TheSportsDB, and Sportmonks. football-data.org's free tier misses key leagues (e.g. Süper Lig); Sportmonks covers enough leagues only at ~€99/mo; TheSportsDB is too shallow for reliable fixture/stat data. We chose API-Football: broad multi-league coverage in one subscription, a free tier sufficient for daily-cached polling, and a $19/mo tier if we outgrow it.

## Consequences

API-Football's terms of service do not grant an explicit redistribution license — we display fixture data publicly at our own risk (a common, widely-tolerated practice for non-commercial hobby fan sites), and credit "Data via API-Football." We cache fixtures in our own database and serve the merged Schedule from our own backend; we never proxy live API-Football calls directly to public users, both to stay within rate limits and to reduce ToS exposure.
