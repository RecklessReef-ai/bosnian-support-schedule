export type Squad = "men" | "women";

/**
 * Where a published record's information actually came from.
 *
 * Recorded on the record rather than claimed once for the whole site. Most
 * Fixtures come from the upstream API, but a match the federation announced and a
 * maintainer entered by hand comes from NFSBiH, and a single site-wide credit made
 * it easy to present the second as the first. See `docs/adr/0004`.
 */
export type Source = "API-Football" | "NFSBiH";

/**
 * One of the two teams a Fixture is played between: Clubs in a Club Fixture,
 * National Teams in an International. The shape is the same either way; the
 * glossary is what keeps the two apart.
 */
export interface Side {
  id: number;
  name: string;
  logo: string | null;
}

/**
 * The team a National Team Member plays for day-to-day, as distinct from the
 * National Team itself.
 */
export type Club = Side;

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

/**
 * The list of National Team Members as the upstream source last supplied it,
 * stamped with the date it was gathered.
 *
 * The stamp travels with the list rather than beside it, because a Roster whose
 * date can drift away from its members is precisely the confusion the date exists
 * to settle. It claims nothing about whether these players are a standing pool or
 * an announced call-up — the source does not say — so the date is all a fan has to
 * judge it by. It is also nothing to do with `FixturesFile.generatedAt`: the two
 * are gathered by different scripts and go stale at different rates.
 */
export interface Roster {
  /** When the squad list was gathered, as an ISO-8601 UTC instant. */
  generatedAt: string;
  members: readonly NationalTeamMember[];
}

/** A row of the Manual Override table (data/overrides.json). */
export interface OverrideEntry {
  player: string;
  clubId: number;
  clubName: string;
  position?: string;
}

/** What both kinds of Fixture have in common. */
interface FixtureBase {
  id: number;
  /** Kickoff as an ISO-8601 UTC instant. All timezone rendering happens client-side. */
  kickoff: string;
  competition: string;
  competitionLogo: string | null;
  round: string | null;
  venue: string | null;
  home: Side;
  away: Side;
  /** Where this Fixture came from, per record rather than per site. */
  source: Source;
  /** The National Team Members this Fixture involves. */
  members: NationalTeamMember[];
}

/** A Fixture on a Club's calendar. Its Members are the ones at either Club. */
export interface ClubFixture extends FixtureBase {
  kind: "club";
}

/**
 * A Fixture on a National Team's own calendar.
 *
 * Its Members are that squad in full rather than a couple of names: an
 * International involves a Member by squad membership, where a Club Fixture
 * involves them by who they happen to turn out for that weekend.
 */
export interface International extends FixtureBase {
  kind: "international";
  /** Which of the two senior Bosnian sides is playing. */
  squad: Squad;
}

/**
 * Either kind, as the Schedule publishes them: one chronological array, so nobody
 * has to merge and re-sort two lists.
 *
 * `kind` is carried on every record rather than inferred from the Sides, because
 * inferring it means knowing which Side ids are National Teams — a fact a consumer
 * of the JSON API has no way to look up, and one this app would rather not restate
 * on each surface either.
 */
export type Fixture = ClubFixture | International;

/**
 * What `npm run refresh:fixtures` writes to data/fixtures.json.
 *
 * Fixtures are stored in their upstream (trimmed) form rather than already merged,
 * so editing the roster or an override takes effect on the next render instead of
 * needing another API refresh.
 */
export interface FixturesFile {
  generatedAt: string;
  fixtures: RawFixtureRecord[];
  /** Clubs whose fetch failed during the refresh. Their matches are missing. */
  unavailableClubs: Club[];
  /** When each Club was last fetched, so a refresh can skip ones still fresh. */
  clubs: ClubFetchRecord[];
}

export interface ClubFetchRecord {
  id: number;
  name: string;
  fetchedAt: string;
}

