import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { splitReplayPack } from "./split-replay-packs.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "f1-split-replay-"));
const replayPath = path.join(root, "replay.json");
const replay = {
  generatedAt: "2025-01-01T00:00:00.000Z",
  sessionKey: 1,
  season: 2025,
  grandPrix: "Test Grand Prix",
  session: "Race",
  trackId: "test-track",
  source: "openf1",
  drivers: [{
    driverCode: "TST",
    driverNumber: 1,
    fullName: "Test Driver",
    team: "Test Team",
    teamColor: "#000000",
  }],
  trackPath: null,
  laps: [{ driverCode: "TST", lapNumber: 1, lapTime: 60, compound: "SOFT" }],
  raceControlMessages: [],
  frames: [0, 1].map((t) => ({
    t,
    lap: 1,
    drivers: {
      TST: {
        driverCode: "TST",
        driverNumber: 1,
        team: "Test Team",
        position: 1,
        x: 0,
        y: 0,
        speed: 0,
        throttle: 0,
        brake: 0,
        gear: 1,
        rpm: 1000,
        drs: 0,
        lap: 1,
        interval: 0,
        tyreCompound: "SOFT",
        tyreAge: 1,
      },
    },
    safetyCar: { phase: "none", x: null, y: null },
    trackStatus: "GREEN",
  })),
};

try {
  await writeFile(path.join(root, "manifest.json"), `${JSON.stringify({ sessionKey: 1, replay: "replay.json" })}\n`);
  await writeFile(replayPath, `${JSON.stringify(replay)}\n`);

  assert.equal(await splitReplayPack(replayPath), true);
  assert.equal(await splitReplayPack(replayPath), false);

  const [manifest, meta, laps, raceControl, chunk] = await Promise.all([
    readFile(path.join(root, "manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "replay.meta.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "replay.laps.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "replay.race-control.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "replay.frames", "chunk-000.json"), "utf8").then(JSON.parse),
  ]);
  assert.equal(manifest.replay, undefined);
  assert.equal(meta.frameCount, 2);
  assert.deepEqual(laps, replay.laps);
  assert.deepEqual(raceControl, replay.raceControlMessages);
  assert.deepEqual(chunk.frames, replay.frames);
} finally {
  await rm(root, { recursive: true, force: true });
}
