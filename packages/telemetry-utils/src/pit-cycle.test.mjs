import assert from "node:assert/strict";
import { derivePitCycleOutcomes } from "./index.js";

const driver = (lap, position, interval) => ({ lap, position, interval });
const frames = [
  { t: 0, trackStatus: "GREEN", drivers: { AAA: driver(10, 2, 4) } },
  { t: 20, trackStatus: "GREEN", drivers: { AAA: driver(11, 4, 5.5) } },
];
const stintPack = {
  drivers: [{
    driverCode: "AAA",
    team: "Alpha",
    stints: [
      { compound: "HARD", lapStart: 1 },
      { compound: "HARD", lapStart: 11 },
    ],
  }],
};
const lapRecords = [
  { driverCode: "AAA", lapNumber: 8, lapTime: 100 },
  { driverCode: "AAA", lapNumber: 9, lapTime: 98 },
  { driverCode: "AAA", lapNumber: 10, lapTime: 96 },
  { driverCode: "AAA", lapNumber: 11, lapTime: 300 },
  { driverCode: "AAA", lapNumber: 12, lapTime: 91 },
  { driverCode: "AAA", lapNumber: 13, lapTime: 93 },
];
const completeRace = {
  session: "race",
  frames,
  expectedFrameCount: 2,
  totalTime: 20,
  fullRaceLoaded: true,
  stintPack,
  lapRecords,
  raceControlMessages: [{ flag: "CHEQUERED", message: "CHEQUERED FLAG" }],
};

const result = derivePitCycleOutcomes(completeRace);
assert.equal(result.status, "ready");
assert.equal(result.outcomes.length, 1);
assert.equal(result.outcomes[0].fromCompound, "HARD");
assert.equal(result.outcomes[0].toCompound, "HARD");
assert.equal(result.outcomes[0].positionDelta, 2);
assert.equal(result.outcomes[0].replayGapDelta, 1.5);
assert.equal(result.outcomes[0].prePace, 98);
assert.equal(result.outcomes[0].postPace, 92);
assert.equal(result.outcomes[0].paceDelta, -6);

assert.equal(derivePitCycleOutcomes({ ...completeRace, fullRaceLoaded: false }).status, "requires_full_race");
assert.equal(derivePitCycleOutcomes({ ...completeRace, expectedFrameCount: 3 }).status, "requires_full_race");
assert.equal(derivePitCycleOutcomes({ ...completeRace, session: "qualifying" }).status, "unavailable");
assert.equal(derivePitCycleOutcomes({ ...completeRace, raceControlMessages: [] }).status, "unavailable");

const missingAnchor = derivePitCycleOutcomes({
  ...completeRace,
  frames: [{ t: 20, trackStatus: "CHEQUERED", drivers: { AAA: driver(11, 4, 5.5) } }],
  expectedFrameCount: 1,
});
assert.equal(missingAnchor.status, "ready");
assert.equal(missingAnchor.outcomes.length, 0);
assert.equal(missingAnchor.omittedCycles, 1);
