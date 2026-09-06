import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  announcementMarker,
  nationalTeamNews,
  parseFeedItems,
  unannouncedItems,
  type FeedItem,
} from "./nfsbih-feed.ts";

/**
 * A verbatim capture of https://www.nfsbih.ba/rss.feed, taken 2026-09-06. Thirteen
 * items: two men's youth, four domestic league (three women's, one men's), one
 * women's youth, one futsal, one senior men's National Team ("Hvala ti, Edine" —
 * Džeko's retirement) and one uncategorised root item about ticketing for upcoming
 * National Team matches.
 *
 * The capture carries no senior women's item — the women's team had no news that
 * week — so that path is exercised with a built item below, using the real category
 * path `vijesti/nogomet-z/a-reprezentacija-z/`, verified live against the
 * federation's own category page (titled `"A" reprezentacija (Ž)`).
 */
const SAMPLE = readFileSync(new URL("./nfsbih-feed.sample.xml", import.meta.url), "utf8");

const feed = (...items: string[]) => `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
<title>Nogometni/Fudbalski savez Bosne i Hercegovine</title>
<link>https://www.nfsbih.ba/2022wu17/</link>
${items.join("\n")}
</channel></rss>`;

const item = (link: string, title = "Neka vijest") =>
  `<item>
<title>${title}</title>
<link>${link}</link>
<guid isPermaLink="true">${link}</guid>
<description><![CDATA[<div class="feed-description"><p>Tekst vijesti.</p></div>]]></description>
<pubDate>Thu, 03 Sep 2026 13:02:26 +0200</pubDate>
</item>`;

const article = (path: string) => `https://www.nfsbih.ba/${path}`;

const links = (items: FeedItem[]) => items.map((i) => i.link);

describe("parseFeedItems", () => {
  it("extracts every item in the captured feed", () => {
    assert.equal(parseFeedItems(SAMPLE).length, 13);
  });

  it("extracts an item's title, link, guid and publication date", () => {
    const dzeko = parseFeedItems(SAMPLE).find((i) => i.link.endsWith("hvala-ti-edine/"));

    assert.deepEqual(dzeko, {
      title: "Hvala ti, Edine!",
      link: article("vijesti/nogomet-m/a-reprezentacija-m/hvala-ti-edine/"),
      guid: article("vijesti/nogomet-m/a-reprezentacija-m/hvala-ti-edine/"),
      publishedAt: "Thu, 03 Sep 2026 13:02:26 +0200",
      categories: ["Izdvojen", '"A" reprezentacija (M)', "Nogomet (M)", "Vijesti"],
    });
  });

  it("keeps Bosnian diacritics intact", () => {
    const titles = parseFeedItems(SAMPLE).map((i) => i.title);
    assert.ok(titles.includes("Treće kolo Premijer ženske lige BiH"));
  });

  it("decodes XML entities in a title", () => {
    const [only] = parseFeedItems(feed(item(article("vijesti/x/"), "Bosna &amp; Hercegovina")));
    assert.equal(only.title, "Bosna & Hercegovina");
  });

  it("ignores the channel's own link", () => {
    for (const parsed of parseFeedItems(SAMPLE)) {
      assert.notEqual(parsed.link, article("2022wu17/"));
    }
  });

  it("yields no items for an empty document", () => {
    assert.deepEqual(parseFeedItems(""), []);
  });

  it("yields no items for a document that is not a feed", () => {
    assert.deepEqual(parseFeedItems("<html><body>503 Service Unavailable</body></html>"), []);
  });

  it("yields no items rather than throwing on a truncated document", () => {
    assert.deepEqual(parseFeedItems(SAMPLE.slice(0, 400)), []);
  });

  it("skips an item with no link rather than throwing", () => {
    const broken = feed("<item><title>Bez linka</title></item>", item(article("vijesti/x/")));
    assert.deepEqual(links(parseFeedItems(broken)), [article("vijesti/x/")]);
  });
});

