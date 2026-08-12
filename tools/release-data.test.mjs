import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { finalizeCandidate } from "./release-artifact.mjs";
import { auditCandidate, candidatePaths, sha256, workspaceRoot } from "./release-data.mjs";

const now = Date.parse("2026-08-01T00:00:00.000Z");

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function frame(t) {
  return {
    t,
    lap: 1,
    drivers: {
      TST: { driverCode: "TST", driverNumber: 1, team: "Test", position: 1, x: 0, y: 0, speed: 1, throttle: 1, brake: 0, gear: 1, rpm: 1, drs: 0, lap: 1, interval: 0, tyreCompound: "SOFT", tyreAge: 1 },
    },
    safetyCar: { phase: "none", x: null, y: null },
    trackStatus: "GREEN",
  };
}

async function seedCandidate() {
  const root = await mkdtemp(path.join(os.tmpdir(), "f1-release-"));
  const paths = candidatePaths(root);
  const base = "packs/seasons/2026/test-grand-prix/race";
  const files = {
    "manifests/seasons.json": {
      generatedAt: "2026-07-01T00:00:00.000Z",
      seasons: [{ season: 2026, grandsPrix: [{ grandPrixSlug: "test-grand-prix", grandPrixName: "Test Grand Prix", sessions: [{ season: 2026, grandPrixSlug: "test-grand-prix", sessionSlug: "race", grandPrixName: "Test Grand Prix", sessionName: "Race", sessionKey: 1, trackId: "test", path: "/sessions/2026/test-grand-prix/race" }] }] }],
    },
    "manifests/latest.json": {
      version: 1,
      seasons: [2026],
      latest: { season: 2026, grandPrixSlug: "test-grand-prix", sessionSlug: "race", grandPrixName: "Test Grand Prix", sessionName: "Race", sessionKey: 1, trackId: "test", path: "/sessions/2026/test-grand-prix/race" },
    },
    "packs/cars/catalog.json": {
      generatedAt: "2026-07-01T00:00:00.000Z",
      models: [{ id: "test", constructor: "Test", constructorSlug: "test", season: 2026, displayName: "Test", file: "/models/test.glb", poster: "/posters/test.webp", sizeLabel: "1 B", surfaceReady: true, notes: "test" }],
    },
    [`${base}/manifest.json`]: { sessionKey: 1, summary: "summary.json", drivers: "drivers.json", laps: "laps.json", compare: {}, strategy: "strategy.json", stints: "stints.json", replay: "replay.json" },
    [`${base}/summary.json`]: { season: 2026, grandPrix: "Test Grand Prix", session: "Race", sessionKey: 1, trackId: "test", generatedAt: "2026-07-01T00:00:00.000Z", source: "openf1", drivers: ["TST"], weatherSummary: { airTempC: null, trackTempC: null, rainRiskPct: null } },
    [`${base}/drivers.json`]: [{ driverCode: "TST", driverNumber: 1, fullName: "Test Driver", team: "Test", bestLap: 1, bestLapTime: 1, tyreCompound: "SOFT", stintCount: 1 }],
    [`${base}/laps.json`]: [{ driverCode: "TST", driverNumber: 1, lapNumber: 1, lapTime: 1, sector1: 1, sector2: 1, sector3: 1, compound: "SOFT", stint: 1, isFastest: true }],
    [`${base}/results.json`]: [{ driverCode: "TST", position: 1 }],
    [`${base}/weather.json`]: [{ at: "2026-07-01T00:00:00.000Z" }],
    [`${base}/stints.json`]: { trackId: "test", sessionKey: 1, drivers: [{ driverCode: "TST", team: "Test", stints: [{ stintNumber: 1, compound: "SOFT", lapStart: 1, lapEnd: 1, tyreAgeAtStart: 1, averageLapTime: 1, trendPerLap: 0, lapTimes: [1] }] }] },
    [`${base}/strategy.json`]: { trackId: "test", pitLossS: 1, safetyCarPitLossS: 1, recommendedWindows: [], weatherCrossover: { toIntermediate: 0, toWet: 0 } },
    [`${base}/replay.json`]: { generatedAt: "2026-07-01T00:00:00.000Z", sessionKey: 1, season: 2026, grandPrix: "Test Grand Prix", session: "Race", trackId: "test", source: "openf1", drivers: [{ driverCode: "TST", driverNumber: 1, fullName: "Test Driver", team: "Test", teamColor: "#000000" }], trackPath: null, laps: [{ driverCode: "TST", lapNumber: 1, lapTime: 1, compound: "SOFT" }], raceControlMessages: [{ t: 1, lapNumber: 1, category: "Flag", flag: "CHEQUERED", scope: "Track", sector: null, message: "CHEQUERED FLAG" }], frames: [frame(0), frame(1)] },
    [`${base}/replay.meta.json`]: { generatedAt: "2026-07-01T00:00:00.000Z", sessionKey: 1, season: 2026, grandPrix: "Test Grand Prix", session: "Race", trackId: "test", source: "openf1", drivers: [{ driverCode: "TST", driverNumber: 1, fullName: "Test Driver", team: "Test", teamColor: "#000000" }], trackPath: null, laps: [], raceControlMessages: [], totalTime: 1, totalLaps: 1, fastestLap: { driverCode: "TST", lapNumber: 1, lapTime: 1, compound: "SOFT" }, frameCount: 2, frameChunkSize: 2, frameChunks: ["replay.frames/chunk-000.json"], frameChunkIndex: [{ index: 0, fromTime: 0, toTime: 1, path: "replay.frames/chunk-000.json" }] },
    [`${base}/replay.laps.json`]: [{ driverCode: "TST", lapNumber: 1, lapTime: 1, compound: "SOFT" }],
    [`${base}/replay.race-control.json`]: [{ t: 1, lapNumber: 1, category: "Flag", flag: "CHEQUERED", scope: "Track", sector: null, message: "CHEQUERED FLAG" }],
    [`${base}/replay.frames/chunk-000.json`]: { index: 0, fromTime: 0, toTime: 1, frames: [frame(0), frame(1)] },
  };
  for (const [relativePath, value] of Object.entries(files)) await writeJson(path.join(paths.publicData, relativePath), value);
  await mkdir(path.join(paths.publicRoot, "models"), { recursive: true });
  await mkdir(path.join(paths.publicRoot, "posters"), { recursive: true });
  await writeFile(path.join(paths.publicRoot, "models", "test.glb"), "test");
  await writeFile(path.join(paths.publicRoot, "posters", "test.webp"), "test");
  await mkdir(path.dirname(paths.canonicalData), { recursive: true });
  await cp(paths.publicData, paths.canonicalData, { recursive: true });
  const artifactPaths = Object.keys(files).filter((relativePath) => relativePath.startsWith(base)).sort();
  const artifacts = Object.fromEntries(await Promise.all(artifactPaths.map(async (relativePath) => [
    relativePath,
    await sha256(path.join(paths.publicData, relativePath)),
  ])));
  await writeJson(path.join(paths.publicData, "release", "provenance-ledger.json"), {
    schemaVersion: 1,
    sessions: [{
      path: "/sessions/2026/test-grand-prix/race",
      publicationState: "historical",
      sourceEventStartAt: "2026-07-01T00:00:00.000Z",
      sourceEventEndAt: "2026-07-01T01:00:00.000Z",
      retrievedAtMin: "2026-07-01T01:01:00.000Z",
      retrievedAtMax: "2026-07-01T01:02:00.000Z",
      generatedAt: "2026-07-01T01:03:00.000Z",
      terminalOutcome: { status: "completed", observedAt: "2026-07-01T01:00:00.000Z" },
      sources: [{ provider: "openf1", identifier: "session/1", retrievedAt: "2026-07-01T01:01:00.000Z", responseSha256: "0".repeat(64), rightsReference: "test-rights" }],
      artifacts,
    }],
  });
  await cp(path.join(paths.publicData, "release", "provenance-ledger.json"), path.join(paths.canonicalData, "release", "provenance-ledger.json"));
  await finalizeCandidate(root);
  return root;
}

