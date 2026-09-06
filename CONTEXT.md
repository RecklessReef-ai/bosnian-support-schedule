# Bosnian Support Schedule

A public, no-login website that merges the Club Fixtures and Internationals of Bosnia and Herzegovina's senior men's and women's national team members into one Schedule, so diaspora fans know when and where to watch them next.

## Language

**National Team Member**:
A player named in the current senior squad of the Bosnia and Herzegovina men's or women's national football team. Scope is senior teams only for v1 — no U21, youth, or futsal.
_Avoid_: Player (too generic — a National Team Member is also a Club Player), roster entry, squad player.

**Roster**:
The published list of National Team Members for one squad, as last supplied by the upstream source and stamped with the date it was gathered. It deliberately makes no claim to be either a standing squad pool or an announced match-day call-up, because the source does not say which it is.
_Avoid_: Squad list, call-up, lineup, team sheet.

**Side**:
One of the two teams contesting a Fixture. There are exactly two kinds: a Club and a National Team.
_Avoid_: Team (ambiguous), opponent, entrant.

**Club**:
A Side that a National Team Member plays for day-to-day, as distinct from the national team itself.
_Avoid_: Team (ambiguous with "national team"), pro team.

**National Team**:
A Side representing Bosnia and Herzegovina, or the country a Fixture is contested against. Only the senior men's and women's Bosnian sides are in scope — the U21 and youth sides are deliberately excluded, even though the upstream source also flags them as national.
_Avoid_: Country, nation, representative side.

**Fixture**:
Any single scheduled match involving a National Team Member. There are exactly two kinds: a Club Fixture and an International.
_Avoid_: Game, match.

**Club Fixture**:
A Fixture on a Club's calendar, where a National Team Member plays for their Club.
_Avoid_: Domestic match, league game.

**International**:
A Fixture on the Bosnia and Herzegovina senior national team's own calendar, where National Team Members play for the national team instead of their Clubs. Club football pauses while these are played, so the two kinds rarely compete for the same weekend.
_Avoid_: National team fixture, friendly, cap.

**International Window**:
A cluster of Internationals played across a single break in the club season, typically two or three matches over about ten days. This, rather than the individual International, is the unit fans plan around.
_Avoid_: International break, camp, window (unqualified).

**Schedule**:
The unified, publicly published calendar of upcoming Fixtures across all National Team Members — Club Fixtures and Internationals together, in one chronological feed.
_Avoid_: Broadcast, calendar, feed.

**Source**:
Where a given Fixture or Roster's information came from, recorded on the record itself rather than claimed once for the whole site. Every published record credits the Source that actually produced it, so a hand-gathered Fixture is never presented as having come from the upstream API.
_Avoid_: Provider, feed, origin, credit.

**Publish** (verb):
The act of making the Schedule available to fans on the public website. Explicitly does NOT mean streaming or airing the matches themselves — no broadcast rights or media licensing are involved.
_Avoid_: Broadcast (as a verb — reserved for actual match streaming, which is out of scope), stream, air.

**Manual Override**:
A hand-entered correction to a National Team Member's automatically-tracked Club affiliation, used when the automated data source lags a real transfer or call-up — most commonly needed for the women's team. Not an admin UI in v1, just a directly-edited data file/row.
_Avoid_: Admin panel, correction record.
