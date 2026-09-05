# Automate roster tracking via API-Football, with manual override for women's gaps

We need to automatically track which players are currently in Bosnia and Herzegovina's men's and women's senior national team squads, and which Club each currently plays for. We considered a two-source scrape pipeline (NFSBiH's official site for authoritative call-up announcements, plus Transfermarkt for current-club data), since no mainstream API cleanly ties national-team squad membership to current club for a federation this size. We rejected that in favor of using API-Football alone — the same provider already used for fixtures (ADR-0001) — since it exposes a `players/squads` endpoint and per-player current-team data, and adding a second scrape target is real ongoing maintenance surface for marginal gain on the men's side.

## Consequences

API-Football's women's national-team squad data is historically sparser and staler than men's (a pattern across all providers, not specific to API-Football). We accept this for the men's team, where API-Football alone should stay current. For the women's team, we maintain a hand-edited manual override table (a data file/DB row, not an admin UI — see the product scope decisions in CONTEXT.md) as the fallback whenever the automated data lags a real transfer or call-up.