async function expectFailure(root, change, pattern) {
  const paths = candidatePaths(root);
  const promotedDigest = await sha256(path.join(workspaceRoot, "apps/web/public/data/manifests/latest.json"));
  await change(paths);
  await assert.rejects(auditCandidate(root, { now }), pattern);
  assert.equal(await sha256(path.join(workspaceRoot, "apps/web/public/data/manifests/latest.json")), promotedDigest);
}

const root = await seedCandidate();
try {
  await auditCandidate(root, { now });
  const releaseId = JSON.parse(await readFile(candidatePaths(root).releaseManifest, "utf8")).releaseId;
  await finalizeCandidate(root);
  assert.equal(JSON.parse(await readFile(candidatePaths(root).releaseManifest, "utf8")).releaseId, releaseId);
  await auditCandidate(root, { now });
  await expectFailure(root, async (paths) => rm(path.join(paths.publicData, "packs/seasons/2026/test-grand-prix/race/replay.frames/chunk-000.json")), /missing replay\.frames/);
} finally {
  await rm(root, { recursive: true, force: true });
}

for (const [change, pattern] of [
  [async (paths) => writeFile(path.join(paths.publicData, "packs/seasons/2026/test-grand-prix/race/summary.json"), "{}"), /summary\.json/],
  [async (paths) => writeJson(path.join(paths.publicData, "packs/seasons/2026/test-grand-prix/race/summary.json"), { season: 2026, grandPrix: "Test Grand Prix", session: "Race", sessionKey: 2, trackId: "test", generatedAt: "2026-07-01T00:00:00.000Z", source: "openf1", drivers: ["TST"], weatherSummary: { airTempC: null, trackTempC: null, rainRiskPct: null } }), /sessionKey, or trackId mismatch/],
  [async (paths) => writeFile(path.join(paths.canonicalData, "packs/seasons/2026/test-grand-prix/race/summary.json"), "{}"), /stale mirror/],
  [async (paths) => writeJson(path.join(paths.publicData, "release/provenance-ledger.json"), { schemaVersion: 1, sessions: [{ path: "/sessions/2026/test-grand-prix/race", publicationState: "partial" }] }), /forbidden public state partial/],
  [async (paths) => writeFile(path.join(paths.publicData, "packs/seasons/2026/test-grand-prix/race/replay.frames/chunk-000.json"), "{}"), /chunk-000\.json/],
]) {
  const candidate = await seedCandidate();
  try {
    await expectFailure(candidate, change, pattern);
  } finally {
    await rm(candidate, { recursive: true, force: true });
  }
}
