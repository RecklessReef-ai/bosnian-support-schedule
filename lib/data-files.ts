import fixturesFile from "@/data/fixtures.json";
import overridesFile from "@/data/overrides.json";
import rosterFile from "@/data/roster.json";
import { applyOverrides, type OverridesFile, type RosterFile } from "./roster";
import type { FixturesFile, Roster } from "./types";

/**
 * The app's view of the committed data files.
 *
 * Everything the site serves comes from here, and nothing here touches the network:
 * both the roster and the fixtures are resolved offline by scripts and committed.
 * That is what keeps the app inside the free tier — see `docs/adr/0003`.
 */

const roster = rosterFile as RosterFile;
const overrides = overridesFile as OverridesFile;
const fixtures = fixturesFile as unknown as FixturesFile;

/**
 * The Roster, Manual Overrides applied, still stamped with the date the squad list
 * itself was gathered — the overrides correct a member's Club, not when the list
 * was taken, so the stamp is the refresh's date and stays untouched.
 */
export function getRoster(): Roster {
  return {
    generatedAt: roster.generatedAt,
    members: applyOverrides(roster.members, overrides),
  };
}

export function getFixturesFile(): FixturesFile {
  return fixtures;
}
