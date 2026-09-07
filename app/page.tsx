import { getSchedule } from "@/lib/schedule";
import type { Fixture, International } from "@/lib/types";
import { Crest } from "./crest";
import { NextMatch } from "./next-match";
import { ScheduleFeed } from "./schedule-feed";
import { SquadList } from "./squad-list";
import { TimezoneNote } from "./kickoff-time";

export const revalidate = 3600;

const isInternational = (fixture: Fixture): fixture is International =>
  fixture.kind === "international";

export default async function Home() {
  const {
    fixtures,
    members,
    rosterGeneratedAt,
    degraded,
    unavailableClubs,
    squadInternationals,
  } = await getSchedule();

  return (
    // A single 640px column, centred, with a 20px gutter — the same page on a
    // phone and on a desktop, because a fan checking a kickoff on the train and a
    // fan checking it at a desk want the identical one-column list.
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col bg-app">
      {/* 64px exactly, and the filter pills in `ScheduleFeed` pin themselves to
          that number. Opaque, so a fixture scrolling under it disappears behind an
          edge rather than showing through. */}
      <header className="sticky top-0 z-[5] flex h-16 items-center gap-2.5 border-b border-line bg-app px-5">
        <Crest />
        <span className="text-[17px] font-bold text-fg">Support Schedule</span>
      </header>

      <div className="px-5 pb-1 pt-5">
        <h1 className="text-[20px] font-bold text-fg">Hajmo, Bosno.</h1>
        <p className="mt-1 text-[14px] leading-[1.5] text-subtle">
          Every match our players are in, one list.
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2 pt-2">
          <TimezoneNote />
          <a href="/api/schedule" className="text-[12px] font-semibold">
            JSON API
          </a>
        </div>
      </div>

      <NextMatch
        // Only the Internationals are handed over — the card has no use for the
        // rest of the feed, and sending it twice would double the page's payload.
        internationals={fixtures.filter(isInternational)}
        states={squadInternationals}
      />

      {/* Directly above the feed, because what they explain is a gap in it. Gold as
          an outline rather than a fill: the next-match card is the one thing on the
          page allowed to be solid gold, and a notice must not outshout it. */}
      {degraded && (
        <p className="mx-5 mt-4 rounded-[12px] border border-gold/35 bg-surface p-4 text-[13px] leading-relaxed text-gold-ink">
          No fixtures are stored yet, so only the squads are shown. Run{" "}
          <code className="font-semibold">npm run refresh:fixtures</code> to
          fetch them.
        </p>
      )}

      {unavailableClubs.length > 0 && (
        <p className="mx-5 mt-4 rounded-[12px] border border-gold/35 bg-surface p-4 text-[13px] leading-relaxed text-gold-ink">
          Fixtures for {unavailableClubs.map((club) => club.name).join(", ")}{" "}
          couldn&apos;t be loaded, so matches for players at{" "}
          {unavailableClubs.length === 1 ? "that club" : "those clubs"} are
          missing below. This usually clears on the next refresh.
        </p>
      )}

      <ScheduleFeed fixtures={fixtures} />

      <SquadList members={members} generatedAt={rosterGeneratedAt} />

      <footer className="px-5 pb-9 pt-4">
        <p className="text-[12px] leading-[1.6] text-muted">
          Built by{" "}
          <a href="https://pricaj.vercel.app" className="font-semibold">
            Pričaj
          </a>{" "}
          — speaking practice for Croatian, Bosnian and Serbian.
        </p>
        <p className="mt-1 text-[12px] leading-[1.6] text-muted">
          Fixture and squad data via API-Football, except where a match names its
          own source. Not affiliated with NFSBiH.
        </p>
      </footer>
    </main>
  );
}
