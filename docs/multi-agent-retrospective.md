# Running more than one agent on one repo

A record of what actually went wrong while several Claude Code sessions worked this
repository at the same time, against a GitHub tracker holding one spec split into
fourteen tickets. Everything below happened here, between 5 and 7 September 2026,
and is cited to the artefact that shows it.

It is not an argument against running agents in parallel. Most of the work landed.
It is a list of the specific ways parallelism went wrong, because each one cost
real time to notice and every one of them was silent.

## 1. One working directory, several writers

The sharpest problem, and the one that produced every other problem in this list.

Two sessions were editing the same checkout. The second session's work arrived
first as untracked files (`lib/chatter.ts`, `lib/moments.ts`,
`lib/player-identity.ts`, `scripts/refresh-moments.mts`, `data/players.json`,
`docs/adr/0005-*.md`), then later as edits to **tracked** files already in the tree
— `README.md`, `package.json`, `.gitignore`, `.env.example`, `data/README.md`.

Three concrete failures came out of that:

- **`git stash push -u` swept the other session's files away.** It was run to
  compare lint output against a clean `master`. It worked, and the files came back
  on `stash pop` — but for the duration, another agent's uncommitted work was
  sitting in a stash it did not know about.
- **`git checkout master` aborted** partway through the session, because tracked
  files had been modified by someone else since the last look. A branch got created
  from the wrong base as a result.
- **`git add -A` would have committed another session's work under this session's
  commit message.** It was never run, but only because the tree was inspected
  first.

**What worked:** stage explicitly, always — `git add <path> <path>`, never `-A` or
`.`. And for anything needing a different branch, use `git worktree add` rather
than switching the shared checkout. This document was written in a worktree for
exactly that reason.

## 2. Verification signals quietly stop being true

`npm test` reported **211** tests, then **239**, then **251**, inside a single
session — with no test added by that session.

The script globs `lib/*.test.ts`. The other session was adding test files to
`lib/`. So the number moved for reasons entirely unrelated to the change under
test, and a commit message claiming "239 tests pass" would have been both true and
worthless.

It was caught only by stashing and re-running against a clean tree. Nothing in the
output hinted that the suite had grown.

**What worked:** verify against artefacts that belong to the change — the
prerendered HTML for a rendering fix, the built route list for a favicon fix —
rather than against a global count that anyone can move.

## 3. The tracker moves under you too

- Issues **#17** and **#18** appeared mid-session, auto-filed by this repo's own
  federation RSS watcher (`.github/workflows/watch-federation-feed.yml`). Nobody
  typed them. An agent that had built a picture of "what is open" at the start of a
  session was working from a stale one an hour later.
- A review sub-agent cited "#17" in its findings **before #17 existed** — it had
  extrapolated a number from context. The reference was caught, but only because it
  was checked.
- GitHub shares one number space between issues and pull requests, so a bare `#16`
  is not self-describing. In this repo #16 and #19 are PRs; #17 and #18 are issues.

**What worked:** resolve every number at the moment you use it, and re-query the
tracker rather than trusting a picture built earlier in the session.

## 4. Finished work that still looks available

Issue **#1** held the entire spec. Its fourteen tickets (#2–#15) were all closed
and shipped. #1 stayed **open**, still labelled `ready-for-agent`.

The cause: the tickets were created as flat issues rather than GitHub sub-issues,
so nothing linked them back to the parent and nothing closed it. Its
`sub_issues_summary` read `{completed: 0, total: 0}` — GitHub did not think it had
children at all.

An agent querying for agent-ready work would have picked up #1 and rebuilt a
feature that already existed. The label meant to route work had become a trap.

**What worked:** close the parent explicitly, with a comment listing the children
that satisfied it. Better: create tickets as real sub-issues so the tracker can
answer "is this done" itself.

## 5. The ticket-as-spec loop

The most expensive pattern here, because it burns work rather than time.

1. A Spec-axis review found the countdown banner was never actually pinned.
2. That became issue **#12**, and was fixed. The banner became `sticky`.
3. A later redesign removed the stickiness **on purpose** — a third sticky layer
   costs half a phone viewport.
4. The next review, reading #12 as the spec, flags the identical symptom again.

Left alone, an agent picks that up and re-adds the sticky, and the loop closes.
Reopening #12 would have fed it directly.

