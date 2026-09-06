import fixturesFile from "@/data/fixtures.json";
import internationalsFile from "@/data/internationals.json";
import overridesFile from "@/data/overrides.json";
import rosterFile from "@/data/roster.json";
import { applyOverrides, type OverridesFile, type RosterFile } from "./roster";
import type { FixturesFile, InternationalsFile, NationalTeamMember } from "./types";

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
const internationals = internationalsFile as unknown as InternationalsFile;

export function getRoster(): { members: NationalTeamMember[]; generatedAt: string } {
  return {
    members: applyOverrides(roster.members, overrides),
    generatedAt: roster.generatedAt,
  };
}

export function getFixturesFile(): FixturesFile {
  return fixtures;
}

export function getInternationalsFile(): InternationalsFile {
  return internationals;
}
