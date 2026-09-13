# #33 — `venue: null` on all six Internationals: reproduction and cause

**Ticket**: RecklessReef-ai/bosnian-support-schedule#33
**Stage**: `stage:triage` — reproduced, cause located. No fix written.
**Triaged**: 2026-09-13, 14:43–14:44 UTC
**Checkout state at triage**: branch `master`, `git rev-list --count HEAD..origin/master` = **0**, working tree clean. Every file quoted below is what `origin/master` holds.

---

## Verdict

**(a) API-Football returns no venue for these fixtures.**

Upstream sends the `venue` object on all six Internationals and sends it **empty** — `{"id":0,"name":null,"city":null}`. We ask for it, we receive it, and there is nothing in it. The mapping is not at fault and neither is the request.

| Candidate | Verdict | Proved by |
|---|---|---|
| (a) upstream returns no venue | **TRUE** | live call, all six fixtures, `name: null` |
| (b) our mapping discards a venue it receives | ruled out | same mapping preserves a name on the same records, and on a live club fixture |
| (c) we never ask for it | ruled out | the field is present in the live response; there is no field-selection parameter to omit |

---

## Reproduction

### 1. Upstream, the exact call the refresh script makes

`lib/national-team.ts` → `fetchInternationals()` issues `fixtures` with `team` and `next=10`. `data/internationals.json` records `teamId: 1113`. Replayed verbatim at **2026-09-13 14:43:44 UTC**:

```
$ curl -s -H "x-apisports-key: $API_FOOTBALL_KEY" \
    "https://v3.football.api-sports.io/fixtures?team=1113&next=10"

HTTP/2 200
x-ratelimit-requests-limit: 7500
x-ratelimit-requests-remaining: 7450

{ "results": 6, "errors": [] }
```

Raw `fixture.venue`, exactly as upstream sent it, per fixture:

```
id=1528885  2026-09-25  Poland v Bosnia & Herzegovina
    raw fixture.venue = {"id":0,"name":null,"city":null}
id=1528908  2026-09-28  Romania v Bosnia & Herzegovina
    raw fixture.venue = {"id":0,"name":null,"city":null}
id=1528929  2026-10-02  Bosnia & Herzegovina v Sweden
    raw fixture.venue = {"id":0,"name":null,"city":null}
id=1528948  2026-10-05  Bosnia & Herzegovina v Poland
    raw fixture.venue = {"id":0,"name":null,"city":null}
id=1528978  2026-11-14  Sweden v Bosnia & Herzegovina
    raw fixture.venue = {"id":0,"name":null,"city":null}
id=1528999  2026-11-17  Bosnia & Herzegovina v Romania
    raw fixture.venue = {"id":0,"name":null,"city":null}
```

The six ids match `data/internationals.json` one-for-one. The three home matches — 1528929, 1528948, 1528999 — are as empty as the three away ones.

This is not a truncation of the list endpoint. Fetching a single **home** match on its own returns the same emptiness, with the whole `fixture` block shown so nothing is hidden by a projection:

```
$ curl -s ... "https://v3.football.api-sports.io/fixtures?id=1528929"   # BiH v Sweden, home
{
  "id": 1528929, "referee": null, "timezone": "UTC",
  "date": "2026-10-02T18:45:00+00:00", "timestamp": 1790966700,
  "venue": { "id": 0, "name": null, "city": null },
  "status": { "long": "Not Started", "short": "NS", ... }
}
```

Upstream knows the kickoff to the minute and does not know the ground.

### 2. Control — the same endpoint, same key, does return venues

A club fixture drawn from `data/fixtures.json`, through the identical endpoint:

```
$ curl -s ... "https://v3.football.api-sports.io/fixtures?id=1529998"
raw fixture.venue = {"id":null,"name":"Stadion Novye Chimki","city":"Khimki"}
```

So the key, the endpoint and the request shape are all capable of returning a venue. What differs is the fixture, not our call. That is what rules out **(c)**.

### 3. The mapping is not discarding anything

`lib/fixture-record.ts:33` is the only place a stored venue is decided:

```ts
venue: raw.fixture.venue?.name ? { name: raw.fixture.venue.name } : null,
```

Reading that is not proof, so the **live payload above was fed through the real exported `trimFixtureRecord`** (probe run from a scratch directory; nothing written under `lib/`, `scripts/` or `data/`):

```
A) live internationals payload -> trimFixtureRecord:
   id=1528885  upstream venue={"id":0,"name":null,"city":null}  ->  mapped venue=null
   id=1528908  upstream venue={"id":0,"name":null,"city":null}  ->  mapped venue=null
   id=1528929  upstream venue={"id":0,"name":null,"city":null}  ->  mapped venue=null
   id=1528948  upstream venue={"id":0,"name":null,"city":null}  ->  mapped venue=null
   id=1528978  upstream venue={"id":0,"name":null,"city":null}  ->  mapped venue=null
   id=1528999  upstream venue={"id":0,"name":null,"city":null}  ->  mapped venue=null

B) same mapping, same records, venue.name forced to a real value:
   id=1528885  upstream venue.name="Bilino polje"  ->  mapped venue={"name":"Bilino polje"}
   id=1528908  upstream venue.name="Bilino polje"  ->  mapped venue={"name":"Bilino polje"}

C) live CLUB fixture payload -> trimFixtureRecord:
   id=1529998  upstream venue={"name":"Stadion Novye Chimki",...}  ->  mapped venue={"name":"Stadion Novye Chimki"}
```

