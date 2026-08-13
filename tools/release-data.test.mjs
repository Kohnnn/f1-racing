import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { finalizeCandidate, normalizeReleaseTime } from "./release-artifact.mjs";
import {
  assertCandidateRoot,
  auditCandidate,
  candidateMarker,
  candidatePaths,
  candidatesRoot,
  selectLatestRace,
  sha256,
  summarizeArtifactMeasurements,
  walk,
  workspaceRoot,
} from "./release-data.mjs";

const now = Date.parse("2026-07-02T00:00:00.000Z");
const nowText = new Date(now).toISOString();
const candidateGateEvidence = {
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  commands: ["quality", "check:featured", "build", "smoke:static"].map((command) => ({ command: `npm run ${command}`, status: "passed" })),
};
const releaseDataScript = fileURLToPath(new URL("./release-data.mjs", import.meta.url));
const releaseArtifactScript = fileURLToPath(new URL("./release-artifact.mjs", import.meta.url));
const promotedFiles = [
  path.join(workspaceRoot, "data", "manifests", "latest.json"),
  path.join(workspaceRoot, "apps", "web", "public", "data", "manifests", "latest.json"),
];
const sessionBase = path.join("packs", "seasons", "2026", "test-grand-prix", "race");

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function frame(t, lap = t + 1) {
  return {
    t,
    lap,
    drivers: {
      TST: { driverCode: "TST", driverNumber: 1, team: "Test", position: 1, x: 0, y: 0, speed: 1, throttle: 1, brake: 0, gear: 1, rpm: 1, drs: 0, lap, interval: 0, tyreCompound: lap === 1 ? "SOFT" : "MEDIUM", tyreAge: 1 },
      ALT: { driverCode: "ALT", driverNumber: 2, team: "Alternate", position: 2, x: 1, y: 1, speed: 1, throttle: 1, brake: 0, gear: 1, rpm: 1, drs: 0, lap, interval: 1, tyreCompound: "MEDIUM", tyreAge: lap },
    },
    safetyCar: { phase: "none", x: null, y: null },
    trackStatus: "GREEN",
  };
}

async function createOwnedRoot() {
  await mkdir(candidatesRoot, { recursive: true });
  const root = await mkdtemp(path.join(candidatesRoot, "test-"));
  const paths = candidatePaths(root);
  await writeJson(paths.marker, candidateMarker);
  return root;
}

