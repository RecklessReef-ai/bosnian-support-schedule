import { assembleSchedule } from "./assemble-schedule";
import {
  getFixturesFile,
  getHandEnteredInternationals,
  getInternationalsFile,
  getRoster,
} from "./data-files";
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
  const schedule = assembleSchedule(
    {
      roster: getRoster(),
      fixturesFile: getFixturesFile(),
      internationalsFile: getInternationalsFile(),
      handEnteredInternationals: getHandEnteredInternationals(),
    },
    new Date(),
  );

  // The loud half of dropping a bad hand entry. Assembly refuses the entry and
  // says why; this is the only place with somewhere to say it, and it is where a
  // maintainer who added a match that never appeared will look — the build and
  // render logs. Written on every render rather than once, because the file is
  // read on every render and a complaint nobody has fixed is still true.
  for (const rejection of schedule.handEntryRejections) {
    console.error(rejection);
  }

  return schedule;
}