(B) is the decisive line: the **same function**, on two of those **same six live records**, with only `venue.name` populated, carries the venue through. The mapping preserves every venue it is given. It is given none. That rules out **(b)**.

The downstream hop, `lib/assemble-schedule.ts:206`, is the same shape — `venue: raw.fixture.venue?.name ?? null` — and is equally not the cause.

---

## Severity

**`sev:3`** — wrong but survivable, and it is a **missing** field rather than a wrong one. Nobody is shown an incorrect ground; travelling fans are shown no ground. The date, kickoff and opponent all publish correctly, so the schedule is usable and merely incomplete. It is not `sev:2`: no flow is broken and nothing errors.

User impact: **unknown, no usage data** (see `pricaj#51` for the withdrawn figures). The rating rests on the reproducible facts above, not on a traffic claim.

**Area**: `area:internationals`.

---

## What this means for the ticket's four boxes

**Box 2 — which of (a)/(b)/(c) — is answered: (a).** The other three boxes are now unblocked, and their shape changes:

- **Box 1** ("a venue, where upstream supplies one, is carried through") is **already satisfied for the API-Football path** and needs no code change: (B) and (C) above show a supplied venue surviving the mapping, and `data/fixtures.json` carries real venue names on club fixtures today. There is no upstream venue being dropped anywhere. An engineer should not go looking for one.

- **Box 3** becomes the whole remaining question, and it is a **decision, not a defect**. Since upstream genuinely has nothing, the only way "Bilino polje, Zenica" reaches the site is a deliberate hand-entry. See the next section.

- **Box 4** ("a fixture with no venue still renders cleanly") is **currently satisfied trivially, and for the wrong reason** — see the finding below.

### Separate finding, worth an engineer's eye before anyone writes a venue anywhere

`venue` is carried through the data model and published in the JSON API (`app/api/schedule/route.ts` serialises `schedule.fixtures`, and `International.venue` is part of that shape), but **the rendered page never displays it**. `grep -rni "venue" app/` returns **0** matches across all twelve files in `app/`.

So a venue hand-entered today would appear in the JSON API and remain invisible on the page a fan actually reads. That is not what #33 was filed about, but it means "carry the venue through" and "a fan can see the venue" are two different pieces of work, and only the first exists in the code. Flagging, not specifying — the scope call is the founder's.

---

## What a deliberate hand-entry would require (NOT performed)

Stating this because box 3 asks for it. **No hand-entry has been made.** `data/hand-entered-internationals.json` is untouched and still reads `{"men": [], "women": []}`.

The sanctioned mechanism already exists — `lib/hand-entered-internationals.ts`, built under ADR-0004 — and it already enforces the provenance rule this ticket is worried about:

- an entry carries its own `source`, and the accepted value is `"NFSBiH"` (`lib/hand-entered-internationals.ts:281-294`);
- writing `"source": "API-Football"` in that file is **rejected outright** with the message that the file "holds Internationals a maintainer took from the federation's announcement, so name the Source that actually produced it";
- `fixtureSource()` (`lib/fixture-record.ts`) means every published fixture answers for itself, so a hand-entered venue can never inherit a site-wide API credit.

So a hand-entry would require, in order:
1. a founder decision that the federation's ticketing article is an acceptable source for a venue (ADR-0004 already accepts NFSBiH for *matches*; extending that to *venues on API-sourced matches* is the new part, because the venue would attach to a fixture API-Football supplied);
2. a recorded answer to the resulting provenance question — a single fixture would then have an API-Football body and an NFSBiH venue, which the current per-record `source` field **cannot express**, since it credits the whole record;
3. the ADR note box 3 asks for;
4. founder review, since it lands in `data/` under `.github/CODEOWNERS`.

Point 2 is the one that would otherwise get missed: today's provenance model is per-record, and a hand-entered venue on an upstream-supplied fixture is the first thing that does not fit it.

---

## Regression test that would catch it

`stage:build` gates on a test that fails before the fix. The honest version here, given the cause is upstream absence:

- There is **no failing test to write for (b) or (c)** — `lib/fixture-record.test.ts:36` already covers "stores a missing venue as null", and it passes.
- The test that matters is for whatever box 3 decides: if a venue is ever hand-entered, a test must assert that the resulting published fixture **does not** credit API-Football for it. `lib/assemble-schedule.test.ts:824` (`handEntry(..., { venue: "Bilino Polje" })`) is the existing hook for that shape.
- If box 4's render gap is taken up, the failing test is a render assertion: a fixture with a venue shows it, and a fixture without one shows no venue line and no placeholder text.

---

## Commands run, for anyone re-checking

```
git -C "/home/hoot/Apps/Bosnian Support Schedule" rev-parse --abbrev-ref HEAD   # master
git -C "/home/hoot/Apps/Bosnian Support Schedule" rev-list --count HEAD..origin/master   # 0
curl .../fixtures?team=1113&next=10        # 6 results, venue.name null on all six
curl .../fixtures?id=1528929               # home match, venue {id:0,name:null,city:null}
curl .../fixtures?id=1529998               # club control, venue name "Stadion Novye Chimki"
node --experimental-strip-types <scratch probe>   # trimFixtureRecord over the live payload
grep -rni "venue" app/ | wc -l             # 0
```

Three upstream calls total. Quota after: 7450 of 7500 remaining.

Nothing was written under `data/`, `scripts/` or `lib/`.
