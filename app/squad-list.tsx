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
      <h3 className="mb-2 text-sm font-semibold text-accent">
        {title}{" "}
        <span className="font-normal text-faint">({members.length})</span>
      </h3>
      <ul className="flex flex-col gap-1">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-baseline justify-between gap-3 border-b border-border-subtle/60 py-1.5 text-sm"
          >
            <span className="text-foreground">{member.name}</span>
            <span className="text-right text-xs text-muted">
              {member.club?.name ?? (
                <span className="text-faint italic">no club resolved</span>
              )}
              {member.clubOverridden && (
                <span
                  className="ml-1 text-accent"
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
    <section className="mt-12 border-t border-border-subtle pt-8">
      <h2 className="mb-4 text-lg font-semibold">Who we&apos;re tracking</h2>
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