**What worked:** leave the superseded tickets closed, and move the design intent
into the repository — the code and the README — where a review will actually meet
it. A review compares against the standard it can see. If that standard lives in a
closed ticket, it will keep re-deriving decisions that were already made.

## 6. Two review axes produce two different kinds of finding

A two-axis review (Standards, Spec) of one PR returned 18 findings. Sorting them by
axis turned out to matter more than sorting them by severity:

- **Spec-axis findings were mostly real defects.** A stale-data warning that never
  reached one of the two squads; a link that led to a collapsed section on the
  second tap; a squad name that existed only in `aria-label`.
- **Standards-axis findings were mostly documentation that had fallen behind.** The
  `--gold` token claimed it was used for "the next-match card, and nothing else",
  while notices deliberately outlined in it — but the code was right and the
  comment was over-absolute. The fix was to the comment.

Treating the second group as defects would have meant reverting deliberate design
decisions to satisfy stale docs — another version of the loop in §5.

**What worked:** decide what kind of thing a finding *is* before fixing it. "The
code is wrong", "the doc is stale", and "this is a decision, not a defect" need
different actions, and only the first is a code change.

## 7. Sub-agents do not always report accurately

Both review sub-agents produced good work, and both contained an error that would
have propagated if taken at face value: one invented issue #17, the other reported
a test count (211) that was correct for `master` but not for the branch it was
reviewing. Neither error was flagged as uncertain.

**What worked:** verify sub-agent claims that carry a number or an identifier
before repeating them.

## What it cost

Measured from the session transcripts in
`~/.claude/projects/<project>/*.jsonl`, priced at published Anthropic API rates
(Opus 5 at $5/$25 per million input/output tokens, Sonnet 5 at $2/$10, cache writes
at 1.25× input, cache reads at 0.1×).

| Session | Cost | Window |
| --- | --- | --- |
| `cd26dfbf` | $132.63 | 6 Sep 01:48 → 17:06 |
| `0dd56490` | $95.41 | 5 Sep 14:50 → 16:21 |
| `6fcfd8d4` | $51.70 | 6 Sep 18:02 → 18:27 |
| `d380dc06` | $33.42 | 7 Sep 01:08 → 14:10 |
| `94914584` | $16.59 | 7 Sep 00:06 → 01:01 |
| `54a1e625` | $14.38 | 7 Sep 01:14 → 01:31 |
| `d3b1dae2` | $9.67 | 5 Sep 16:27 → 6 Sep 00:15 |
| `78274bb0` | $6.38 | 6 Sep 17:10 → 17:15 |
| `b1995d05` | $1.16 | 5 Sep 16:22 → 16:26 |
| **Total** | **$364.03** | 5–7 Sep 2026 |

Aggregate across all sessions: **2.5M output tokens, 14.1M cache writes, 424M cache
reads.** Cache reads dominate the bill — 424 million of them at $0.50/M is about
$212, roughly 60% of the total. Long sessions re-read their own context on every
turn, and that, not generation, is where the money goes.

Three caveats. These are **API list-price equivalents**: a Claude subscription does
not bill per token, so on a subscription this is a measure of consumption, not a
charge. The cache figures assume the 5-minute TTL multiplier; 1-hour cache writes
cost 2× input rather than 1.25×.

And the table is a **snapshot, not a total** — measured at 7 Sep 14:10. It was
already wrong when it was first written: `d380dc06` was $24.44 at the moment the
figure was typed and $33.42 an hour later, because the session writing this
retrospective is one of the sessions it is measuring. That is not a flaw in the
method so much as the point of §2 arriving again — a number that was true when you
read it is not the same as a number that is true.

The relevant comparison for parallelism is `94914584` ($16.59), `54a1e625` ($14.38)
and `d380dc06` ($33.42) — three sessions overlapping across roughly two hours on 7
September. Running them concurrently cost about $64. The collisions documented
above are what that bought alongside the work.

## The short version

Parallel agents are cheap to start and expensive to reconcile. Almost every problem
here was **silent** — no error, no warning, just a number that had quietly stopped
meaning what it meant an hour ago. The mitigations that worked are all the same
shape: **isolate what you can** (worktrees, explicit staging), and **re-derive what
you cannot** (tracker state, test baselines, sub-agent claims) instead of trusting a
picture built earlier in the session.
