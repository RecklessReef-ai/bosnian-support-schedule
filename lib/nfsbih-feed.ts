import type { Squad } from "./types.ts";

/**
 * NFSBiH's public RSS feed, read as a **monitoring trigger and nothing else**.
 *
 * The federation publishes retirements, call-ups and announced matches days before
 * the upstream API carries them, so the daily run watches the feed and opens a
 * GitHub issue when senior National Team news appears. A maintainer then decides
 * what to do — most often hand-entering an International.
 *
 * **This feed must never be parsed to derive Fixture details.** It yields prose:
 * a headline, a paragraph of Bosnian, a photograph. There is no structured kickoff,
 * no opponent, no venue, and inferring them from a sentence would publish guesses as
 * facts. Everything here stops at "something happened, go and look". See ADR-0004.
 *
 * Parsing is separated from fetching so it can be tested offline against
 * `nfsbih-feed.sample.xml`, a verbatim capture of the live feed.
 */

/** One article in the feed. Prose only — deliberately carries no match details. */
export interface FeedItem {
  title: string;
  /** The article URL. Doubles as the item's identity, since Joomla's guid is the link. */
  link: string;
  guid: string;
  /** The feed's own RFC-822 string, kept verbatim rather than reinterpreted. */
  publishedAt: string;
  /** The item's `<category>` labels, in feed order. Human-readable Bosnian. */
  categories: string[];
}

/** A kept item, labelled with the squad it concerns where the feed says which. */
export interface NationalTeamItem extends FeedItem {
  /** `null` for an item that names the National Team without saying which squad. */
  squad: Squad | null;
}

const ITEM = /<item\b[^>]*>([\s\S]*?)<\/item>/g;

const CDATA = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1]?.toLowerCase() === "x"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** First `<tag>` inside one item's markup, CDATA unwrapped and entities decoded. */
function tag(itemXml: string, name: string): string | null {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(itemXml);
  if (!match) return null;
  const raw = match[1];
  const cdata = CDATA.exec(raw);
  return (cdata ? cdata[1] : decode(raw)).trim();
}

function tags(itemXml: string, name: string): string[] {
  const found: string[] = [];
  for (const match of itemXml.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "g"))) {
    const cdata = CDATA.exec(match[1]);
    found.push((cdata ? cdata[1] : decode(match[1])).trim());
  }
  return found;
}

/**
 * Reads the items out of an RSS document. Pure: XML string in, items out.
 *
 * Written without an XML library because the repo deliberately has no dependencies,
 * and because the shape needed here is narrow — Joomla emits one flat `<item>` block
 * per article. Anything that is not a recognisable item is skipped rather than
 * raised: the feed is a nice-to-have, and a bad response from the federation's server
 * must never fail the daily refresh that keeps the Schedule current.
 */
export function parseFeedItems(xml: string): FeedItem[] {
  if (!xml.includes("<item")) return [];

  const items: FeedItem[] = [];
  for (const match of xml.matchAll(ITEM)) {
    const body = match[1];
    const link = tag(body, "link");
    const title = tag(body, "title");
    // An item with no link cannot be linked to from an issue, and cannot be
    // deduplicated either, so it is of no use to a maintainer.
    if (!link || !title) continue;

    items.push({
      title,
      link,
      guid: tag(body, "guid") ?? link,
      publishedAt: tag(body, "pubDate") ?? "",
      categories: tags(body, "category"),
    });
  }
  return items;
}

/**
 * The category path segments the federation files senior National Team news under,
 * mapped to the squad each one belongs to. Taken from the article URL rather than
 * the `<category>` labels because the slug is stable ASCII, while the label is
 * display text — `"A" reprezentacija (M)` — whose quoting and diacritics could be
 * retyped at any time without the site noticing.
 */
const SENIOR_PATHS: Record<string, Squad> = {
  "a-reprezentacija-m": "men",
  "a-reprezentacija-z": "women",
};

/**
 * Everything else the feed files news under: youth selections, the domestic leagues
 * and futsal. Listed explicitly so an unrecognised new category falls through to the
 * prose check below and gets looked at, rather than being silently dropped.
 */
