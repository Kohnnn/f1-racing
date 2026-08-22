import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openF1Fetch, readOpenF1Evidence } from "../pipeline/ingest/src/openf1-client.mjs";
import { normalizeTimestamp } from "../pipeline/normalize/src/normalize-session.mjs";
import {
  assertCleanSource,
  assertReleaseNodeVersion,
  buildAndFinalizeCandidate,
  createCandidate,
} from "./release-artifact.mjs";
import {
  assertCandidateOutputPath,
  selectLatestRace,
  sha256,
  walk,
  workspaceRoot,
} from "./release-data.mjs";

const endpointNames = Object.freeze([
  "drivers",
  "laps",
  "weather",
  "session_result",
  "stints",
  "position",
  "location",
  "car_data",
  "race_control",
]);
const driverCoverageEndpoints = Object.freeze([
  "laps",
  "session_result",
  "stints",
  "position",
  "location",
  "car_data",
]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    options[token.slice(2)] = value;
    index += 1;
  }
  return options;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeUtc(value, label) {
  return normalizeTimestamp(value, label);
}

function sessionBase(ref) {
  return `packs/seasons/${ref.season}/${ref.grandPrixSlug}/${ref.sessionSlug}`;
}

function collectIndexedSessions(index) {
  if (!Array.isArray(index?.seasons)) throw new Error("Invalid data/manifests/seasons.json.");
  return index.seasons.flatMap((season) => season.grandsPrix.flatMap((grandPrix) => grandPrix.sessions));
}

function collectSourceSessions(manifests) {
  return manifests.flatMap((manifest) => manifest.grandsPrix.flatMap((grandPrix) => grandPrix.sessions));
}

export function createRegenerationPlan(index, manifests) {
  const sourceByPath = new Map(collectSourceSessions(manifests).map((session) => [session.path, session]));
  const sessions = collectIndexedSessions(index).map((ref) => {
    const source = sourceByPath.get(ref.path);
    if (!source || source.sessionKey !== ref.sessionKey) throw new Error(`Indexed session does not match an OpenF1 source manifest: ${ref.path}`);
    return {
      ...ref,
      startDate: normalizeUtc(source.startDate, `${ref.path} startDate`),
      endDate: normalizeUtc(source.endDate, `${ref.path} endDate`),
    };
  }).sort((left, right) => compareText(left.path, right.path));
  assert.equal(new Set(sessions.map((session) => session.path)).size, sessions.length, "Indexed session paths must be unique.");
  assert.equal(new Set(sessions.map((session) => session.sessionKey)).size, sessions.length, "Indexed session keys must be unique.");
  return {
    endpointNames: [...endpointNames],
    requestCount: sessions.length * endpointNames.length,
    sessions,
  };
}

export function assertApprovedRights(options) {
  if (options["rights-status"] !== "approved") throw new Error("Live regeneration requires --rights-status approved.");
  if (typeof options["rights-reference"] !== "string" || !options["rights-reference"].trim()) {
    throw new Error("Live regeneration requires a non-empty --rights-reference.");
  }
  return options["rights-reference"].trim();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeCandidateJson(candidateRoot, targets, payload) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  await Promise.all(targets.map(async (target) => {
    await assertCandidateOutputPath(candidateRoot, target);
    await mkdir(path.dirname(target), { recursive: true });
    await assertCandidateOutputPath(candidateRoot, target);
    await writeFile(target, text, "utf8");
  }));
}

async function loadPlan(root = workspaceRoot) {
  const index = await readJson(path.join(root, "data", "manifests", "seasons.json"));
  const years = [...new Set(collectIndexedSessions(index).map((session) => session.season))].sort();
  const manifests = await Promise.all(years.map((year) => readJson(path.join(root, "data", "manifests", `openf1-${year}-season.json`))));
  return { manifests, plan: createRegenerationPlan(index, manifests) };
}

