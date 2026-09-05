export type Squad = "men" | "women";

export interface Club {
  id: number;
  name: string;
  logo: string | null;
}

export interface NationalTeamMember {
  id: number;
  name: string;
  photo: string | null;
  position: string | null;
  squad: Squad;
  club: Club | null;
  /** Set when the club came from the manual override table rather than the upstream feed. */
  clubOverridden?: boolean;
}

export interface Fixture {
  id: number;
  /** Kickoff as an ISO-8601 UTC instant. All timezone rendering happens client-side. */
  kickoff: string;
  competition: string;
  competitionLogo: string | null;
  round: string | null;
  venue: string | null;
  home: Club;
  away: Club;
  /** The National Team Members playing for one of these clubs. */
  members: NationalTeamMember[];
}

export interface ScheduleData {
  fixtures: Fixture[];
  members: NationalTeamMember[];
  generatedAt: string;
  /** True when no upstream API key is configured and the roster came from the seed file. */
  degraded: boolean;
}
