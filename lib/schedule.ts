import { assembleSchedule } from "./assemble-schedule";
import { getFixturesFile, getRoster } from "./data-files";
import type { ScheduleData } from "./types";

/**
 * The Schedule as the surfaces get it: read the committed data files, stamp the
 * current time, assemble.
 *
 * Deliberately thin. Every rule about what appears on the Schedule lives in
 * `assembleSchedule`, which is pure, so that none of it is trapped behind a
 * filesystem read and a real clock. If a decision is being made in here, it is in
 * the wrong file.
 *
 * Makes no upstream calls: `npm run refresh:fixtures` does that offline, so every
 * surface costs nothing to serve however often it is rendered — see
 * `docs/adr/0003`.
 */
export async function getSchedule(): Promise<ScheduleData> {
  const { members } = getRoster();

  return assembleSchedule(
    { members, fixturesFile: getFixturesFile() },
    new Date(),
  );
}
