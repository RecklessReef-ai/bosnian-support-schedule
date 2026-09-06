# NFSBiH RSS as a second source, with per-record provenance

Adding Internationals — the national team's own matches — to the Schedule exposed an
asymmetry. API-Football returns six upcoming men's Internationals (UEFA Nations League,
25 September to 17 November 2026) and **zero** for the women's side.

The women's team id is not wrong. `teams?search=Bosnia` returns `14455`,
`Bosnia-Herzegovina W`, flagged `national: true` — the same id
`refresh:roster` already resolves a 35-player squad from. Two independent checks
confirmed the emptiness is real rather than a provider gap: the women's 2027 World Cup
qualifying group (UEFA League C) **finished on 9 June 2026**, and NFSBiH's own women's
national team page lists nothing after it. There are no scheduled matches to fetch.

That matters, because it rules out the obvious fix. A scraper pointed at a second
provider would scrape nothing: no upstream holds fixtures that API-Football is missing.

## The federation publishes prose, not fixtures

NFSBiH is the authoritative source, and it has no structured fixture list at all — its
national team pages are news articles. When a friendly is arranged, it arrives as a
paragraph, not a row. So an automated second *fixture feed* cannot exist, however much
we would like one.

It does, however, publish an **RSS feed** at `/rss.feed`: Joomla-generated, `bs-ba`,
rebuilt daily, and category-tagged in the item URLs — `nogomet-m/a-reprezentacija-m`
for the men's senior side, `nogomet-z/…` for women's football, with youth, futsal and
regional selections in their own paths.

Social media was considered and rejected. [@nfsbih_official](https://www.instagram.com/nfsbih_official/)
and [@NFSBiH](https://x.com/NFSBiH) carry the *same* announcements — the federation
writes the article, then posts the link — but X has no usable free read tier and
Instagram will not serve another account's posts without a business connection. For a
project deliberately built to sit inside a free tier (see ADR-0003), paying a monthly
API fee to learn the same fact minutes earlier is a bad trade.

The feed's value was demonstrated before it was even built. On 5 September 2026 it
carried *"Hvala ti, Edine!"* — Edin Džeko announcing his retirement from the national
team after the 2 October match against Sweden. He is in `data/roster.json`, and
API-Football will keep listing him until the November squad is named, because
`players/squads` has no concept of "retired": a player stops appearing only when a
newer squad exists. The federation knew five weeks before the provider could.

## Decision

**NFSBiH's RSS feed is a monitoring trigger, not a fixture feed.** The daily refresh
reads it, keeps only senior national team categories, and **opens a GitHub issue** when
a relevant item appears. A human reads the article and decides whether it changes
anything.

**Internationals can be entered by hand**, extending the Manual Override pattern that
already exists for Clubs, for matches announced by the federation but not yet carried
upstream.

**Provenance is recorded on each record, not claimed once for the site.** The JSON
API's top-level `source: "API-Football"` is removed; every Fixture carries its own
`source`, so a hand-entered match is credited to NFSBiH and never presented as having
come from the API.

## Consequences

**The women's section will be empty, and that is correct.** It renders an explicit
"no matches scheduled" state, distinct from "we could not load them". An empty section
here is a true statement about the world, not a bug to be fixed.

**RSS gives prose.** It reports *that* there is national team news, never
*"BiH v Estonia, 9 June, Zenica"*. Anything more automated would be parsing article
text, which is not worth the fragility.

**The category filter is load-bearing.** The feed's thirteen items are mostly youth
teams, the men's league and futsal. A filter that is too loose opens an issue every day
about the U-17s and will be muted within a week, which costs the whole mechanism.

**Provenance is a breaking API change**, made while the API is days old and has no known
consumers. Deferring it would mean changing a contract people depend on, to publish a
credit we are already obliged to give.

**Two surfaces, not three.** ADR-0001 and ADR-0003 describe an ICS feed alongside the
page and the JSON API. It has since been removed in favour of a browser experience and
JSON only; those ADRs stand as written, describing what was true when they were decided.
