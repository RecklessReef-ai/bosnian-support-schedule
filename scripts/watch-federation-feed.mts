/**
 * Reads NFSBiH's public RSS feed and opens a GitHub issue for each new senior
 * National Team item.
 *
 * The upstream API does not carry everything the federation announces. Edin Džeko's
 * retirement was on nfsbih.ba days before it was anywhere else, and an announced
 * International can sit on the federation's own site for weeks before the API has it.
 * So the daily run watches the feed and puts a human in the loop: the issue notifies
 * a maintainer and waits until it has been dealt with, which usually means
 * hand-entering an International.
 *
 * **Nothing here derives Fixture details.** The feed is prose — see the note at the
 * top of `lib/nfsbih-feed.ts` and ADR-0004. This script reports that an article
 * exists and links to it. It never claims to know when anyone is playing.
 *
 *   npm run watch:feed              # dry run unless GITHUB_TOKEN is set
 *   npm run watch:feed -- --dry-run # never writes, whatever the environment
 */
import {
  announcementMarker,
  nationalTeamNews,
  unannouncedItems,
  type NationalTeamItem,
} from "../lib/nfsbih-feed.ts";
import type { Squad } from "../lib/types.ts";

const FEED_URL = "https://www.nfsbih.ba/rss.feed";

/**
 * Every issue this script opens carries this label, and deduplication reads the
 * label back. See `announcementMarker` for why the issues are the state rather than
 * a committed file.
 */
const LABEL = "federation-news";
const LABEL_COLOUR = "1f6f5c";
const LABEL_DESCRIPTION = "National Team news from NFSBiH's RSS feed, for a maintainer to act on";

const API = "https://api.github.com";
const REPOSITORY = process.env.GITHUB_REPOSITORY ?? "RecklessReef-ai/bosnian-support-schedule";
const TOKEN = process.env.GITHUB_TOKEN ?? "";

// A dry run reports what it would open and writes nothing. It is the default without
// a token so that running this locally can never surprise anyone with a real issue.
const dryRun = process.argv.includes("--dry-run") || !TOKEN;

async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${TOKEN}`,
      "x-github-api-version": "2022-11-28",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub ${init.method ?? "GET"} ${path} -> ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

/**
 * The bodies of every issue this script has already opened, closed ones included —
 * a closed issue has been dealt with, and must not reappear the next morning.
 *
 * This is the issues REST endpoint rather than the search API on purpose. Search is
 * an index and lags by seconds to minutes, so re-running the workflow straight after
 * a failure could open the same issue twice; listing by label reads the issues
 * themselves and is correct immediately.
 */
async function announcedBodies(): Promise<string[]> {
  const bodies: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const issues = await github<{ body: string | null; pull_request?: unknown }[]>(
      `/repos/${REPOSITORY}/issues?labels=${LABEL}&state=all&per_page=100&page=${page}`,
    );
    // The issues endpoint returns pull requests too; they are never ours.
    for (const issue of issues) {
      if (!issue.pull_request) bodies.push(issue.body ?? "");
    }
    if (issues.length < 100) break;
  }
  return bodies;
}

/** Creates the label on first use, so a fresh clone of the repo needs no setup. */
async function ensureLabel(): Promise<void> {
  try {
    await github(`/repos/${REPOSITORY}/labels/${LABEL}`);
  } catch {
    await github(`/repos/${REPOSITORY}/labels`, {
      method: "POST",
      body: JSON.stringify({ name: LABEL, color: LABEL_COLOUR, description: LABEL_DESCRIPTION }),
    });
    console.log(`Created the "${LABEL}" label.`);
  }
}

const SQUAD_LABEL: Record<Squad, string> = {
  men: "men's National Team",
  women: "women's National Team",
};

function issueTitle(item: NationalTeamItem): string {
  const squad = item.squad ? SQUAD_LABEL[item.squad] : "National Team";
  return `NFSBiH (${squad}): ${item.title}`;
}

function issueBody(item: NationalTeamItem): string {
  const squad = item.squad ? SQUAD_LABEL[item.squad] : "not stated by the feed";

  return [
    `The federation published this. It may be a retirement, a call-up, or an announced`,
    `International the upstream API does not carry yet.`,
    ``,
    `**${item.title}**`,
    ``,
    `- Article: ${item.link}`,
    `- Published: ${item.publishedAt || "not stated by the feed"}`,
    `- Squad: ${squad}`,
    item.categories.length ? `- Feed categories: ${item.categories.join(", ")}` : null,
    ``,
    `Read it and decide. If it announces a match, hand-enter the International with its`,
    `Source recorded; otherwise close this.`,
    ``,
    `The feed carries prose, never structured Fixtures, so no match details were read`,
    `from it — see ADR-0004.`,
    ``,
    announcementMarker(item),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function main() {
  const response = await fetch(FEED_URL, { headers: { accept: "application/rss+xml" } });
  if (!response.ok) {
    throw new Error(`${FEED_URL} -> ${response.status} ${response.statusText}`);
  }

  const news = nationalTeamNews(await response.text());
  console.log(`${news.length} senior National Team item(s) in the feed.`);

  // Without a token the already-announced issues cannot be read, so a dry run in that
  // state reports everything as new. Say so rather than implying it is all fresh.
  if (!TOKEN) {
    console.log("GITHUB_TOKEN is not set: dry run, and no deduplication against existing issues.");
  }
  const fresh = unannouncedItems(news, TOKEN ? await announcedBodies() : []);

  if (!fresh.length) {
    console.log("Nothing new to announce.");
    return;
  }

  if (!dryRun) await ensureLabel();

  for (const item of fresh) {
    if (dryRun) {
      console.log(`\n--- would open ---\n${issueTitle(item)}\n\n${issueBody(item)}`);
      continue;
    }
    const issue = await github<{ number: number }>(`/repos/${REPOSITORY}/issues`, {
      method: "POST",
      body: JSON.stringify({ title: issueTitle(item), body: issueBody(item), labels: [LABEL] }),
    });
    console.log(`Opened #${issue.number}: ${item.title}`);
  }

  console.log(`\n${dryRun ? "Would open" : "Opened"} ${fresh.length} issue(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