async function seedCandidate({ fullPublic = false, stale = false } = {}) {
  const root = await createOwnedRoot();
  const paths = candidatePaths(root);
  const base = "packs/seasons/2026/test-grand-prix/race";
  const sourceEventStartAt = stale ? "2026-06-01T00:00:00.000Z" : "2026-07-01T00:00:00.000Z";
  const sourceEventEndAt = stale ? "2026-06-01T01:00:00.000Z" : "2026-07-01T01:00:00.000Z";
  const retrievedAtMin = stale ? "2026-06-01T01:01:00.000Z" : "2026-07-01T01:01:00.000Z";
  const retrievedAtMax = stale ? "2026-06-01T01:02:00.000Z" : "2026-07-01T01:02:00.000Z";
  const generatedAt = stale ? "2026-06-01T01:03:00.000Z" : "2026-07-01T01:03:00.000Z";
  const raceControl = [
    { t: 0, lapNumber: 1, category: "SessionStatus", flag: null, scope: null, sector: null, message: "SESSION STARTED" },
    { t: 5, lapNumber: 2, category: "Flag", flag: "CHEQUERED", scope: "Track", sector: null, message: "CHEQUERED FLAG" },
  ];
  const replayLaps = [
    { driverCode: "TST", lapNumber: 1, lapTime: 1, compound: "SOFT" },
    { driverCode: "TST", lapNumber: 2, lapTime: 1.1, compound: "MEDIUM" },
    { driverCode: "ALT", lapNumber: 1, lapTime: 2, compound: "MEDIUM" },
    { driverCode: "ALT", lapNumber: 2, lapTime: 2.1, compound: "MEDIUM" },
  ];
  const replayFrames = [frame(0, 1), frame(1, 1), frame(2, 1), frame(3, 2), frame(4, 2), frame(5, 2)];
  const replay = {
    generatedAt,
    sessionKey: 1,
    season: 2026,
    grandPrix: "Test Grand Prix",
    session: "Race",
    trackId: "test",
    source: "openf1",
    drivers: [
      { driverCode: "TST", driverNumber: 1, fullName: "Test Driver", team: "Test", teamColor: "#000000" },
      { driverCode: "ALT", driverNumber: 2, fullName: "Alternate Driver", team: "Alternate", teamColor: "#ffffff" },
    ],
    trackPath: null,
    laps: replayLaps,
    raceControlMessages: raceControl,
    frames: replayFrames,
  };
  const files = {
    "manifests/openf1-2026-season.json": {
      schemaVersion: 1,
      year: 2026,
      generatedAt,
      source: "openf1",
      grandsPrix: [{
        grandPrixSlug: "test-grand-prix",
        grandPrixName: "Test Grand Prix",
        countryName: "Testland",
        circuitShortName: "Test Circuit",
        meetingKey: 1,
        sessions: [{
          season: 2026,
          grandPrixSlug: "test-grand-prix",
          sessionSlug: "race",
          grandPrixName: "Test Grand Prix",
          sessionName: "Race",
          sessionKey: 1,
          trackId: "test",
          path: "/sessions/2026/test-grand-prix/race",
          startDate: sourceEventStartAt,
          endDate: sourceEventEndAt,
          countryName: "Testland",
          location: "Test Circuit",
          source: "openf1",
          buildReady: true,
        }],
      }],
    },
    "manifests/seasons.json": {
      generatedAt,
      seasons: [{ season: 2026, grandsPrix: [{ grandPrixSlug: "test-grand-prix", grandPrixName: "Test Grand Prix", sessions: [{ season: 2026, grandPrixSlug: "test-grand-prix", sessionSlug: "race", grandPrixName: "Test Grand Prix", sessionName: "Race", sessionKey: 1, trackId: "test", path: "/sessions/2026/test-grand-prix/race" }] }] }],
    },
    "manifests/latest.json": {
      version: 1,
      seasons: [2026],
      latest: stale ? null : { season: 2026, grandPrixSlug: "test-grand-prix", sessionSlug: "race", grandPrixName: "Test Grand Prix", sessionName: "Race", sessionKey: 1, trackId: "test", path: "/sessions/2026/test-grand-prix/race" },
    },
    "packs/cars/catalog.json": {
      generatedAt: "2026-07-01T01:03:00.000Z",
      models: [{ id: "test", constructor: "Test", constructorSlug: "test", season: 2026, displayName: "Test", file: "/models/test.glb", poster: "/posters/test.webp", sizeLabel: "4 B", surfaceReady: true, notes: "test" }],
    },
    [`${base}/manifest.json`]: { sessionKey: 1, summary: "summary.json", drivers: "drivers.json", laps: "laps.json", compare: { "TST-ALT": "compare/tst-alt.json" }, strategy: "strategy.json", stints: "stints.json" },
    [`${base}/summary.json`]: { season: 2026, grandPrix: "Test Grand Prix", session: "Race", sessionKey: 1, trackId: "test", generatedAt, source: "openf1", drivers: ["TST", "ALT"], weatherSummary: { airTempC: 20, trackTempC: 30, rainRiskPct: 0 } },
    [`${base}/drivers.json`]: [
      { driverCode: "TST", driverNumber: 1, fullName: "Test Driver", team: "Test", bestLap: 1, bestLapTime: 1, tyreCompound: "SOFT", stintCount: 2 },
      { driverCode: "ALT", driverNumber: 2, fullName: "Alternate Driver", team: "Alternate", bestLap: 1, bestLapTime: 2, tyreCompound: "MEDIUM", stintCount: 1 },
    ],
    [`${base}/laps.json`]: [
      { driverCode: "TST", driverNumber: 1, lapNumber: 1, lapTime: 1, sector1: 0.3, sector2: 0.3, sector3: 0.4, compound: "SOFT", stint: 1, isFastest: true },
      { driverCode: "TST", driverNumber: 1, lapNumber: 2, lapTime: 1.1, sector1: 0.3, sector2: 0.4, sector3: 0.4, compound: "MEDIUM", stint: 2, isFastest: false },
      { driverCode: "ALT", driverNumber: 2, lapNumber: 1, lapTime: 2, sector1: 0.6, sector2: 0.6, sector3: 0.8, compound: "MEDIUM", stint: 1, isFastest: false },
      { driverCode: "ALT", driverNumber: 2, lapNumber: 2, lapTime: 2.1, sector1: 0.7, sector2: 0.7, sector3: 0.7, compound: "MEDIUM", stint: 1, isFastest: false },
    ],
    [`${base}/compare/tst-alt.json`]: { trackId: "test", drivers: ["TST", "ALT"], laps: [1, 1], deltaSections: [{ from: 0, to: 1, leader: "TST", deltaMs: 1000 }], events: [] },
    [`${base}/results.json`]: [{ driverCode: "TST", position: 1 }, { driverCode: "ALT", position: 2 }],
    [`${base}/weather.json`]: [{ at: stale ? "2026-06-01T00:30:00.000Z" : "2026-07-01T00:30:00.000Z", airTempC: 20 }],
    [`${base}/stints.json`]: { trackId: "test", sessionKey: 1, drivers: [
      { driverCode: "TST", team: "Test", stints: [
        { stintNumber: 1, compound: "SOFT", lapStart: 1, lapEnd: 1, tyreAgeAtStart: 1, averageLapTime: 1, trendPerLap: 0, lapTimes: [1] },
        { stintNumber: 2, compound: "MEDIUM", lapStart: 2, lapEnd: 2, tyreAgeAtStart: 1, averageLapTime: 1.1, trendPerLap: 0, lapTimes: [1.1] },
      ] },
      { driverCode: "ALT", team: "Alternate", stints: [{ stintNumber: 1, compound: "MEDIUM", lapStart: 1, lapEnd: 2, tyreAgeAtStart: 1, averageLapTime: 2.05, trendPerLap: 0.1, lapTimes: [2, 2.1] }] },
    ] },
    [`${base}/strategy.json`]: { trackId: "test", pitLossS: 1, safetyCarPitLossS: 1, recommendedWindows: [], weatherCrossover: { toIntermediate: 0, toWet: 0 } },
    [`${base}/replay.meta.json`]: { ...replay, laps: [], raceControlMessages: [], totalTime: 5, totalLaps: 2, fastestLap: replayLaps[0], frameCount: 6, frameChunkSize: 2, frameChunks: ["replay.frames/chunk-000.json", "replay.frames/chunk-001.json", "replay.frames/chunk-002.json"], frameChunkIndex: [
      { index: 0, fromTime: 0, toTime: 1, path: "replay.frames/chunk-000.json" },
      { index: 1, fromTime: 2, toTime: 3, path: "replay.frames/chunk-001.json" },
      { index: 2, fromTime: 4, toTime: 5, path: "replay.frames/chunk-002.json" },
    ], frames: undefined },
    [`${base}/replay.laps.json`]: replayLaps,
    [`${base}/replay.race-control.json`]: raceControl,
    [`${base}/replay.frames/chunk-000.json`]: { index: 0, fromTime: 0, toTime: 1, frames: replayFrames.slice(0, 2) },
    [`${base}/replay.frames/chunk-001.json`]: { index: 1, fromTime: 2, toTime: 3, frames: replayFrames.slice(2, 4) },
    [`${base}/replay.frames/chunk-002.json`]: { index: 2, fromTime: 4, toTime: 5, frames: replayFrames.slice(4, 6) },
  };
  delete files[`${base}/replay.meta.json`].frames;
  for (const [relativePath, value] of Object.entries(files)) await writeJson(path.join(paths.publicData, relativePath), value);
  await cp(path.join(workspaceRoot, "data", "packs", "sims"), path.join(paths.publicData, "packs", "sims"), { recursive: true });
  if (fullPublic) {
    for (const entry of await readdir(path.join(workspaceRoot, "apps", "web", "public"), { withFileTypes: true })) {
      if (entry.name === "data" || entry.name === "models" || entry.name === "posters") continue;
      const source = path.join(workspaceRoot, "apps", "web", "public", entry.name);
      await cp(source, path.join(paths.publicRoot, entry.name), { recursive: entry.isDirectory(), force: true });
    }
  }
  await mkdir(path.join(paths.publicRoot, "models"), { recursive: true });
  await mkdir(path.join(paths.publicRoot, "posters"), { recursive: true });
  await writeFile(path.join(paths.publicRoot, "models", "test.glb"), "test");
  await writeFile(path.join(paths.publicRoot, "posters", "test.webp"), "test");
  const requiredPaths = Object.keys(files).filter((relativePath) => relativePath.startsWith(base)).sort();
  const artifacts = Object.fromEntries(await Promise.all(requiredPaths.map(async (relativePath) => [
    relativePath,
    await sha256(path.join(paths.publicData, relativePath)),
  ])));
  const packSha256 = digest(`${JSON.stringify(requiredPaths.map((relativePath) => [relativePath, artifacts[relativePath]]))}\n`);
  await writeJson(path.join(paths.publicData, "release", "provenance-ledger.json"), {
    schemaVersion: 1,
    sessions: [{
      path: "/sessions/2026/test-grand-prix/race",
      publicationState: stale ? "historical" : "featured",
      sourceEventStartAt,
      sourceEventEndAt,
      retrievedAtMin,
      retrievedAtMax,
      generatedAt,
      terminalOutcome: { status: "completed", observedAt: sourceEventEndAt },
      sources: [{ provider: "openf1", identifier: "session/1", retrievedAt: retrievedAtMin, responseSha256: "0".repeat(64), rightsStatus: "approved", rightsReference: "approved-test-rights" }],
      generator: { name: "release-data.test", version: "1" },
      packSha256,
      artifacts,
      coverage: {
        status: "complete",
        observedStartAt: sourceEventStartAt,
        observedEndAt: sourceEventEndAt,
        frameCount: 6,
        expectedDriverCount: 2,
        observedDriverCount: 2,
        expectedResultCount: 2,
        observedResultCount: 2,
        limitations: [],
        requiredArtifacts: Object.fromEntries(requiredPaths.map((relativePath) => [relativePath, "complete"])),
      },
    }],
  });
  await mkdir(path.dirname(paths.canonicalData), { recursive: true });
  await cp(paths.publicData, paths.canonicalData, { recursive: true });
  await mkdir(path.dirname(paths.artifactRoot), { recursive: true });
  await cp(paths.publicRoot, paths.artifactRoot, { recursive: true });
  await writeFile(path.join(paths.artifactRoot, "index.html"), "<!doctype html><title>Test</title>\n");
  await finalizeCandidate(root, { sourceCommitValue: "a".repeat(40), generatedAt: "2026-07-01T01:04:00.000Z", gateEvidence: candidateGateEvidence });
  return root;
}