describe("nationalTeamNews", () => {
  it("keeps the senior men's National Team item", () => {
    assert.deepEqual(links(nationalTeamNews(SAMPLE)).sort(), [
      article("vijesti/informacija-za-navijace-u-vezi-sa-predstojecim-utakmicama-reprezentacije-bih/"),
      article("vijesti/nogomet-m/a-reprezentacija-m/hvala-ti-edine/"),
    ]);
  });

  it("labels the senior men's squad", () => {
    const kept = nationalTeamNews(SAMPLE).find((i) => i.link.includes("a-reprezentacija-m"));
    assert.equal(kept?.squad, "men");
  });

  it("keeps the senior women's National Team item", () => {
    const kept = nationalTeamNews(
      feed(item(article("vijesti/nogomet-z/a-reprezentacija-z/zmajice-remizirale-sa-estonijom/"))),
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0].squad, "women");
  });

  it("rejects youth items", () => {
    const rejected = feed(
      item(article("vijesti/nogomet-m/omladinske-selekcije-m/jos-jedan-trijumf/")),
      item(article("vijesti/nogomet-z/omladinske-selekcije-z/zenska-u-17-reprezentacija-na-kampu/")),
    );
    assert.deepEqual(nationalTeamNews(rejected), []);
  });

  it("rejects domestic league items", () => {
    const rejected = feed(
      item(article("vijesti/nogomet-m/wwin-liga-bih/wwin-liga-bosne-i-hercegovine-2026-31/")),
      item(article("vijesti/nogomet-z/premijer-liga-bih-z/trece-kolo-premijer-zenske-lige-bih-2/")),
    );
    assert.deepEqual(nationalTeamNews(rejected), []);
  });

  it("rejects futsal items", () => {
    const rejected = feed(item(article("vijesti/futsal/mnk-bubamara-se-plasirala-u-glavnu-rundu/")));
    assert.deepEqual(nationalTeamNews(rejected), []);
  });

  it("keeps an uncategorised item whose prose names the senior National Team", () => {
    const kept = nationalTeamNews(
      feed(
        item(
          article("vijesti/informacija-za-navijace-u-vezi-sa-predstojecim-utakmicama-reprezentacije-bih/"),
          "Informacija za navijače u vezi sa predstojećim utakmicama reprezentacije BiH",
        ),
      ),
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0].squad, null);
  });

  it("rejects an uncategorised item whose prose names a youth selection", () => {
    const rejected = feed(
      item(
        article("vijesti/u-17-reprezentacija-bih-otputovala-na-turnir/"),
        "U-17 reprezentacija BiH otputovala na turnir",
      ),
    );
    assert.deepEqual(nationalTeamNews(rejected), []);
  });

  it("keeps an item under a category it does not recognise when the prose names the National Team", () => {
    // A renamed or added category must not quietly end the notifications.
    const kept = nationalTeamNews(
      feed(
        item(
          article("vijesti/nogomet-m/nova-kategorija/reprezentacija-bih-objavila-spisak/"),
          "Reprezentacija BiH objavila spisak",
        ),
      ),
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0].squad, null);
  });

  it("rejects an unrecognised category whose prose names an age group", () => {
    const rejected = feed(
      item(article("vijesti/nogomet-m/nova-kategorija/u-19-spisak/"), "U-19 reprezentacija BiH"),
    );
    assert.deepEqual(nationalTeamNews(rejected), []);
  });

  it("does not read the Bosnian preposition 'u' before a number as an age group", () => {
    const kept = nationalTeamNews(
      feed(
        item(
          article("vijesti/reprezentacija-slavila-golom-u-21-minuti/"),
          "Reprezentacija BiH slavila golom u 21. minuti",
        ),
      ),
    );
    assert.equal(kept.length, 1);
  });

  it("rejects an uncategorised item that names no National Team at all", () => {
    const rejected = feed(
      item(article("vijesti/aplikacija-tribina-sada-dostupna/"), "Aplikacija „Tribina“ sada dostupna"),
    );
    assert.deepEqual(nationalTeamNews(rejected), []);
  });

  it("yields no items for a malformed document", () => {
    assert.deepEqual(nationalTeamNews("<rss><channel>"), []);
  });
});

describe("unannouncedItems", () => {
  const dzeko = { link: article("vijesti/nogomet-m/a-reprezentacija-m/hvala-ti-edine/") } as FeedItem;
  const tickets = { link: article("vijesti/informacija-za-navijace/") } as FeedItem;

  it("returns every item when nothing has been announced", () => {
    assert.deepEqual(links(unannouncedItems([dzeko, tickets], [])), [dzeko.link, tickets.link]);
  });

  it("drops an item whose marker is already in an existing issue", () => {
    const existing = [`Federation news.\n\n${announcementMarker(dzeko)}\n`];
    assert.deepEqual(links(unannouncedItems([dzeko, tickets], existing)), [tickets.link]);
  });

  it("drops an item the same run already selected, so one feed yields one issue", () => {
    assert.equal(unannouncedItems([dzeko, dzeko], []).length, 1);
  });

  it("is not fooled by an issue that merely mentions the article's URL in prose", () => {
    // A maintainer pasting the link into an unrelated issue must not suppress the
    // announcement; only the marker this script writes counts as "already announced".
    assert.equal(unannouncedItems([dzeko], [`See ${dzeko.link} for details.`]).length, 1);
  });

  it("is not fooled by the marker of a longer URL beginning with this one", () => {
    const deeper = { link: `${dzeko.link}dodatak/` } as FeedItem;
    assert.equal(unannouncedItems([dzeko], [announcementMarker(deeper)]).length, 1);
  });
});