const REJECTED_PATHS = [
  "omladinske-selekcije-m",
  "omladinske-selekcije-z",
  "wwin-liga-bih",
  "premijer-liga-bih-z",
  "kup-bih",
  "futsal",
];

/** Bosnian for "the national team", in any of its declined forms. */
const NATIONAL_TEAM_PROSE = /reprezentacij/i;

/**
 * Words that mean the prose is about some other selection wearing the same name:
 * an age group, futsal, or a regional association's side.
 *
 * The age groups are matched as `U-17` / `U17` rather than allowing a space, so that
 * the ordinary Bosnian preposition — "u 21. minuti" — is not read as an age group.
 */
const NOT_SENIOR_PROSE = /\bu-?(15|16|17|19|20|21|23)\b|omladinsk|kadetsk|juniorsk|futsal|kanton/i;

function segmentsOf(link: string): string[] {
  try {
    return new URL(link).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Decides whether an item is senior National Team news worth waking a maintainer for,
 * and which squad it concerns. `undefined` means "not National Team news"; `null`
 * means it is, but the feed does not say which squad.
 *
 * Most items say which category they belong to in their URL path, and those are
 * decided by the path alone. Two kinds of item are not: ones that sit at the root
 * (`vijesti/<slug>/`, with no category segment at all) and ones filed under a
 * category the federation has added since this was written. Neither is dropped
 * silently — the capture this was written against had exactly one root item, about
 * ticketing for the National Team's upcoming matches, which is precisely what a
 * maintainer wants to see, and a renamed category must not quietly end the
 * notifications. For both, the title is read instead: it must name the national team
 * and must not name an age group, futsal or a regional association's side.
 *
 * The prose check errs towards a false positive, which is the right direction to err.
 * A spurious issue costs a maintainer one click; a missed retirement costs the
 * Schedule its accuracy.
 */
function classify(item: FeedItem): Squad | null | undefined {
  for (const segment of segmentsOf(item.link)) {
    if (segment in SENIOR_PATHS) return SENIOR_PATHS[segment];
    if (REJECTED_PATHS.includes(segment)) return undefined;
  }

  if (!NATIONAL_TEAM_PROSE.test(item.title)) return undefined;
  if (NOT_SENIOR_PROSE.test(item.title)) return undefined;
  return null;
}

/**
 * The senior National Team items in a feed document — the only ones worth an issue.
 *
 * Youth, domestic league and futsal items are rejected: they publish daily, and a
 * maintainer notified daily stops reading the notifications.
 */
export function nationalTeamNews(xml: string): NationalTeamItem[] {
  const kept: NationalTeamItem[] = [];
  for (const item of parseFeedItems(xml)) {
    const squad = classify(item);
    if (squad === undefined) continue;
    kept.push({ ...item, squad });
  }
  return kept;
}

/**
 * The line written into an issue body that identifies which article it announces.
 *
 * Deduplication reads these back rather than a committed state file. A state file
 * would have to be committed and pushed by the workflow, which would race the
 * fixtures refresh that pushes to the same branch, and would drift out of step with
 * reality the moment an issue was opened by hand or the push failed. The issues
 * themselves are the record of what has been announced, so they are what gets asked.
 *
 * The delimiters matter: a bare URL would also match an issue that merely mentions
 * the article, and would match any longer URL that begins with it.
 */
export function announcementMarker(item: Pick<FeedItem, "link">): string {
  return `<!-- nfsbih-item: ${item.link} -->`;
}

/**
 * The items not already announced by an existing issue.
 *
 * `existingBodies` are the bodies of every issue previously opened by this script —
 * open **and** closed, because a closed issue has been dealt with and must not come
 * back the next morning. Items repeated within one document are collapsed too, so a
 * single run opens one issue per article however the feed lists it.
 */
export function unannouncedItems<T extends FeedItem>(items: T[], existingBodies: string[]): T[] {
  const announced = new Set<string>();
  for (const body of existingBodies) {
    for (const match of body.matchAll(/<!-- nfsbih-item: (\S+) -->/g)) {
      announced.add(match[1]);
    }
  }

  const fresh: T[] = [];
  for (const item of items) {
    if (announced.has(item.link)) continue;
    announced.add(item.link);
    fresh.push(item);
  }
  return fresh;
}