async function runProcess(args, environment = {}) {
  const env = { ...process.env, ...environment };
  if (!("F1_CANDIDATE_ROOT" in environment)) delete env.F1_CANDIDATE_ROOT;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: workspaceRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

function runNode(script, args = [], environment = {}) {
  return runProcess([script, ...args], environment);
}

function runNpm(script, environment = {}) {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return runProcess([npmCli, "run", script], environment);
}

async function promotedDigests() {
  return Promise.all(promotedFiles.map(sha256));
}

async function treeSnapshot(root) {
  return Promise.all((await walk(root)).map(async (relativePath) => ({
    path: relativePath,
    bytes: (await stat(path.join(root, relativePath))).size,
    sha256: await sha256(path.join(root, relativePath)),
  })));
}

async function candidateSnapshot(root) {
  const paths = candidatePaths(root);
  return {
    canonicalData: await treeSnapshot(paths.canonicalData),
    publicRoot: await treeSnapshot(paths.publicRoot),
    artifactRoot: await treeSnapshot(paths.artifactRoot),
    releaseRecord: await sha256(paths.releaseRecord),
  };
}

async function expectFailure(root, change, pattern) {
  const before = await promotedDigests();
  const paths = candidatePaths(root);
  await change(paths);
  const result = await runNode(releaseDataScript, ["--candidate-root", root, "--now", nowText]);
  assert.notEqual(result.code, 0, `Expected failure, received stdout:\n${result.stdout}`);
  assert.match(result.stderr, pattern);
  assert.deepEqual(await promotedDigests(), before);
}

async function mutateJson(filePath, mutate) {
  const payload = JSON.parse(await readFile(filePath, "utf8"));
  mutate(payload);
  await writeJson(filePath, payload);
}

assert.deepEqual(normalizeReleaseTime("2026-07-02T00:00:00+00:00"), { now, generatedAt: nowText });
assert.deepEqual(normalizeReleaseTime(undefined, now), { now, generatedAt: nowText });
assert.throws(() => normalizeReleaseTime("not-a-date"), /Invalid --now timestamp/);

const root = await seedCandidate();
try {
  await auditCandidate(root, { now });
  const firstManifest = JSON.parse(await readFile(candidatePaths(root).releaseManifest, "utf8"));
  const releaseMeasurements = await summarizeArtifactMeasurements(firstManifest.entries, candidatePaths(root).artifactRoot);
  const replayMeta = JSON.parse(await readFile(path.join(candidatePaths(root).artifactRoot, "data", sessionBase, "replay.meta.json"), "utf8"));
  const replayFrames = [];
  for (const entry of replayMeta.frameChunkIndex) {
    const chunk = JSON.parse(await readFile(path.join(candidatePaths(root).artifactRoot, "data", sessionBase, entry.path), "utf8"));
    replayFrames.push(...chunk.frames);
  }
  assert.equal(firstManifest.measurements.removedReplayFramePayloadBytes, Buffer.byteLength(JSON.stringify(replayFrames), "utf8"));
  assert.deepEqual(firstManifest.measurements, releaseMeasurements);
  await finalizeCandidate(root, { sourceCommitValue: "a".repeat(40), generatedAt: "2026-07-01T01:05:00.000Z", gateEvidence: candidateGateEvidence });
  const secondManifest = JSON.parse(await readFile(candidatePaths(root).releaseManifest, "utf8"));
  assert.equal(secondManifest.releaseId, firstManifest.releaseId);
  assert.equal(secondManifest.assetReleaseId, firstManifest.assetReleaseId);
  assert.equal(secondManifest.assetManifestSha256, firstManifest.assetManifestSha256);
  await finalizeCandidate(root, { sourceCommitValue: "b".repeat(40), generatedAt: "2026-07-01T01:06:00.000Z", gateEvidence: candidateGateEvidence });
  const thirdManifest = JSON.parse(await readFile(candidatePaths(root).releaseManifest, "utf8"));
  const thirdRecord = JSON.parse(await readFile(candidatePaths(root).releaseRecord, "utf8"));
  assert.notEqual(thirdManifest.releaseId, firstManifest.releaseId);
  assert.equal(thirdManifest.assetReleaseId, firstManifest.assetReleaseId);
  assert.equal(thirdManifest.assetManifestSha256, firstManifest.assetManifestSha256);
  assert.equal(thirdRecord.generatedAt, "2026-07-01T01:06:00.000Z");
  await auditCandidate(root, { now });
  const cliResult = await runNode(releaseDataScript, ["--candidate-root", root, "--now", nowText]);
  assert.equal(cliResult.code, 0, cliResult.stderr);
} finally {
  await rm(root, { recursive: true, force: true });
}

const ref = (pathValue, sessionKey, sessionSlug = "race") => ({ path: pathValue, sessionKey, sessionSlug });
const eligible = (sourceEventEndAt, overrides = {}) => ({
  publicationState: "historical",
  sourceEventStartAt: new Date(Date.parse(sourceEventEndAt) - 60 * 60 * 1000).toISOString(),
  sourceEventEndAt,
  generatedAt: new Date(Date.parse(sourceEventEndAt) + 60 * 60 * 1000).toISOString(),
  ...overrides,
});
const selectedByEnd = selectLatestRace([
  ref("/sessions/2026/older/race", 100),
  ref("/sessions/2026/newer/race", 1),
  ref("/sessions/2026/newer/qualifying", 999, "qualifying"),
], new Map([
  ["/sessions/2026/older/race", eligible("2026-06-30T00:00:00.000Z")],
  ["/sessions/2026/newer/race", eligible("2026-07-01T00:00:00.000Z")],
  ["/sessions/2026/newer/qualifying", eligible("2026-07-01T12:00:00.000Z")],
]), now);
assert.equal(selectedByEnd.path, "/sessions/2026/newer/race");
const selectedByKey = selectLatestRace([
  ref("/sessions/2026/low/race", 1),
  ref("/sessions/2026/high/race", 2),
], new Map([
  ["/sessions/2026/low/race", eligible("2026-07-01T00:00:00.000Z")],
  ["/sessions/2026/high/race", eligible("2026-07-01T00:00:00.000Z")],
]), now);
assert.equal(selectedByKey.path, "/sessions/2026/high/race");
const selectedByPath = selectLatestRace([
  ref("/sessions/2026/zulu/race", 1),
  ref("/sessions/2026/alpha/race", 1),
], new Map([
  ["/sessions/2026/zulu/race", eligible("2026-07-01T00:00:00.000Z")],
  ["/sessions/2026/alpha/race", eligible("2026-07-01T00:00:00.000Z")],
]), now);
assert.equal(selectedByPath.path, "/sessions/2026/alpha/race");
assert.equal(selectLatestRace(
  [ref("/sessions/2026/stale/race", 1)],
  new Map([["/sessions/2026/stale/race", eligible("2026-06-01T00:00:00.000Z")]]),
  now,
), null);

const base = sessionBase;
const failures = [
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData, path.join(paths.artifactRoot, "data")]) {
      await rm(path.join(rootPath, base, "replay.frames", "chunk-001.json"));
    }
  }, /missing replay\.frames\/chunk-001\.json/],
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData]) {
      await writeFile(path.join(rootPath, base, "replay.meta.json"), "{}");
    }
  }, /replay\.meta\.json/],
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData]) {
      await mutateJson(path.join(rootPath, base, "manifest.json"), (manifest) => { manifest.replay = "replay.json"; });
    }
  }, /replay\.json is forbidden/],
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData, path.join(paths.artifactRoot, "data")]) {
      await writeFile(path.join(rootPath, base, "replay.json"), JSON.stringify({ stale: true }));
    }
  }, /replay\.json is forbidden/],
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData]) await writeFile(path.join(rootPath, base, "summary.json"), "{}");
  }, /summary\.json/],
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData]) {
      await mutateJson(path.join(rootPath, base, "summary.json"), (summary) => { summary.sessionKey = 2; });
    }
  }, /season, sessionKey, or trackId mismatch/],
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData]) {
      await mutateJson(path.join(rootPath, base, "replay.frames", "chunk-001.json"), (chunk) => { chunk.frames[0].drivers.TST.driverNumber = 99; });
    }
  }, /frame contains an unknown or mismatched driver/],
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData]) {
      await mutateJson(path.join(rootPath, base, "replay.laps.json"), (laps) => { laps.pop(); });
    }
  }, /driver\/lap coverage does not match laps\.json/],
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData]) {
      await mutateJson(path.join(rootPath, base, "replay.race-control.json"), (messages) => { [messages[0], messages[1]] = [messages[1], messages[0]]; });
    }
  }, /entries must use canonical order/],
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData]) {
      await mutateJson(path.join(rootPath, "release", "provenance-ledger.json"), (ledger) => { ledger.sessions[0].publicationState = "partial"; });
    }
  }, /forbidden public state partial/],
  [async (paths) => {
    for (const rootPath of [paths.canonicalData, paths.publicData, path.join(paths.artifactRoot, "data")]) {
      await writeFile(path.join(rootPath, base, "summary.json"), `${await readFile(path.join(rootPath, base, "summary.json"), "utf8")} `);
    }
  }, /digest mismatch/],
  [async (paths) => writeFile(path.join(paths.artifactRoot, "unexpected.txt"), "unexpected"), /do not exactly match the built release unit/],
  [async (paths) => writeFile(path.join(paths.artifactRoot, "index.html"), "changed"), /digest or size mismatch for index\.html/],
  [async (paths) => rm(path.join(paths.artifactRoot, "models", "test.glb")), /missing models\/test\.glb/],
  [async (paths) => {
    await mutateJson(paths.releaseManifest, (manifest) => { manifest.sourceCommit = "b".repeat(40); });
    await mutateJson(paths.releaseRecord, (record) => { record.sourceCommit = "b".repeat(40); });
  }, /release ID or manifest SHA-256 mismatch/],
  [async (paths) => {
    await mutateJson(paths.releaseManifest, (manifest) => { manifest.assetReleaseId = `sha256-${"b".repeat(64)}`; });
    await mutateJson(paths.releaseRecord, (record) => { record.assetReleaseId = `sha256-${"b".repeat(64)}`; });
  }, /asset release ID or asset manifest SHA-256 mismatch/],
];

