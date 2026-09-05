import type { NationalTeamMember } from "@/lib/types";

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

export function SquadList({ members }: { members: NationalTeamMember[] }) {
  const byName = [...members].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="mb-5 font-display text-[19px] font-semibold tracking-tight text-fg">
        Who we&apos;re tracking
      </h2>
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