/** The upstream fixture shape, trimmed to what the app renders. */
export interface RawFixtureRecord {
  fixture: { id: number; date: string; venue: { name: string | null } | null };
  league: { name: string; logo: string | null; round: string | null };
  teams: { home: Side; away: Side };
  /**
   * Set only when the record did not come from the upstream API. Absent is the
   * common case and means API-Football, so hundreds of fetched rows need not each
   * repeat the same credit; a hand-entered record names its own Source instead.
   */
  source?: Source;
}

/**
 * Whether a squad has Internationals coming up, has none scheduled, or could not
 * be asked at all.
 *
 * The last two must never collapse into one another. The women's squad genuinely
 * has nothing scheduled — their qualifying group finished and the federation has
 * announced no more — so an empty list is a true statement about the world, not a
 * symptom. Reading it as an outage, or an outage as a quiet calendar, tells a fan
 * the opposite of the truth.
 */
export type SquadInternationalsStatus = "scheduled" | "none-scheduled" | "unavailable";

/** One squad's Internationals, as `npm run refresh:fixtures` last found them. */
export interface SquadInternationals {
  squad: Squad;
  /** The National Team's upstream team id. */
  teamId: number;
  status: SquadInternationalsStatus;
  /** When these were last fetched successfully, or null if they never have been. */
  fetchedAt: string | null;
  /** Why the last attempt failed. Set only when the status is "unavailable". */
  unavailableReason?: string;
  /**
   * Stored in the same upstream (trimmed) shape as Club Fixtures, chronologically.
   * A squad whose fetch failed keeps whatever was last stored rather than blanking.
   */
  internationals: RawFixtureRecord[];
}

/**
 * What `npm run refresh:fixtures` writes to data/internationals.json.
 *
 * Internationals live in their own file rather than in `fixtures.json` because
 * they obey different rules: no 21-day horizon, both squads always listed even
 * when empty, and — later — hand-entered records merged over fetched ones. Mixing
 * them in would entangle the Club Fixture staleness logic, which this feature
 * otherwise leaves alone.
 */
export interface InternationalsFile {
  generatedAt: string;
  /** Both squads, always, so a squad is never silently omitted. */
  squads: SquadInternationals[];
}

/**
 * What the assembled Schedule says about one squad's Internationals.
 *
 * The stored status describes what the last refresh found; this one describes what
 * a fan is actually being shown, which is not always the same thing — a squad whose
 * stored Internationals have all been played has none coming, however successful
 * the fetch was. "Unavailable" is never rewritten that way. Not knowing is its own
 * answer, and folding it into "none scheduled" would tell a fan the calendar is
 * empty when we simply could not ask.
 */
export interface SquadInternationalsState {
  squad: Squad;
  status: SquadInternationalsStatus;
  /** How old the data behind this is, or null if it was never fetched. */
  fetchedAt: string | null;
  /** Why the last attempt failed. Set only when the status is "unavailable". */
  unavailableReason?: string;
}

export interface ScheduleData {
  /** Both kinds of Fixture, in one chronological feed. */
  fixtures: Fixture[];
  members: NationalTeamMember[];
  /** When the Fixtures were fetched. Says nothing about the Roster. */
  generatedAt: string;
  /**
   * When the Roster was gathered — a separate date from `generatedAt`, because the
   * squad list and the fixtures are refreshed independently and either can be the
   * stale one. A retired player stays on the Roster until a newer squad is named,
   * so this is what tells a fan how much to trust the list.
   */
  rosterGeneratedAt: string;
  /** True when no upstream API key is configured and the roster came from the seed file. */
  degraded: boolean;
  /**
   * Clubs whose fixtures could not be fetched. Their players' matches are missing
   * from `fixtures`, so an incomplete Schedule can be told apart from a quiet week.
   */
  unavailableClubs: Club[];
  /**
   * One entry per squad, always both, so a squad with nothing scheduled is named
   * rather than silently absent — and told apart from one we could not reach.
   */
  squadInternationals: SquadInternationalsState[];
}
