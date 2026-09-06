import type { NationalTeamMember } from "@/lib/types";

/**
 * The gathered-at date, rendered identically for every reader.
 *
 * Kickoff times go through a client component and `useHydrated`, because a fan has
 * to be in front of a screen at a particular hour and an hour is exactly what a
 * timezone shifts. This date is coarser: it answers "how current is this list",
 * where a calendar day either way changes no one's judgement. So it is formatted
 * from a fixed locale in UTC, which reads the same on the server and in every
 * browser — no hydration mismatch to guard against, and no flash of one date
 * turning into another once the client takes over.
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
    <div className="flex-1 min-w-[16rem]">
      <h3 className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-honey-text">
        {title}{" "}
        <span className="font-normal text-faint">({members.length})</span>
      </h3>
      <ul className="flex flex-col gap-1">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-[13.5px]"
          >
            <span className="text-fg">{member.name}</span>
            <span className="text-right text-[12.5px] text-muted">
              {member.club?.name ?? (
                <span className="text-faint italic">no club resolved</span>
              )}
              {member.clubOverridden && (
                <span
                  className="ml-1 text-coral-text"
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

export function SquadList({
  members,
  generatedAt,
}: {
  members: NationalTeamMember[];
  /** When the Roster was gathered — not when the fixtures were fetched. */
  generatedAt: string;
}) {
  const byName = [...members].sort((a, b) => a.name.localeCompare(b.name));

  return (
    // Anchored, because an International shows a squad count instead of
    // twenty-six names and that count has to lead somewhere. `scroll-mt` keeps the
    // heading clear of the viewport edge when a fan jumps here.
    <section id="roster" className="mt-12 scroll-mt-4 border-t border-line pt-8">
      <h2 className="mb-1.5 font-display text-[19px] font-semibold tracking-tight text-fg">
        Who we&apos;re tracking
      </h2>
      <p className="mb-5 text-[12px] leading-[1.6] text-faint">
        Squad list gathered{" "}
        <time dateTime={generatedAt}>
          {gatheredOn.format(new Date(generatedAt))}
        </time>
        . It is whatever the source last published, so a player stays listed until
        a newer squad is named.
      </p>
      <div className="flex flex-wrap gap-x-10 gap-y-6">
        <SquadColumn
          title="Men's national team"
          members={byName.filter((m) => m.squad === "men")}
        />
        <SquadColumn
          title="Women's national team"
          members={byName.filter((m) => m.squad === "women")}
        />
      </div>
    </section>
  );
}