for (const [change, pattern] of failures) {
  const candidate = await seedCandidate();
  try {
    await expectFailure(candidate, change, pattern);
  } finally {
    await rm(candidate, { recursive: true, force: true });
  }
}

const unsafeRoot = await mkdtemp(path.join(os.tmpdir(), "f1-unsafe-"));
try {
  const sentinel = path.join(unsafeRoot, "sentinel.txt");
  await writeJson(path.join(unsafeRoot, ".f1-release-candidate.json"), candidateMarker);
  await writeFile(sentinel, "preserve");
  await assert.rejects(assertCandidateRoot(unsafeRoot), /Not an owned F1 release candidate/);
  const result = await runNode(releaseArtifactScript, [], { F1_CANDIDATE_ROOT: unsafeRoot });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /creates a fresh candidate path/);
  assert.equal(await readFile(sentinel, "utf8"), "preserve");
} finally {
  await rm(unsafeRoot, { recursive: true, force: true });
}

const escapedRoot = await createOwnedRoot();
const escapedPaths = candidatePaths(escapedRoot);
const escapedTarget = await mkdtemp(path.join(os.tmpdir(), "f1-escaped-target-"));
try {
  const sentinel = path.join(escapedTarget, "sentinel.txt");
  await mkdir(escapedPaths.publicRoot, { recursive: true });
  await writeFile(sentinel, "preserve");
  await symlink(escapedTarget, escapedPaths.publicData, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(assertCandidateRoot(escapedRoot), /Unsafe F1 release candidate path/);
  assert.equal(await readFile(sentinel, "utf8"), "preserve");
} finally {
  await rm(escapedPaths.publicData, { force: true });
  await rm(escapedRoot, { recursive: true, force: true });
  await rm(escapedTarget, { recursive: true, force: true });
}

const descendantEscapeRoot = await seedCandidate();
const descendantEscapePaths = candidatePaths(descendantEscapeRoot);
const descendantEscapeTarget = await mkdtemp(path.join(os.tmpdir(), "f1-descendant-escape-"));
const descendantEscapeLink = path.join(descendantEscapePaths.publicData, "escaped-link");
try {
  const sentinel = path.join(descendantEscapeTarget, "sentinel.txt");
  await writeFile(sentinel, "preserve");
  await symlink(descendantEscapeTarget, descendantEscapeLink, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(auditCandidate(descendantEscapeRoot, { now }), /Unsupported release entry/);
  assert.equal(await readFile(sentinel, "utf8"), "preserve");
} finally {
  await rm(descendantEscapeLink, { force: true });
  await rm(descendantEscapeRoot, { recursive: true, force: true });
  await rm(descendantEscapeTarget, { recursive: true, force: true });
}

if (process.argv.includes("--e2e")) {
  const sourceCommitValue = "a".repeat(40);
  const candidate = await seedCandidate({ fullPublic: true });
  const env = { F1_CANDIDATE_ROOT: candidate, F1_RELEASE_BUILD_ID: sourceCommitValue };
  try {
    const before = await promotedDigests();
    for (const command of ["quality", "check:featured", "build", "smoke:static"]) {
      const result = await runNpm(command, env);
      assert.equal(result.code, 0, `npm run ${command} failed:\n${result.stdout.slice(-12_000)}\n${result.stderr.slice(-12_000)}`);
    }
    await finalizeCandidate(candidate, { sourceCommitValue, generatedAt: "2026-07-01T01:05:00.000Z", gateEvidence: candidateGateEvidence });
    const finalizedCandidate = await candidateSnapshot(candidate);
    await auditCandidate(candidate, { now });
    assert.deepEqual(await candidateSnapshot(candidate), finalizedCandidate);
    const cliResult = await runNode(releaseDataScript, ["--candidate-root", candidate, "--now", nowText]);
    assert.equal(cliResult.code, 0, cliResult.stderr);
    assert.deepEqual(await candidateSnapshot(candidate), finalizedCandidate);
    assert.deepEqual(await promotedDigests(), before);
  } finally {
    await rm(candidate, { recursive: true, force: true });
  }

  const noFeaturedCandidate = await seedCandidate({ fullPublic: true, stale: true });
  const noFeaturedEnv = { F1_CANDIDATE_ROOT: noFeaturedCandidate, F1_RELEASE_BUILD_ID: sourceCommitValue };
  try {
    const before = await promotedDigests();
    for (const command of ["quality", "check:featured", "build", "smoke:static"]) {
      const result = await runNpm(command, noFeaturedEnv);
      assert.equal(result.code, 0, `no-featured npm run ${command} failed:\n${result.stdout.slice(-12_000)}\n${result.stderr.slice(-12_000)}`);
    }
    const result = await finalizeCandidate(noFeaturedCandidate, { sourceCommitValue, generatedAt: "2026-07-01T01:05:00.000Z", gateEvidence: candidateGateEvidence });
    assert.equal(result.manifest.data.latestPath, null);
    assert.deepEqual(result.releaseRecord.featured, { status: "none", path: null, selectedBy: ["sourceEventEndAt desc", "sessionKey desc", "path asc"] });
    await auditCandidate(noFeaturedCandidate, { now });
    assert.deepEqual(await promotedDigests(), before);
  } finally {
    await rm(noFeaturedCandidate, { recursive: true, force: true });
  }
}