async function captureSession(session) {
  const evidence = new Map();
  for (const endpoint of endpointNames) {
    await openF1Fetch(endpoint, { session_key: session.sessionKey });
    evidence.set(endpoint, await readOpenF1Evidence(endpoint, { session_key: session.sessionKey }));
  }
  return evidence;
}

function driverNumbers(records) {
  return new Set(records.map((entry) => Number(entry?.driver_number)).filter((value) => Number.isInteger(value) && value > 0));
}

function sameNumbers(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function observationWindow(session, evidence) {
  const values = [
    ...(evidence.get("laps")?.payload ?? []).flatMap((entry) => [entry.date_start, entry.date_end]),
    ...(evidence.get("weather")?.payload ?? []).map((entry) => entry.date),
    ...(evidence.get("position")?.payload ?? []).map((entry) => entry.date),
    ...(evidence.get("location")?.payload ?? []).map((entry) => entry.date),
    ...(evidence.get("car_data")?.payload ?? []).map((entry) => entry.date),
    ...(evidence.get("race_control")?.payload ?? []).map((entry) => entry.date),
  ].map(Date.parse).filter(Number.isFinite);
  const startAt = Date.parse(session.startDate);
  const endAt = Date.parse(session.endDate);
  const withinSession = values.filter((value) => value >= startAt && value <= endAt).sort((left, right) => left - right);
  if (!withinSession.length) return null;
  return {
    observedStartAt: new Date(withinSession[0]).toISOString(),
    observedEndAt: new Date(withinSession.at(-1)).toISOString(),
  };
}

export function terminalEvidence(session, evidence) {
  const empty = endpointNames.filter((endpoint) => !Array.isArray(evidence.get(endpoint)?.payload) || !evidence.get(endpoint).payload.length);
  const expectedDrivers = driverNumbers(evidence.get("drivers")?.payload ?? []);
  const incomplete = driverCoverageEndpoints.filter((endpoint) => !sameNumbers(expectedDrivers, driverNumbers(evidence.get(endpoint)?.payload ?? [])));
  const raceControl = evidence.get("race_control")?.payload ?? [];
  const finished = raceControl.some((entry) => /\bSESSION (?:FINISHED|ENDED)\b/i.test(entry?.message ?? ""));
  const chequered = raceControl.some((entry) => /chequered|checkered/i.test(`${entry?.flag ?? ""} ${entry?.message ?? ""}`));
  const coverageWindow = observationWindow(session, evidence);
  if (empty.length || !expectedDrivers.size || incomplete.length || !coverageWindow || !finished || (session.sessionSlug === "race" && !chequered)) {
    return {
      eligible: false,
      reason: [
        empty.length ? `empty endpoints: ${empty.join(", ")}` : null,
        !expectedDrivers.size ? "missing drivers" : null,
        incomplete.length ? `incomplete driver coverage: ${incomplete.join(", ")}` : null,
        !coverageWindow ? "missing in-session observations" : null,
        !finished ? "missing session-finished evidence" : null,
        session.sessionSlug === "race" && !chequered ? "missing chequered-flag evidence" : null,
      ].filter(Boolean).join("; "),
    };
  }
  return {
    eligible: true,
    observedAt: evidence.get("race_control").metadata.retrievedAt,
    ...coverageWindow,
  };
}

function runNode(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: workspaceRoot,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(script)} exited ${code}`)));
  });
}

async function updateSourceManifests(paths, manifests, eligiblePaths, generatedAt) {
  for (const manifest of manifests) {
    const updated = structuredClone(manifest);
    updated.generatedAt = generatedAt;
    for (const grandPrix of updated.grandsPrix) {
      for (const session of grandPrix.sessions) {
        session.buildReady = eligiblePaths.has(session.path);
      }
    }
    const year = updated.season ?? updated.year;
    const relativePath = path.join("manifests", `openf1-${year}-season.json`);
    await writeCandidateJson(paths.root, [
      path.join(paths.canonicalData, relativePath),
      path.join(paths.publicData, relativePath),
    ], updated);
  }
}

async function buildSession(paths, session, generatedAt) {
  const env = {
    ...process.env,
    F1_CANDIDATE_ROOT: paths.root,
    F1_GENERATED_AT: generatedAt,
    F1_OPENF1_CACHE_ONLY: "1",
  };
  const args = [
    "--season", String(session.season),
    "--grandPrixSlug", session.grandPrixSlug,
    "--sessionSlug", session.sessionSlug,
  ];
  await runNode(path.join(workspaceRoot, "pipeline", "export", "src", "build-openf1-session-pack.mjs"), args, env);
  await runNode(path.join(workspaceRoot, "pipeline", "export", "src", "build-openf1-replay-pack.mjs"), args, env);
}

async function artifactLedger(paths, session) {
  const base = sessionBase(session);
  const members = await walk(path.join(paths.publicData, base));
  const requiredPaths = members.map((member) => `${base}/${member}`).sort(compareText);
  const artifacts = Object.fromEntries(await Promise.all(requiredPaths.map(async (relativePath) => [
    relativePath,
    await sha256(path.join(paths.publicData, relativePath)),
  ])));
  const packSha256 = createHash("sha256")
    .update(`${JSON.stringify(requiredPaths.map((relativePath) => [relativePath, artifacts[relativePath]]))}\n`)
    .digest("hex");
  return { artifacts, packSha256, requiredPaths };
}

async function coverageLedger(paths, session, requiredPaths, terminal) {
  const root = path.join(paths.publicData, sessionBase(session));
  const [drivers, results, replayMeta] = await Promise.all([
    readJson(path.join(root, "drivers.json")),
    readJson(path.join(root, "results.json")),
    readJson(path.join(root, "replay.meta.json")),
  ]);
  const observedDrivers = new Set();
  for (const chunk of replayMeta.frameChunks) {
    const payload = await readJson(path.join(root, chunk));
    for (const frame of payload.frames) Object.keys(frame.drivers).forEach((driverCode) => observedDrivers.add(driverCode));
  }
  if (!replayMeta.frameCount || drivers.length !== observedDrivers.size || drivers.length !== results.length) {
    throw new Error("Generated pack has incomplete frame, driver, or result coverage.");
  }
  return {
    status: "complete",
    observedStartAt: terminal.observedStartAt,
    observedEndAt: terminal.observedEndAt,
    frameCount: replayMeta.frameCount,
    expectedDriverCount: drivers.length,
    observedDriverCount: observedDrivers.size,
    expectedResultCount: drivers.length,
    observedResultCount: results.length,
    limitations: [],
    requiredArtifacts: Object.fromEntries(requiredPaths.map((relativePath) => [relativePath, "complete"])),
  };
}

async function provenanceEntry(paths, session, evidence, generatedAt, rightsReference, terminal) {
  const sources = endpointNames.map((endpoint) => {
    const { metadata } = evidence.get(endpoint);
    return {
      provider: metadata.provider,
      identifier: metadata.identifier,
      retrievedAt: metadata.retrievedAt,
      responseSha256: metadata.responseSha256,
      rightsStatus: "approved",
      rightsReference,
    };
  });
  const retrievalTimes = sources.map((source) => source.retrievedAt).sort(compareText);
  const { artifacts, packSha256, requiredPaths } = await artifactLedger(paths, session);
  return {
    path: session.path,
    publicationState: "historical",
    sourceEventStartAt: session.startDate,
    sourceEventEndAt: session.endDate,
    retrievedAtMin: retrievalTimes[0],
    retrievedAtMax: retrievalTimes.at(-1),
    generatedAt,
    terminalOutcome: { status: "completed", observedAt: terminal.observedAt },
    sources,
    generator: { name: "regenerate-openf1-candidate", version: "1" },
    packSha256,
    artifacts,
    coverage: await coverageLedger(paths, session, requiredPaths, terminal),
  };
}

async function writeLedger(paths, sessions, entries, generatedAt) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const selected = selectLatestRace(sessions, byPath, Date.parse(generatedAt));
  if (selected) byPath.get(selected.path).publicationState = "featured";
  const payload = { schemaVersion: 1, sessions: [...byPath.values()].sort((left, right) => compareText(left.path, right.path)) };
  const relativePath = path.join("release", "provenance-ledger.json");
  await writeCandidateJson(paths.root, [
    path.join(paths.canonicalData, relativePath),
    path.join(paths.publicData, relativePath),
  ], payload);
}

async function removeSessionPack(paths, session) {
  for (const dataRoot of [paths.canonicalData, paths.publicData]) {
    const target = path.join(dataRoot, sessionBase(session));
    await assertCandidateOutputPath(paths.root, target, "directory");
    await rm(target, { recursive: true, force: true });
  }
}

async function clearSeasonPacks(paths) {
  const targets = [
    path.join(paths.canonicalData, "packs", "seasons"),
    path.join(paths.publicData, "packs", "seasons"),
  ];
  for (const target of targets) {
    await assertCandidateOutputPath(paths.root, target, "directory");
    await rm(target, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { manifests, plan } = await loadPlan();
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({ sessions: plan.sessions.length, endpoints: plan.endpointNames, requests: plan.requestCount }, null, 2)}\n`);
    return;
  }
  const rightsReference = assertApprovedRights(options);
  assertReleaseNodeVersion();
  const sourceCommitValue = await assertCleanSource();
  const paths = await createCandidate();
  process.env.F1_CANDIDATE_ROOT = paths.root;
  try {
    const captured = new Map();
    for (let index = 0; index < plan.sessions.length; index += 1) {
      const session = plan.sessions[index];
      process.stdout.write(`Capturing ${index + 1}/${plan.sessions.length}: ${session.path}\n`);
      captured.set(session.path, await captureSession(session));
    }
    const generatedAt = new Date().toISOString();
    const terminals = new Map(plan.sessions.map((session) => [session.path, terminalEvidence(session, captured.get(session.path))]));
    const sourceEligible = plan.sessions.filter((session) => terminals.get(session.path).eligible);
    const eligible = [];
    const entries = [];
    await clearSeasonPacks(paths);
    for (let index = 0; index < sourceEligible.length; index += 1) {
      const session = sourceEligible[index];
      process.stdout.write(`Building ${index + 1}/${sourceEligible.length}: ${session.path}\n`);
      try {
        await buildSession(paths, session, generatedAt);
        entries.push(await provenanceEntry(paths, session, captured.get(session.path), generatedAt, rightsReference, terminals.get(session.path)));
        eligible.push(session);
      } catch (error) {
        await removeSessionPack(paths, session);
        terminals.set(session.path, {
          eligible: false,
          reason: `pack generation failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    if (!eligible.length) throw new Error("No indexed OpenF1 session produced a complete candidate pack.");
    await updateSourceManifests(paths, manifests, new Set(eligible.map((session) => session.path)), generatedAt);
    await writeLedger(paths, eligible, entries, generatedAt);
    const excluded = plan.sessions.filter((session) => !terminals.get(session.path).eligible);
    const { refreshFeaturedIndexes } = await import("../pipeline/export/src/refresh-seasons-index.mjs");
    await refreshFeaturedIndexes();
    const result = await buildAndFinalizeCandidate(paths.root, {
      now: Date.parse(generatedAt),
      generatedAt,
      sourceCommitValue,
    });
    process.stdout.write(`Regenerated ${eligible.length}/${plan.sessions.length} indexed sessions.\n`);
    for (const session of excluded) process.stdout.write(`Excluded ${session.path}: ${terminals.get(session.path).reason}\n`);
    process.stdout.write(`Candidate: ${paths.root}\nRelease ID: ${result.manifest.releaseId}\n`);
  } catch (error) {
    process.stderr.write(`Candidate retained for inspection: ${paths.root}\n`);
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
    process.exit(1);
  });
}
