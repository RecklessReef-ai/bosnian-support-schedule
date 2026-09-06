import fixturesFile from "@/data/fixtures.json";
import handEnteredFile from "@/data/hand-entered-internationals.json";
import internationalsFile from "@/data/internationals.json";
import overridesFile from "@/data/overrides.json";
import rosterFile from "@/data/roster.json";
import type { UncheckedHandEnteredInternationalsFile } from "./hand-entered-internationals";
import { applyOverrides, type OverridesFile, type RosterFile } from "./roster";
import type { FixturesFile, InternationalsFile, Roster } from "./types";

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
// The one file here nothing generated. The others are written by
// `refresh:fixtures` in a shape their types describe, so a cast restates what the
// script guarantees; this one a human types, and a cast would only be the app
// promising itself that they never slip. It crosses into a checked shape in
// `readHandEnteredInternationals`, during assembly, and not before.
const handEntered: UncheckedHandEnteredInternationalsFile = handEnteredFile;

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

export function getInternationalsFile(): InternationalsFile {
  return internationals;
}

/**
 * The hand-entered Internationals, read straight off disk and layered on during
 * assembly — never merged into `internationals.json`, which the daily refresh
 * rewrites. That is what makes a maintainer's entry survive a refresh and take
 * effect on the next render rather than the next API call, exactly as a Manual
 * Override does.
 *
 * Handed over unchecked, on purpose: assembly does the checking, so the rules
 * about what a hand entry may say are testable without a filesystem.
 */
export function getHandEnteredInternationals(): UncheckedHandEnteredInternationalsFile {
  return handEntered;
}
