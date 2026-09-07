"use client";

import { useEffect, useRef, useState } from "react";
import type { NationalTeamMember } from "@/lib/types";

/** The anchor an International's squad count links to. See `ScheduleFeed`. */
const ROSTER_HASH = "#roster";

/**
 * The gathered-at date, rendered identically for every reader.
 *
 * Kickoff times go through `useHydrated`, because a fan has to be in front of a
 * screen at a particular hour and an hour is exactly what a timezone shifts. This
 * date is coarser: it answers "how current is this list", where a calendar day
 * either way changes no one's judgement. So it is formatted from a fixed locale in
 * UTC, which reads the same on the server and in every browser.
 */
const gatheredOn = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function SquadColumn({
  title,
  members,
}: {
  title: string;
  members: NationalTeamMember[];
}) {
  if (members.length === 0) return null;

  return (
    <div className="min-w-[220px] flex-1">
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.04em] text-muted">
        {title} ({members.length})
      </h3>
      <ul>
        {members.map((member) => (
          <li
            key={member.id}
            className="flex min-h-[40px] items-center justify-between gap-3 border-t border-line text-[14px]"
          >
            <span className="text-fg">{member.name}</span>
            <span className="text-right text-muted">
              {member.club?.name ?? <span className="italic">no club resolved</span>}
              {member.clubOverridden && (
                <span
                  className="ml-1 text-gold-ink"
                  title="Set by manual override"
                  aria-label="Set by manual override"
                >
                  *
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Who we're tracking, behind one tap.
 *
 * Closed by default. Sixty-odd names is the longest thing on the page and almost
 * never what a fan came for — they came to find out when the next match is — so it
 * waits to be asked for instead of standing between the feed and the footer. The
 * one job it has to keep doing is answering an International's "26 players →"
 * link, which is why it opens itself when a fan arrives on that anchor.
 */
export function SquadList({
  members,
  generatedAt,
}: {
  members: NationalTeamMember[];
  /** When the Roster was gathered — not when the fixtures were fetched. */
  generatedAt: string;
}) {
  const [open, setOpen] = useState(false);
  const section = useRef<HTMLElement | null>(null);
  const realign = useRef(false);
  const byName = [...members].sort((a, b) => a.name.localeCompare(b.name));

  // Starts closed on the server and on the hydration pass either way, so the
  // markup agrees across it; the hash is read afterwards. Both on arrival and on
  // every later jump, because a fan who taps a second squad count has already read
  // and closed the list once.
  useEffect(() => {
    const openOnRoster = () => {
      if (window.location.hash !== ROSTER_HASH) return;
      realign.current = true;
      setOpen(true);
    };

    // `hashchange` covers arriving on the anchor and the back button, but not the
    // tap that matters most. A fan who opened the list from one International's
    // count, read it and closed it, then tapped another count is already on
    // `#roster` — so the browser fires nothing, and the link leads to a section
    // that is collapsed again. That is the same broken promise the realign below
    // exists to fix, arriving by a different route. The click is caught on the
    // document rather than wired through the feed so the count stays an ordinary
    // anchor, which is what makes it work before hydration and without JS.
    const openOnRosterLink = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a");
      if (link?.getAttribute("href") !== ROSTER_HASH) return;
      realign.current = true;
      setOpen(true);
    };

    openOnRoster();
    window.addEventListener("hashchange", openOnRoster);
    document.addEventListener("click", openOnRosterLink);
    return () => {
      window.removeEventListener("hashchange", openOnRoster);
      document.removeEventListener("click", openOnRosterLink);
    };
  }, []);

  // The panel is what makes room for itself. Closed, this section sits a couple of
  // hundred pixels from the end of the page, so the browser's own jump to `#roster`
  // hits the bottom of the document and stops short — measured at ~930px short on a
  // phone-height viewport, which is most of a screen of fixtures where the squad
  // list was promised. Re-aligning after the names have mounted, and only when the
  // jump is what opened the panel, is what makes the count link keep its word. The
  // section's `scroll-mt` is what clears the sticky header.
  useEffect(() => {
    if (!open || !realign.current) return;
    realign.current = false;
    section.current?.scrollIntoView();
  }, [open]);

  return (
    // `scroll-mt` clears the 64px sticky header, so a fan jumping here lands on the
    // toggle rather than underneath it.
    <section ref={section} id="roster" className="mt-3 scroll-mt-[72px] px-5 pt-5">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-controls="squad-panel"
        className="flex min-h-[52px] w-full items-center justify-between rounded-[12px] bg-surface px-4 py-3.5 text-[15px] font-bold text-fg"
      >
        <span>Squad list</span>
        <span className="text-[13px] font-semibold text-muted">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div id="squad-panel" className="mt-3.5">
          <p className="mb-4 text-[12px] leading-[1.6] text-muted">
            Gathered{" "}
            <time dateTime={generatedAt}>
              {gatheredOn.format(new Date(generatedAt))}
            </time>
            . It is whatever the source last published, so a player stays listed
            until a newer squad is named.
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-6">
            <SquadColumn
              title="Men’s"
              members={byName.filter((m) => m.squad === "men")}
            />
            <SquadColumn
              title="Women’s"
              members={byName.filter((m) => m.squad === "women")}
            />
          </div>
        </div>
      )}
    </section>
  );
}
