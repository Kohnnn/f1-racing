import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CarModelCatalogSchema,
  CfdOverlaySchemaExampleSchema,
  ComparePackSchema,
  DriverSummarySchema,
  LapRecordSchema,
  LatestManifestSchema,
  OpenF1SeasonManifestSchema,
  OpenFoamStarterCaseSchema,
  ReplayFrameChunkSchema,
  ReplayMetaSchema,
  ReplayPackSchema,
  SeasonIndexSchema,
  SessionManifestSchema,
  SessionSummarySchema,
  StintPackSchema,
  StrategyPackSchema,
  WindOverlayPackSchema,
} from "../packages/schemas/src/index.js";

export const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const canonicalHostname = "https://f1-demo.netlify.app";
const workspaceKey = createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 12);
export const candidatesRoot = path.join(os.tmpdir(), "f1-racing-release-candidates", workspaceKey);
export const candidateMarker = Object.freeze({ schemaVersion: 1, kind: "f1-release-candidate" });
export const artifactBudgets = Object.freeze({
  outputBytes: 1_950_000_000,
  glbBytes: 125_000_000,
  frameChunkBytes: 1_600_000,
  replay3dBytes: 2_100_000,
});

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    options[token.slice(2)] = value;
    index += 1;
  }
  return options;
}

export function candidateRootFrom(options = parseArgs(process.argv.slice(2))) {
  const candidateRoot = options["candidate-root"] || process.env.F1_CANDIDATE_ROOT;
  if (!candidateRoot) throw new Error("Set F1_CANDIDATE_ROOT or pass --candidate-root <directory>.");
  return path.resolve(candidateRoot);
}

export function candidatePaths(candidateRoot) {
  const root = path.resolve(candidateRoot);
  const artifactRoot = path.join(root, "apps", "web", "out");
  return {
    root,
    marker: path.join(root, ".f1-release-candidate.json"),
    canonicalData: path.join(root, "canonical", "data"),
    publicRoot: path.join(root, "public"),
    publicData: path.join(root, "public", "data"),
    artifactRoot,
    releaseRecord: path.join(root, "release-record.json"),
    releaseManifest: path.join(artifactRoot, "release-manifest.json"),
  };
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertSafeCandidatePath(root, rootRealPath, target, expectedType) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe F1 release candidate path: ${target}`);
  }
  const segments = relative.split(path.sep);
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (info.isSymbolicLink() || !isContained(rootRealPath, await realpath(current))) {
      throw new Error(`Unsafe F1 release candidate path: ${current}`);
    }
    const final = index === segments.length - 1;
    if ((!final || expectedType === "directory") && !info.isDirectory()) {
      throw new Error(`Unsafe F1 release candidate directory: ${current}`);
    }
    if (final && expectedType === "file" && !info.isFile()) {
      throw new Error(`Unsafe F1 release candidate file: ${current}`);
    }
  }
}

export async function assertCandidateRoot(candidateRoot) {
  const paths = candidatePaths(candidateRoot);
  let marker;
  let rootRealPath;
  try {
    const [resolvedRoot, candidatesRealPath, rootInfo, markerInfo] = await Promise.all([
      realpath(paths.root),
      realpath(candidatesRoot),
      lstat(paths.root),
      lstat(paths.marker),
    ]);
    rootRealPath = resolvedRoot;
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || !markerInfo.isFile() || markerInfo.isSymbolicLink()) {
      throw new Error("candidate root and marker must be regular filesystem entries");
    }
    if (path.dirname(rootRealPath) !== candidatesRealPath) throw new Error("candidate root is not owned by .release-candidates");
    marker = JSON.parse(await readFile(paths.marker, "utf8"));
  } catch {
    throw new Error(`Not an owned F1 release candidate: ${paths.root}`);
  }
  if (marker?.schemaVersion !== candidateMarker.schemaVersion || marker?.kind !== candidateMarker.kind) {
    throw new Error(`Invalid F1 release candidate marker: ${paths.marker}`);
  }
  await Promise.all([
    assertSafeCandidatePath(paths.root, rootRealPath, paths.canonicalData, "directory"),
    assertSafeCandidatePath(paths.root, rootRealPath, paths.publicRoot, "directory"),
    assertSafeCandidatePath(paths.root, rootRealPath, paths.publicData, "directory"),
    assertSafeCandidatePath(paths.root, rootRealPath, paths.artifactRoot, "directory"),
    assertSafeCandidatePath(paths.root, rootRealPath, paths.releaseRecord, "file"),
    assertSafeCandidatePath(paths.root, rootRealPath, paths.releaseManifest, "file"),
  ]);
  return paths;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(errors, message) {
  errors.push(message);
}

async function readJson(filePath, errors, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    fail(errors, `${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function walk(directory, prefix = "") {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries.sort((left, right) => compareCodeUnits(left.name, right.name))) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath.split(path.sep).join("/"));
    else throw new Error(`Unsupported release entry: ${path.join(directory, entry.name)}`);
  }
  return files;
}

export async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export function mimeType(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const types = {
    ".avif": "image/avif",
    ".css": "text/css; charset=utf-8",
    ".glb": "model/gltf-binary",
    ".hdr": "application/octet-stream",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
    ".webmanifest": "application/manifest+json",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".xml": "application/xml; charset=utf-8",
  };
  return types[extension] || "application/octet-stream";
}

export function cachePolicy(relativePath) {
  if (relativePath === "release-manifest.json" || relativePath.endsWith(".html")) return "no-cache";
  if (relativePath.startsWith("_next/static/")) return "public, max-age=31536000, immutable";
  if (relativePath.startsWith("data/manifests/")) return "public, max-age=60";
  if (relativePath.startsWith("data/packs/") || relativePath.startsWith("data/silhouettes/")) return "public, max-age=300";
  if (relativePath.startsWith("models/") || relativePath.startsWith("posters/")) return "public, max-age=86400";
  return "no-cache";
}

function isReplayJsonPath(entryPath) {
  return /(?:^|\/)replay\.json$/.test(entryPath);
}

export function summarizeArtifactEntries(entries) {
  const sum = (predicate) => entries.reduce((total, entry) => total + (predicate(entry.path) ? entry.bytes : 0), 0);
  const largest = (predicate) => entries.reduce((maximum, entry) => predicate(entry.path) ? Math.max(maximum, entry.bytes) : maximum, 0);
  return {
    outputBytes: sum(() => true),
    publicDataBytes: sum((entryPath) => entryPath.startsWith("data/")),
    frameChunkBytes: sum((entryPath) => entryPath.includes("/replay.frames/") && entryPath.endsWith(".json")),
    glbBytes: sum((entryPath) => entryPath.endsWith(".glb")),
    replay3dBytes: sum((entryPath) => entryPath.startsWith("replay-3d/")),
    nextStaticJsCssBytes: sum((entryPath) => entryPath.startsWith("_next/static/") && /\.(?:js|css)$/.test(entryPath)),
    largestGlbBytes: largest((entryPath) => entryPath.endsWith(".glb")),
    largestFrameChunkBytes: largest((entryPath) => entryPath.includes("/replay.frames/") && entryPath.endsWith(".json")),
  };
}

export async function summarizeArtifactMeasurements(entries, artifactRoot) {
  const replayMetaPaths = entries
    .map((entry) => entry.path)
    .filter((entryPath) => /^data\/packs\/seasons\/.+\/replay\.meta\.json$/.test(entryPath))
    .sort(compareCodeUnits);
  let removedReplayFramePayloadBytes = 0;
  for (const replayMetaPath of replayMetaPaths) {
    const replayMeta = JSON.parse(await readFile(path.join(artifactRoot, replayMetaPath), "utf8"));
    const frames = [];
    for (const entry of replayMeta.frameChunkIndex ?? []) {
      const chunkPath = path.join(path.dirname(path.join(artifactRoot, replayMetaPath)), entry.path);
      let chunk;
      try {
        chunk = JSON.parse(await readFile(chunkPath, "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT") throw new Error(`Artifact measurement: missing ${entry.path}.`);
        throw error;
      }
      frames.push(...(chunk.frames ?? []));
    }
    removedReplayFramePayloadBytes += Buffer.byteLength(JSON.stringify(frames), "utf8");
  }
  return { ...summarizeArtifactEntries(entries), removedReplayFramePayloadBytes };
}

export function artifactBudgetErrors(entries) {
  const measurements = summarizeArtifactEntries(entries);
  const errors = [];
  if (measurements.outputBytes > artifactBudgets.outputBytes) {
    errors.push(`artifact output exceeds ${artifactBudgets.outputBytes} bytes (${measurements.outputBytes}).`);
  }
  if (measurements.largestGlbBytes > artifactBudgets.glbBytes) {
    errors.push(`GLB exceeds ${artifactBudgets.glbBytes} bytes (${measurements.largestGlbBytes}).`);
  }
  for (const entry of entries.filter((entry) => isReplayJsonPath(entry.path))) {
    errors.push(`replay.json is forbidden in release artifacts (${entry.path}).`);
  }
  if (measurements.largestFrameChunkBytes > artifactBudgets.frameChunkBytes) {
    errors.push(`replay frame chunk exceeds ${artifactBudgets.frameChunkBytes} bytes (${measurements.largestFrameChunkBytes}).`);
  }
  if (measurements.replay3dBytes > artifactBudgets.replay3dBytes) {
    errors.push(`Replay 3D assets exceed ${artifactBudgets.replay3dBytes} bytes (${measurements.replay3dBytes}).`);
  }
  return errors;
}

export async function summarizeReleaseData(artifactRoot) {
  const ledgerPath = path.join(artifactRoot, "data", "release", "provenance-ledger.json");
  const latestPath = path.join(artifactRoot, "data", "manifests", "latest.json");
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  const latest = JSON.parse(await readFile(latestPath, "utf8"));
  const sessions = Array.isArray(ledger.sessions) ? ledger.sessions.filter(isRecord) : [];
  const values = (field) => sessions.map((session) => session[field]).filter((value) => typeof value === "string").sort();
  const states = {};
  for (const session of sessions) states[session.publicationState] = (states[session.publicationState] || 0) + 1;
  return {
    provenanceLedgerPath: "data/release/provenance-ledger.json",
    provenanceLedgerSha256: await sha256(ledgerPath),
    sessionCount: sessions.length,
    publicationStates: Object.fromEntries(Object.entries(states).sort(([left], [right]) => compareCodeUnits(left, right))),
    providers: [...new Set(sessions.flatMap((session) => Array.isArray(session.sources) ? session.sources.map((source) => source?.provider) : []).filter((value) => typeof value === "string"))].sort(),
    sourceEventStartAtMin: values("sourceEventStartAt").at(0) || null,
    sourceEventEndAtMax: values("sourceEventEndAt").at(-1) || null,
    retrievedAtMin: values("retrievedAtMin").at(0) || null,
    retrievedAtMax: values("retrievedAtMax").at(-1) || null,
    generatedAtMin: values("generatedAt").at(0) || null,
    generatedAtMax: values("generatedAt").at(-1) || null,
    latestPath: latest?.latest?.path || null,
  };
}

function resolveContained(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath.length) return null;
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? resolved : null;
}

async function assertFile(root, relativePath, errors, label) {
  const filePath = resolveContained(root, relativePath);
  if (!filePath) {
    fail(errors, `${label}: unsafe path ${JSON.stringify(relativePath)}`);
    return null;
  }
  try {
    if (!(await lstat(filePath)).isFile()) throw new Error("not a regular file");
    return filePath;
  } catch {
    fail(errors, `${label}: missing ${relativePath}`);
    return null;
  }
}

function parse(schema, payload, errors, label) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    fail(errors, `${label}: ${result.error.issues.map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`).join("; ")}`);
    return null;
  }
  return result.data;
}

function sameSession(payload, ref) {
  return payload?.season === ref.season
    && payload?.sessionKey === ref.sessionKey
    && payload?.trackId === ref.trackId;
}

function sameSessionRef(left, right) {
  return left?.season === right?.season
    && left?.grandPrixSlug === right?.grandPrixSlug
    && left?.sessionSlug === right?.sessionSlug
    && left?.grandPrixName === right?.grandPrixName
    && left?.sessionName === right?.sessionName
    && left?.sessionKey === right?.sessionKey
    && left?.trackId === right?.trackId
    && left?.path === right?.path;
}

function sameInstant(left, right) {
  return Number.isFinite(Date.parse(left))
    && Number.isFinite(Date.parse(right))
    && Date.parse(left) === Date.parse(right);
}

export function utcTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(?:Z|\+00:00)$/);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, milliseconds = "000"] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(milliseconds));
  const parsed = new Date(timestamp);
  return Number.isFinite(timestamp)
    && parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() + 1 === Number(month)
    && parsed.getUTCDate() === Number(day)
    && parsed.getUTCHours() === Number(hour)
    && parsed.getUTCMinutes() === Number(minute)
    && parsed.getUTCSeconds() === Number(second)
    && parsed.getUTCMilliseconds() === Number(milliseconds);
}

function canonicalSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function sessionPath(ref) {
  return `packs/seasons/${ref.season}/${ref.grandPrixSlug}/${ref.sessionSlug}`;
}

function collectRefs(index) {
  return index.seasons.flatMap((season) => season.grandsPrix.flatMap((grandPrix) => grandPrix.sessions));
}

function collectStringPaths(value, paths = []) {
  if (typeof value === "string") paths.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStringPaths(entry, paths));
  else if (isRecord(value)) Object.values(value).forEach((entry) => collectStringPaths(entry, paths));
  return paths;
}

function duplicateValues(values) {
  const seen = new Set();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))].sort();
}

function sameUniqueStrings(left, right) {
  return !duplicateValues(left).length
    && !duplicateValues(right).length
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function requireUnique(values, errors, label) {
  const duplicates = duplicateValues(values);
  if (duplicates.length) fail(errors, `${label}: duplicate identifiers ${duplicates.join(", ")}.`);
}

function requireOrdered(values, compare, errors, label) {
  for (let index = 1; index < values.length; index += 1) {
    if (compare(values[index - 1], values[index]) > 0) {
      fail(errors, `${label}: entries must use canonical order.`);
      return;
    }
  }
}

async function assertMirrors(paths, errors) {
  const canonicalFiles = await walk(paths.canonicalData);
  const publicFiles = await walk(paths.publicData);
  const allFiles = [...new Set([...canonicalFiles, ...publicFiles])].sort();
  for (const relativePath of allFiles) {
    const canonical = await assertFile(paths.canonicalData, relativePath, errors, "canonical mirror");
    const publicFile = await assertFile(paths.publicData, relativePath, errors, "public mirror");
    if (canonical && publicFile && await sha256(canonical) !== await sha256(publicFile)) {
      fail(errors, `stale mirror: data/${relativePath}`);
    }
  }
}

async function auditOpenF1Manifests(paths, errors) {
  const manifestRoot = path.join(paths.publicData, "manifests");
  const manifestPaths = (await walk(manifestRoot)).filter((entry) => /^openf1-\d{4}-season\.json$/.test(entry));
  if (!manifestPaths.length) fail(errors, "manifests: at least one OpenF1 season manifest is required.");
  const sessions = new Map();
  const sessionKeys = new Map();
  for (const relativePath of manifestPaths) {
    const label = `manifests/${relativePath}`;
    const manifest = parse(OpenF1SeasonManifestSchema, await readJson(path.join(manifestRoot, relativePath), errors, label), errors, label);
    if (!manifest) continue;
    const filenameSeason = Number(relativePath.match(/openf1-(\d{4})-season\.json/)?.[1]);
    const declaredSeason = manifest.season ?? manifest.year;
    if (declaredSeason !== filenameSeason) fail(errors, `${label}: declared season does not match the filename.`);
    if (!utcTimestamp(manifest.generatedAt)) fail(errors, `${label}: generatedAt must be an RFC 3339 UTC timestamp.`);
    const grandPrixSlugs = [];
    const meetingKeys = [];
    for (const grandPrix of manifest.grandsPrix) {
      grandPrixSlugs.push(grandPrix.grandPrixSlug);
      meetingKeys.push(grandPrix.meetingKey);
      const sessionSlugs = [];
      for (const session of grandPrix.sessions) {
        sessionSlugs.push(session.sessionSlug);
        const expectedPath = `/sessions/${filenameSeason}/${grandPrix.grandPrixSlug}/${session.sessionSlug}`;
        if (session.season !== filenameSeason
          || session.grandPrixSlug !== grandPrix.grandPrixSlug
          || session.grandPrixName !== grandPrix.grandPrixName
          || session.path !== expectedPath
          || !canonicalSlug(session.grandPrixSlug)
          || !canonicalSlug(session.sessionSlug)) {
          fail(errors, `${label}: ${session.path} does not match its canonical season and Grand Prix identity.`);
        }
        if (!utcTimestamp(session.startDate) || !utcTimestamp(session.endDate)) {
          fail(errors, `${label}: ${session.path} requires UTC startDate and endDate.`);
        } else if (Date.parse(session.endDate) < Date.parse(session.startDate)) {
          fail(errors, `${label}: ${session.path} endDate precedes startDate.`);
        }
        if (sessions.has(session.path)) fail(errors, `${label}: duplicate session path ${session.path}.`);
        if (sessionKeys.has(session.sessionKey)) fail(errors, `${label}: duplicate sessionKey ${session.sessionKey}.`);
        sessions.set(session.path, session);
        sessionKeys.set(session.sessionKey, session.path);
      }
      requireUnique(sessionSlugs, errors, `${label}: ${grandPrix.grandPrixSlug} sessions`);
    }
    requireUnique(grandPrixSlugs, errors, `${label}: Grand Prix slugs`);
    requireUnique(meetingKeys, errors, `${label}: meeting keys`);
    if (manifest.latest) {
      const sourceSession = sessions.get(manifest.latest.path);
      if (!sourceSession || sourceSession.sessionKey !== manifest.latest.sessionKey) {
        fail(errors, `${label}: latest does not identify a session in this manifest.`);
      }
    }
  }
  return sessions;
}

async function readProvenance(paths, errors) {
  const relativePath = "release/provenance-ledger.json";
  const ledger = await readJson(path.join(paths.publicData, relativePath), errors, relativePath);
  if (!isRecord(ledger) || ledger.schemaVersion !== 1 || !Array.isArray(ledger.sessions)) {
    fail(errors, "release/provenance-ledger.json: expected schemaVersion 1 with sessions.");
    return new Map();
  }
  const entries = new Map();
  for (const entry of ledger.sessions) {
    if (!isRecord(entry) || typeof entry.path !== "string") {
      fail(errors, "release/provenance-ledger.json: every session requires a path.");
      continue;
    }
    if (entries.has(entry.path)) fail(errors, `release/provenance-ledger.json: duplicate session ${entry.path}.`);
    entries.set(entry.path, entry);
  }
  return entries;
}

function validateProvenance(ref, sourceSession, provenance, requiredPaths, facts, errors, now) {
  const label = `${sessionPath(ref)}/provenance`;
  if (!isRecord(provenance)) {
    fail(errors, `${label}: missing ledger entry.`);
    return;
  }
  if (!new Set(["historical", "featured"]).has(provenance.publicationState)) {
    fail(errors, `${label}: forbidden public state ${provenance.publicationState}.`);
  }
  for (const field of ["sourceEventStartAt", "sourceEventEndAt", "retrievedAtMin", "retrievedAtMax", "generatedAt"]) {
    if (!utcTimestamp(provenance[field])) fail(errors, `${label}: ${field} must be an RFC 3339 UTC timestamp.`);
  }
  const startAt = Date.parse(provenance.sourceEventStartAt);
  const endAt = Date.parse(provenance.sourceEventEndAt);
  const retrievedAtMin = Date.parse(provenance.retrievedAtMin);
  const retrievedAtMax = Date.parse(provenance.retrievedAtMax);
  const generatedAt = Date.parse(provenance.generatedAt);
  if (!sourceSession || !sameSessionRef(sourceSession, ref)) fail(errors, `${label}: indexed session does not match an OpenF1 source session.`);
  else {
    if (!sourceSession.buildReady) fail(errors, `${label}: indexed OpenF1 source session is not buildReady.`);
    if (!sameInstant(sourceSession.startDate, provenance.sourceEventStartAt)
      || !sameInstant(sourceSession.endDate, provenance.sourceEventEndAt)) {
      fail(errors, `${label}: source event timestamps do not match the OpenF1 source manifest.`);
    }
  }
  if (Number.isFinite(startAt) && Number.isFinite(endAt) && endAt < startAt) fail(errors, `${label}: sourceEventEndAt precedes sourceEventStartAt.`);
  if (Number.isFinite(endAt) && Number.isFinite(generatedAt) && endAt > generatedAt) fail(errors, `${label}: future session is publicly indexed.`);
  if (Number.isFinite(endAt) && endAt > now) fail(errors, `${label}: sourceEventEndAt is in the future.`);
  if (Number.isFinite(generatedAt) && generatedAt > now) fail(errors, `${label}: generatedAt is in the future.`);
  if (provenance.publicationState === "featured" && Number.isFinite(endAt) && Number.isFinite(generatedAt)
    && generatedAt - endAt > 168 * 60 * 60 * 1000) {
    fail(errors, `${label}: featured session was generated outside the 168-hour publication window.`);
  }
  if (provenance.publicationState === "featured" && Number.isFinite(endAt) && now - endAt > 168 * 60 * 60 * 1000) {
    fail(errors, `${label}: featured session is stale at audit time.`);
  }
  if (Number.isFinite(retrievedAtMin) && Number.isFinite(retrievedAtMax) && retrievedAtMax < retrievedAtMin) fail(errors, `${label}: retrievedAtMax precedes retrievedAtMin.`);
  if (Number.isFinite(generatedAt) && Number.isFinite(retrievedAtMax) && generatedAt < retrievedAtMax) fail(errors, `${label}: generatedAt precedes source retrieval.`);
  if (!isRecord(provenance.terminalOutcome) || provenance.terminalOutcome.status !== "completed" || !utcTimestamp(provenance.terminalOutcome.observedAt)) {
    fail(errors, `${label}: explicit completed terminal outcome with observedAt is required.`);
  } else {
    const observedAt = Date.parse(provenance.terminalOutcome.observedAt);
    if ((Number.isFinite(endAt) && observedAt < endAt) || (Number.isFinite(retrievedAtMax) && observedAt > retrievedAtMax)) {
      fail(errors, `${label}: terminal outcome must be observed after completion and within the retrieval window.`);
    }
  }
  if (!Array.isArray(provenance.sources) || !provenance.sources.length) {
    fail(errors, `${label}: at least one source provenance record is required.`);
  } else {
    for (const source of provenance.sources) {
      if (!isRecord(source) || typeof source.provider !== "string" || !source.provider.length
        || typeof source.identifier !== "string" || !source.identifier.length
        || !utcTimestamp(source.retrievedAt) || !/^[a-f0-9]{64}$/.test(source.responseSha256 ?? "")
        || source.rightsStatus !== "approved"
        || typeof source.rightsReference !== "string" || !source.rightsReference.length) {
        fail(errors, `${label}: source records require provider, identifier, retrievedAt, responseSha256, approved rightsStatus, and rightsReference.`);
      } else {
        const retrievedAt = Date.parse(source.retrievedAt);
        if ((Number.isFinite(retrievedAtMin) && retrievedAt < retrievedAtMin) || (Number.isFinite(retrievedAtMax) && retrievedAt > retrievedAtMax)) {
          fail(errors, `${label}: source retrievedAt falls outside the declared retrieval range.`);
        }
      }
    }
  }
  if (!isRecord(provenance.generator) || typeof provenance.generator.name !== "string" || !provenance.generator.name.length
    || typeof provenance.generator.version !== "string" || !provenance.generator.version.length) {
    fail(errors, `${label}: generator name and version are required.`);
  }
  if (!isRecord(provenance.artifacts)) {
    fail(errors, `${label}: artifact digest ledger is required.`);
    return;
  }
  const artifactPaths = Object.keys(provenance.artifacts).sort();
  if (JSON.stringify(artifactPaths) !== JSON.stringify(requiredPaths)) fail(errors, `${label}: artifact digest paths do not exactly match the required pack.`);
  for (const relativePath of requiredPaths) {
    if (!/^[a-f0-9]{64}$/.test(provenance.artifacts[relativePath] ?? "")) fail(errors, `${label}: missing SHA-256 for ${relativePath}.`);
  }
  const expectedPackSha256 = createHash("sha256")
    .update(`${JSON.stringify(requiredPaths.map((relativePath) => [relativePath, provenance.artifacts[relativePath]]))}\n`)
    .digest("hex");
  if (provenance.packSha256 !== expectedPackSha256) fail(errors, `${label}: pack SHA-256 mismatch.`);
  const coverage = provenance.coverage;
  if (!isRecord(coverage) || coverage.status !== "complete") {
    fail(errors, `${label}: complete coverage ledger is required.`);
    return;
  }
  if (!utcTimestamp(coverage.observedStartAt) || !utcTimestamp(coverage.observedEndAt)
    || Date.parse(coverage.observedEndAt) < Date.parse(coverage.observedStartAt)) {
    fail(errors, `${label}: coverage requires an ordered UTC observation window.`);
  } else if (Date.parse(coverage.observedStartAt) < startAt || Date.parse(coverage.observedEndAt) > endAt) {
    fail(errors, `${label}: coverage observation window falls outside the source event window.`);
  }
  if (coverage.frameCount !== facts.frameCount
    || coverage.expectedDriverCount !== facts.expectedDriverCount
    || coverage.observedDriverCount !== facts.observedDriverCount
    || coverage.expectedResultCount !== facts.expectedResultCount
    || coverage.observedResultCount !== facts.observedResultCount) {
    fail(errors, `${label}: coverage counts do not match the audited pack.`);
  }
  if (facts.expectedDriverCount !== facts.observedDriverCount || facts.expectedResultCount !== facts.observedResultCount) {
    fail(errors, `${label}: expected and observed driver/result coverage must be equal.`);
  }
  if (!Array.isArray(coverage.limitations) || coverage.limitations.some((entry) => typeof entry !== "string")) {
    fail(errors, `${label}: coverage limitations must be a string array.`);
  }
  if (!isRecord(coverage.requiredArtifacts)
    || JSON.stringify(Object.keys(coverage.requiredArtifacts).sort()) !== JSON.stringify(requiredPaths)
    || requiredPaths.some((relativePath) => coverage.requiredArtifacts[relativePath] !== "complete")) {
    fail(errors, `${label}: every required artifact must have complete coverage.`);
  }
}

async function auditSession(paths, ref, sourceSession, provenance, errors, now) {
  const relativeBase = sessionPath(ref);
  const sessionRoot = path.join(paths.publicData, relativeBase);
  const required = new Set(["manifest.json", "summary.json", "drivers.json", "laps.json", "results.json", "stints.json", "strategy.json", "weather.json", "replay.meta.json", "replay.laps.json", "replay.race-control.json"]);
  const manifestPayload = await readJson(path.join(sessionRoot, "manifest.json"), errors, `${relativeBase}/manifest.json`);
  const manifest = parse(SessionManifestSchema, manifestPayload, errors, `${relativeBase}/manifest.json`);
  if (manifest && manifest.sessionKey !== ref.sessionKey) fail(errors, `${relativeBase}/manifest.json: sessionKey mismatch.`);
  if (isRecord(manifestPayload) && Object.hasOwn(manifestPayload, "replay")) fail(errors, `${relativeBase}/manifest.json: replay.json is forbidden; use replay.meta.json and replay.frames/.`);
  if (manifest) {
    const canonicalMembers = {
      summary: "summary.json",
      drivers: "drivers.json",
      laps: "laps.json",
      strategy: "strategy.json",
      stints: "stints.json",
    };
    for (const [field, canonicalPath] of Object.entries(canonicalMembers)) {
      if (manifest[field] !== canonicalPath) fail(errors, `${relativeBase}/manifest.json: ${field} must reference ${canonicalPath}.`);
    }
    const comparePaths = Object.values(manifest.compare);
    requireUnique(comparePaths, errors, `${relativeBase}/manifest.json compare paths`);
    if (comparePaths.some((relativePath) => !/^compare\/[a-z0-9-]+\.json$/.test(relativePath))) {
      fail(errors, `${relativeBase}/manifest.json: compare paths must use compare/<slug>.json.`);
    }
    for (const member of collectStringPaths({
      summary: manifest.summary,
      drivers: manifest.drivers,
      laps: manifest.laps,
      strategy: manifest.strategy,
      stints: manifest.stints,
      compare: manifest.compare,
    })) required.add(member);
  }
  const members = [...required].sort();
  const memberPaths = [];
  for (const member of members) {
    const filePath = await assertFile(sessionRoot, member, errors, relativeBase);
    if (filePath) memberPaths.push([member, filePath]);
  }
  const payloads = new Map(await Promise.all(memberPaths.map(async ([member, filePath]) => [member, await readJson(filePath, errors, `${relativeBase}/${member}`)])));
  const summary = parse(SessionSummarySchema, payloads.get("summary.json"), errors, `${relativeBase}/summary.json`);
  if (summary && !sameSession(summary, ref)) fail(errors, `${relativeBase}/summary.json: season, sessionKey, or trackId mismatch.`);
  const driversPayload = payloads.get("drivers.json");
  const drivers = [];
  if (!Array.isArray(driversPayload) || !driversPayload.length) fail(errors, `${relativeBase}/drivers.json: expected a non-empty array.`);
  else driversPayload.forEach((driver, index) => {
    const parsed = parse(DriverSummarySchema, driver, errors, `${relativeBase}/drivers.json[${index}]`);
    if (parsed) drivers.push(parsed);
  });
  const driverCodes = drivers.map((driver) => driver.driverCode);
  requireUnique(driverCodes, errors, `${relativeBase}/drivers.json driverCode`);
  requireUnique(drivers.map((driver) => driver.driverNumber), errors, `${relativeBase}/drivers.json driverNumber`);
  if (summary) {
    requireUnique(summary.drivers, errors, `${relativeBase}/summary.json drivers`);
    if (!sameUniqueStrings(summary.drivers, driverCodes)) fail(errors, `${relativeBase}/drivers.json: driver coverage does not match summary.json.`);
  }
  const resultsPayload = payloads.get("results.json");
  if (!Array.isArray(resultsPayload) || !resultsPayload.length
    || resultsPayload.some((entry) => !isRecord(entry) || typeof entry.driverCode !== "string" || !entry.driverCode.length || !Number.isInteger(entry.position) || entry.position < 1)) {
    fail(errors, `${relativeBase}/results.json: expected normalized non-empty session results.`);
  } else {
    requireUnique(resultsPayload.map((entry) => entry.driverCode), errors, `${relativeBase}/results.json driverCode`);
    requireUnique(resultsPayload.map((entry) => entry.position), errors, `${relativeBase}/results.json position`);
    if (!sameUniqueStrings(resultsPayload.map((entry) => entry.driverCode), driverCodes)) fail(errors, `${relativeBase}/results.json: driver coverage does not match drivers.json.`);
  }
  const weatherPayload = payloads.get("weather.json");
  if (!Array.isArray(weatherPayload) || !weatherPayload.length
    || weatherPayload.some((entry) => !isRecord(entry) || !utcTimestamp(entry.at))) {
    fail(errors, `${relativeBase}/weather.json: expected normalized non-empty UTC weather coverage.`);
  }
  const lapsPayload = payloads.get("laps.json");
  const laps = [];
  if (!Array.isArray(lapsPayload) || !lapsPayload.length) fail(errors, `${relativeBase}/laps.json: expected non-empty lap records.`);
  else lapsPayload.forEach((lap, index) => {
    const parsed = parse(LapRecordSchema, lap, errors, `${relativeBase}/laps.json[${index}]`);
    if (parsed) laps.push(parsed);
  });
  requireUnique(laps.map((lap) => `${lap.driverCode}:${lap.lapNumber}`), errors, `${relativeBase}/laps.json driver/lap`);
  for (const lap of laps) {
    const driver = drivers.find((entry) => entry.driverCode === lap.driverCode);
    if (!driver || driver.driverNumber !== lap.driverNumber) fail(errors, `${relativeBase}/laps.json: ${lap.driverCode} is unknown or has a mismatched driverNumber.`);
  }
  const stints = parse(StintPackSchema, payloads.get("stints.json"), errors, `${relativeBase}/stints.json`);
  if (stints) {
    if (stints.sessionKey !== ref.sessionKey || stints.trackId !== ref.trackId) fail(errors, `${relativeBase}/stints.json: sessionKey or trackId mismatch.`);
    requireUnique(stints.drivers.map((driver) => driver.driverCode), errors, `${relativeBase}/stints.json driverCode`);
    for (const driver of stints.drivers) {
      if (!driverCodes.includes(driver.driverCode)) fail(errors, `${relativeBase}/stints.json: unknown driver ${driver.driverCode}.`);
      requireUnique(driver.stints.map((stint) => stint.stintNumber), errors, `${relativeBase}/stints.json ${driver.driverCode} stintNumber`);
      let previousLapEnd = 0;
      for (const stint of [...driver.stints].sort((left, right) => left.stintNumber - right.stintNumber)) {
        if (stint.lapStart > stint.lapEnd || stint.lapStart <= previousLapEnd) fail(errors, `${relativeBase}/stints.json: ${driver.driverCode} has inverted or overlapping stints.`);
        previousLapEnd = stint.lapEnd;
      }
    }
  }
  const strategy = parse(StrategyPackSchema, payloads.get("strategy.json"), errors, `${relativeBase}/strategy.json`);
  if (strategy && strategy.trackId !== ref.trackId) fail(errors, `${relativeBase}/strategy.json: trackId mismatch.`);
  const replayMeta = parse(ReplayMetaSchema, payloads.get("replay.meta.json"), errors, `${relativeBase}/replay.meta.json`);
  if (replayMeta && !sameSession(replayMeta, ref)) fail(errors, `${relativeBase}/replay.meta.json: season, sessionKey, or trackId mismatch.`);
  if (replayMeta?.laps.length || replayMeta?.raceControlMessages?.length) {
    fail(errors, `${relativeBase}/replay.meta.json: laps and raceControlMessages must remain in split artifacts.`);
  }
  const replayLaps = parse(ReplayPackSchema.shape.laps, payloads.get("replay.laps.json"), errors, `${relativeBase}/replay.laps.json`);
  if (replayLaps) {
    requireUnique(replayLaps.map((lap) => `${lap.driverCode}:${lap.lapNumber}`), errors, `${relativeBase}/replay.laps.json driver/lap`);
    const lastLapByDriver = new Map();
    for (const lap of replayLaps) {
      if (!driverCodes.includes(lap.driverCode)) fail(errors, `${relativeBase}/replay.laps.json: unknown driver ${lap.driverCode}.`);
      const previousLap = lastLapByDriver.get(lap.driverCode);
      if (previousLap !== undefined && lap.lapNumber < previousLap) fail(errors, `${relativeBase}/replay.laps.json: ${lap.driverCode} laps are unordered.`);
      lastLapByDriver.set(lap.driverCode, lap.lapNumber);
    }
  }
  const raceControl = parse(ReplayPackSchema.shape.raceControlMessages.unwrap(), payloads.get("replay.race-control.json"), errors, `${relativeBase}/replay.race-control.json`);
  if (manifest) {
    for (const relativePath of Object.values(manifest.compare)) {
      const compare = parse(ComparePackSchema, payloads.get(relativePath), errors, `${relativeBase}/${relativePath}`);
      if (!compare) continue;
      if (compare.trackId !== ref.trackId) fail(errors, `${relativeBase}/${relativePath}: trackId mismatch.`);
      if (new Set(compare.drivers).size !== compare.drivers.length) fail(errors, `${relativeBase}/${relativePath}: compare drivers must be distinct.`);
      for (let index = 0; index < compare.drivers.length; index += 1) {
        const driverCode = compare.drivers[index];
        const lapNumber = compare.laps[index];
        if (!driverCodes.includes(driverCode) || !laps.some((lap) => lap.driverCode === driverCode && lap.lapNumber === lapNumber)) {
          fail(errors, `${relativeBase}/${relativePath}: compare driver/lap ${driverCode}:${lapNumber} is not in the session pack.`);
        }
      }
      const allowedDrivers = new Set(compare.drivers);
      for (const leader of compare.deltaSections.map((section) => section.leader)) {
        if (!allowedDrivers.has(leader)) fail(errors, `${relativeBase}/${relativePath}: unknown delta leader ${leader}.`);
      }
      for (const event of compare.events) {
        if (!allowedDrivers.has(event.driver)) fail(errors, `${relativeBase}/${relativePath}: unknown event driver ${event.driver}.`);
      }
      if (compare.telemetry
        && (compare.telemetry.left.driverCode !== compare.drivers[0]
          || compare.telemetry.left.lapNumber !== compare.laps[0]
          || compare.telemetry.right.driverCode !== compare.drivers[1]
          || compare.telemetry.right.lapNumber !== compare.laps[1])) {
        fail(errors, `${relativeBase}/${relativePath}: telemetry does not match the declared compare pair.`);
      }
    }
  }
  if (raceControl) requireOrdered(raceControl, (left, right) => left.t - right.t, errors, `${relativeBase}/replay.race-control.json`);
  if (ref.sessionSlug === "race" && !raceControl?.some((entry) => /chequered|checkered/i.test(`${entry?.flag ?? ""} ${entry?.message ?? ""}`))) {
    fail(errors, `${relativeBase}/replay.race-control.json: completed race lacks chequered-flag evidence.`);
  }
  const frames = [];
  if (replayMeta) {
    const chunks = [...replayMeta.frameChunkIndex].sort((left, right) => left.index - right.index);
    const chunkPaths = chunks.map((entry) => entry.path);
    const expectedChunkCount = Math.ceil(replayMeta.frameCount / replayMeta.frameChunkSize);
    if (chunks.length !== expectedChunkCount) {
      fail(errors, `${relativeBase}/replay.meta.json: frame chunk count does not cover frameCount at frameChunkSize.`);
    }
    if (JSON.stringify(chunkPaths) !== JSON.stringify(replayMeta.frameChunks) || new Set(chunkPaths).size !== chunkPaths.length) {
      fail(errors, `${relativeBase}/replay.meta.json: frame chunk lists are inconsistent or duplicated.`);
    }
    let previousTime = null;
    let previousChunkFrames = null;
    const replayMetaDriverCodes = replayMeta.drivers.map((driver) => driver.driverCode);
    requireUnique(replayMetaDriverCodes, errors, `${relativeBase}/replay.meta.json driverCode`);
    requireUnique(replayMeta.drivers.map((driver) => driver.driverNumber), errors, `${relativeBase}/replay.meta.json driverNumber`);
    const replayDriversByCode = new Map(replayMeta.drivers.map((driver) => [driver.driverCode, driver]));
    for (const replayDriver of replayMeta.drivers) {
      const sessionDriver = drivers.find((driver) => driver.driverCode === replayDriver.driverCode);
      if (!sessionDriver
        || replayDriver.driverNumber !== sessionDriver.driverNumber
        || replayDriver.fullName !== sessionDriver.fullName
        || replayDriver.team !== sessionDriver.team) {
        fail(errors, `${relativeBase}/replay.meta.json: driver identity does not match drivers.json.`);
      }
    }
    for (let index = 0; index < chunks.length; index += 1) {
      const entry = chunks[index];
      if (entry.index !== index) fail(errors, `${relativeBase}/replay.meta.json: missing chunk index ${index}.`);
      if (entry.fromTime > entry.toTime) fail(errors, `${relativeBase}/replay.meta.json: chunk ${index} has an inverted time range.`);
      const chunkPath = await assertFile(sessionRoot, entry.path, errors, relativeBase);
      if (!chunkPath) continue;
      required.add(entry.path);
      const chunk = parse(ReplayFrameChunkSchema, await readJson(chunkPath, errors, `${relativeBase}/${entry.path}`), errors, `${relativeBase}/${entry.path}`);
      if (!chunk) continue;
      if (chunk.index !== entry.index || chunk.fromTime !== entry.fromTime || chunk.toTime !== entry.toTime) fail(errors, `${relativeBase}/${entry.path}: metadata mismatch.`);
      if (chunk.frames[0]?.t !== entry.fromTime || chunk.frames.at(-1)?.t !== entry.toTime) fail(errors, `${relativeBase}/${entry.path}: frame bounds do not match metadata.`);
      if (chunk.frames.length > replayMeta.frameChunkSize || (index < chunks.length - 1 && chunk.frames.length !== replayMeta.frameChunkSize)) {
        fail(errors, `${relativeBase}/${entry.path}: frame count does not match frameChunkSize.`);
      }
      if (previousTime !== null && chunk.frames[0]?.t <= previousTime) fail(errors, `${relativeBase}/${entry.path}: chunk coverage overlaps or is unordered.`);
      if (previousChunkFrames?.length >= 2) {
        const cadence = previousChunkFrames.at(-1).t - previousChunkFrames.at(-2).t;
        if (cadence > 0 && chunk.frames[0]?.t - previousTime !== cadence) fail(errors, `${relativeBase}/${entry.path}: frame chunk coverage has a gap.`);
      }
      for (const frame of chunk.frames) {
        if (!sameUniqueStrings(Object.keys(frame.drivers), replayMetaDriverCodes)) {
          fail(errors, `${relativeBase}/${entry.path}: frame driver coverage does not match replay metadata.`);
        }
        for (const [driverCode, driver] of Object.entries(frame.drivers)) {
          const replayDriver = replayDriversByCode.get(driverCode);
          if (!replayDriver
            || driver.driverCode !== driverCode
            || driver.driverNumber !== replayDriver.driverNumber
            || driver.team !== replayDriver.team) {
            fail(errors, `${relativeBase}/${entry.path}: frame contains an unknown or mismatched driver.`);
          }
        }
      }
      previousTime = chunk.frames.at(-1)?.t ?? previousTime;
      previousChunkFrames = chunk.frames;
      frames.push(...chunk.frames);
    }
    if (new Set(frames.map((frame) => frame.t)).size !== replayMeta.frameCount || frames.length !== replayMeta.frameCount) fail(errors, `${relativeBase}/replay.meta.json: chunk frames do not exactly cover frameCount.`);
    if ((frames[0]?.t ?? Infinity) > 0.01) fail(errors, `${relativeBase}/replay.meta.json: chunks do not start at the beginning.`);
    if (frames.at(-1)?.t !== replayMeta.totalTime) fail(errors, `${relativeBase}/replay.meta.json: chunks do not exactly reach totalTime.`);
    if (!sameUniqueStrings(replayMetaDriverCodes, driverCodes)) fail(errors, `${relativeBase}/replay.meta.json: driver coverage does not match drivers.json.`);
    if (replayLaps) {
      const totalLaps = Math.max(0, ...replayLaps.map((lap) => lap.lapNumber));
      if (replayMeta.totalLaps !== totalLaps) fail(errors, `${relativeBase}/replay.meta.json: totalLaps does not match replay.laps.json.`);
      if (replayMeta.fastestLap && !replayLaps.some((lap) => lap.driverCode === replayMeta.fastestLap.driverCode
        && lap.lapNumber === replayMeta.fastestLap.lapNumber
        && lap.lapTime === replayMeta.fastestLap.lapTime
        && lap.compound === replayMeta.fastestLap.compound)) {
        fail(errors, `${relativeBase}/replay.meta.json: fastestLap is not present in replay.laps.json.`);
      }
    }
  }
  if (replayLaps && !sameUniqueStrings(replayLaps.map((lap) => `${lap.driverCode}:${lap.lapNumber}`), laps.map((lap) => `${lap.driverCode}:${lap.lapNumber}`))) {
    fail(errors, `${relativeBase}/replay.laps.json: driver/lap coverage does not match laps.json.`);
  }
  const expectedDriverCodes = replayMeta?.drivers.map((driver) => driver.driverCode) ?? drivers.map((driver) => driver.driverCode);
  const observedDriverCodes = [...new Set(frames.flatMap((frame) => Object.keys(frame.drivers)))];
  const resultCount = Array.isArray(resultsPayload) ? resultsPayload.length : 0;
  const digestPaths = [...required].sort().map((member) => `${relativeBase}/${member}`);
  const actualPackPaths = (await walk(sessionRoot)).map((member) => `${relativeBase}/${member}`).sort();
  if (actualPackPaths.some((member) => isReplayJsonPath(member))) {
    fail(errors, `${relativeBase}: replay.json is forbidden in an emitted session pack.`);
  }
  if (JSON.stringify(actualPackPaths) !== JSON.stringify(digestPaths)) {
    fail(errors, `${relativeBase}/provenance: artifact digest paths do not exactly match the emitted session pack.`);
  }
  validateProvenance(ref, sourceSession, provenance, digestPaths, {
    frameCount: replayMeta?.frameCount ?? 0,
    expectedDriverCount: expectedDriverCodes.length,
    observedDriverCount: observedDriverCodes.length,
    expectedResultCount: expectedDriverCodes.length,
    observedResultCount: resultCount,
  }, errors, now);
  for (const relativePath of digestPaths) {
    const filePath = await assertFile(paths.publicData, relativePath, errors, "digest");
    if (filePath && provenance?.artifacts?.[relativePath] && await sha256(filePath) !== provenance.artifacts[relativePath]) fail(errors, `digest mismatch: data/${relativePath}`);
  }
}

async function auditArtifactProjection(paths, errors) {
  const projectedFiles = await walk(paths.publicRoot);
  for (const relativePath of projectedFiles) {
    const projected = await assertFile(paths.publicRoot, relativePath, errors, "public projection");
    const emitted = await assertFile(paths.artifactRoot, relativePath, errors, "built public projection");
    if (projected && emitted && await sha256(projected) !== await sha256(emitted)) {
      fail(errors, `built public projection mismatch: ${relativePath}`);
    }
  }
}

async function auditModels(paths, errors) {
  const catalogPath = path.join(paths.publicData, "packs", "cars", "catalog.json");
  const catalog = parse(CarModelCatalogSchema, await readJson(catalogPath, errors, "packs/cars/catalog.json"), errors, "packs/cars/catalog.json");
  if (!catalog) return new Set();
  requireUnique(catalog.models.map((model) => model.id), errors, "packs/cars/catalog.json model IDs");
  for (const model of catalog.models) {
    const modelPath = typeof model?.file === "string" ? model.file.replace(/^\//, "") : null;
    const posterPath = typeof model?.poster === "string" ? model.poster.replace(/^\//, "") : null;
    if (!modelPath || !modelPath.startsWith("models/")) fail(errors, "packs/cars/catalog.json: model file must be a public /models path.");
    else await assertFile(paths.publicRoot, modelPath, errors, "model reference");
    if (!posterPath || !new Set(["posters/", "images/"]).has(posterPath.slice(0, posterPath.indexOf("/") + 1))) {
      fail(errors, "packs/cars/catalog.json: poster file must be a public /posters or /images path.");
    } else await assertFile(paths.publicRoot, posterPath, errors, "poster reference");
  }
  return new Set(catalog.models.map((model) => model.id));
}

async function assertPublicDataReference(paths, publicPath, errors, label) {
  if (typeof publicPath !== "string" || !publicPath.startsWith("/data/") || publicPath.includes("\\")) {
    fail(errors, `${label}: expected a public /data path.`);
    return;
  }
  await assertFile(paths.publicData, publicPath.slice("/data/".length), errors, label);
}

async function auditSimulationPacks(paths, modelIds, errors) {
  const simsRoot = path.join(paths.publicData, "packs", "sims");
  const sourceLabel = "packs/sims/fs-cfd-database-source.json";
  const source = parse(WindOverlayPackSchema, await readJson(path.join(paths.publicData, sourceLabel), errors, sourceLabel), errors, sourceLabel);
  if (source) {
    requireUnique(source.scenarios.map((scenario) => scenario.id), errors, `${sourceLabel} scenario IDs`);
    for (const scenario of source.scenarios) {
      requireUnique(scenario.fields, errors, `${sourceLabel} ${scenario.id} fields`);
      if (scenario.velocityRangeMps && scenario.velocityRangeMps[1] < scenario.velocityRangeMps[0]) {
        fail(errors, `${sourceLabel}: ${scenario.id} has an inverted velocity range.`);
      }
    }
  }

  const exampleLabel = "packs/sims/f1-cfd-overlay.schema.example.json";
  parse(CfdOverlaySchemaExampleSchema, await readJson(path.join(paths.publicData, exampleLabel), errors, exampleLabel), errors, exampleLabel);
  const starterLabel = "packs/sims/openfoam-starter-case.json";
  const starter = parse(OpenFoamStarterCaseSchema, await readJson(path.join(paths.publicData, starterLabel), errors, starterLabel), errors, starterLabel);
  if (starter) requireUnique(starter.requiredUserInputs.map((input) => input.id), errors, `${starterLabel} required input IDs`);

  const scenarioPaths = (await walk(simsRoot)).filter((relativePath) => /^openfoam\/.+\.json$/.test(relativePath));
  const scenarioIds = [];
  for (const relativePath of scenarioPaths) {
    const label = `packs/sims/${relativePath}`;
    const scenario = parse(CfdOverlaySchemaExampleSchema, await readJson(path.join(simsRoot, relativePath), errors, label), errors, label);
    if (!scenario) continue;
    scenarioIds.push(`${scenario.modelId}:${scenario.scenarioId}`);
    if (!utcTimestamp(scenario.generatedAt)) fail(errors, `${label}: generatedAt must be an RFC 3339 UTC timestamp.`);
    if (!modelIds.has(scenario.modelId)) fail(errors, `${label}: unknown modelId ${scenario.modelId}.`);
    if (scenario.meshBinding.triangleCount <= 0) fail(errors, `${label}: meshBinding.triangleCount must be positive.`);
    if (scenario.colorScale.min >= scenario.colorScale.max) fail(errors, `${label}: colorScale.min must be less than colorScale.max.`);
    const fieldNames = scenario.scalarFields.map((field) => field.name);
    requireUnique(fieldNames, errors, `${label} scalar field names`);
    if (!fieldNames.includes(scenario.metric)) fail(errors, `${label}: metric ${scenario.metric} does not identify a scalar field.`);
    for (const field of scenario.scalarFields) {
      if (field.stats.min > field.stats.max || field.stats.mean < field.stats.min || field.stats.mean > field.stats.max) {
        fail(errors, `${label}: ${field.name} statistics are inconsistent.`);
      }
      if (!field.storage) fail(errors, `${label}: ${field.name} requires public storage.`);
      else await assertPublicDataReference(paths, field.storage.path, errors, `${label} ${field.name} storage`);
    }
    requireUnique(scenario.overlays.streamlines.map((entry) => entry.id), errors, `${label} streamline IDs`);
    requireUnique(scenario.overlays.hotspots.map((entry) => entry.id), errors, `${label} hotspot IDs`);
    for (const hotspot of scenario.overlays.hotspots) {
      if (!fieldNames.includes(hotspot.field)) fail(errors, `${label}: hotspot ${hotspot.id} references unknown field ${hotspot.field}.`);
    }
    for (const [name, artifactPath] of Object.entries(scenario.artifacts ?? {})) {
      if (artifactPath !== undefined) await assertPublicDataReference(paths, artifactPath, errors, `${label} ${name}`);
    }
  }
  requireUnique(scenarioIds, errors, "packs/sims/openfoam scenario IDs");
}

async function auditReleaseRecord(paths, errors, now) {
  const record = await readJson(paths.releaseRecord, errors, "release-record.json");
  const manifest = await readJson(paths.releaseManifest, errors, "release-manifest.json");
  if (!isRecord(record) || !isRecord(manifest)) return;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
    fail(errors, "release-manifest.json: schemaVersion 1 and entries are required.");
    return;
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit ?? "") || !utcTimestamp(manifest.generatedAt)) fail(errors, "release-manifest.json: sourceCommit and generatedAt are required.");
  else if (Date.parse(manifest.generatedAt) > now) fail(errors, "release-manifest.json: generatedAt is in the future.");
  if (manifest.canonicalHostname !== canonicalHostname) fail(errors, `release-manifest.json: canonicalHostname must be ${canonicalHostname}.`);
  const expectedAssetDigest = createHash("sha256").update(`${JSON.stringify(manifest.entries)}\n`).digest("hex");
  const expectedDigest = createHash("sha256").update(`${manifest.sourceCommit}\n${JSON.stringify(manifest.entries)}\n`).digest("hex");
  if (manifest.manifestSha256 !== expectedDigest || manifest.releaseId !== `sha256-${expectedDigest}`) fail(errors, "release-manifest.json: release ID or manifest SHA-256 mismatch.");
  if (manifest.assetManifestSha256 !== expectedAssetDigest || manifest.assetReleaseId !== `sha256-${expectedAssetDigest}`) fail(errors, "release-manifest.json: asset release ID or asset manifest SHA-256 mismatch.");
  const actualFiles = (await walk(paths.artifactRoot)).filter((relativePath) => relativePath !== "release-manifest.json").sort();
  if (actualFiles.some((entryPath) => isReplayJsonPath(entryPath))) {
    fail(errors, "release-manifest.json: replay.json is forbidden in the built release unit.");
  }
  const listedPaths = manifest.entries.map((entry) => entry?.path);
  const sortedPaths = [...listedPaths].sort();
  if (JSON.stringify(listedPaths) !== JSON.stringify(sortedPaths)) fail(errors, "release-manifest.json: artifact entries must use canonical path order.");
  if (JSON.stringify(actualFiles) !== JSON.stringify(sortedPaths) || new Set(listedPaths).size !== listedPaths.length) fail(errors, "release-manifest.json: indexed artifact paths do not exactly match the built release unit.");
  for (const entry of manifest.entries) {
    if (!isRecord(entry) || typeof entry.path !== "string" || !Number.isInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) {
      fail(errors, "release-manifest.json: invalid artifact entry.");
      continue;
    }
    const filePath = await assertFile(paths.artifactRoot, entry.path, errors, "release manifest");
    if (entry.mimeType !== mimeType(entry.path) || entry.cachePolicy !== cachePolicy(entry.path)) fail(errors, `release-manifest.json: metadata mismatch for ${entry.path}.`);
    if (filePath && ((await stat(filePath)).size !== entry.bytes || await sha256(filePath) !== entry.sha256)) fail(errors, `release-manifest.json: digest or size mismatch for ${entry.path}.`);
  }
  const measurements = await summarizeArtifactMeasurements(manifest.entries, paths.artifactRoot);
  if (manifest.fileCount !== manifest.entries.length || manifest.totalBytes !== measurements.outputBytes
    || JSON.stringify(manifest.measurements) !== JSON.stringify(measurements)) {
    fail(errors, "release-manifest.json: count, size, or budget measurements do not match entries.");
  }
  for (const error of artifactBudgetErrors(manifest.entries)) fail(errors, `release-manifest.json: ${error}`);
  try {
    const data = await summarizeReleaseData(paths.artifactRoot);
    if (JSON.stringify(manifest.data) !== JSON.stringify(data)) fail(errors, "release-manifest.json: provenance or freshness summary mismatch.");
  } catch (error) {
    fail(errors, `release-manifest.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (record.schemaVersion !== 1 || record.releaseId !== manifest.releaseId || record.assetReleaseId !== manifest.assetReleaseId || record.manifestSha256 !== manifest.manifestSha256) fail(errors, "release-record.json: release identity does not match release-manifest.json.");
  if (record.sourceCommit !== manifest.sourceCommit || record.generatedAt !== manifest.generatedAt || record.canonicalHostname !== manifest.canonicalHostname || record.publishedAt !== null
    || record.previousReleaseId !== null || record.promotion !== null) {
    fail(errors, "release-record.json: candidate source, timestamps, or unpromoted state do not match release-manifest.json.");
  }
  const expectedFeatured = manifest.data?.latestPath
    ? { status: "featured", path: manifest.data.latestPath, selectedBy: ["sourceEventEndAt desc", "sessionKey desc", "path asc"] }
    : { status: "none", path: null, selectedBy: ["sourceEventEndAt desc", "sessionKey desc", "path asc"] };
  if (JSON.stringify(record.featured) !== JSON.stringify(expectedFeatured)) fail(errors, "release-record.json: featured state does not match audited release data.");
  const commands = record.gateEvidence?.commands;
  const expectedCommands = [
    "npm run quality",
    "npm run check:featured",
    "python -m py_compile backend/main.py",
    "npm run build",
    "npm run smoke:static",
  ].map((command) => ({ command, status: "passed" }));
  if (!isRecord(record.gateEvidence) || typeof record.gateEvidence.node !== "string" || !record.gateEvidence.node.length
    || typeof record.gateEvidence.platform !== "string" || !record.gateEvidence.platform.length
    || JSON.stringify(commands) !== JSON.stringify(expectedCommands)) {
    fail(errors, "release-record.json: passing candidate gate evidence is required.");
  }
}

function eligibleLatestRace(ref, provenance, now) {
  if (ref.sessionSlug !== "race" || !isRecord(provenance) || !new Set(["historical", "featured"]).has(provenance.publicationState)) return false;
  const startAt = Date.parse(provenance.sourceEventStartAt);
  const endAt = Date.parse(provenance.sourceEventEndAt);
  const generatedAt = Date.parse(provenance.generatedAt);
  return Number.isFinite(startAt)
    && Number.isFinite(endAt)
    && Number.isFinite(generatedAt)
    && startAt <= endAt
    && endAt <= generatedAt
    && generatedAt <= now
    && generatedAt - endAt <= 168 * 60 * 60 * 1000
    && now - endAt <= 168 * 60 * 60 * 1000;
}

function compareLatest(left, right, provenance) {
  const endDifference = Date.parse(provenance.get(right.path).sourceEventEndAt) - Date.parse(provenance.get(left.path).sourceEventEndAt);
  if (endDifference) return endDifference;
  if (left.sessionKey !== right.sessionKey) return right.sessionKey - left.sessionKey;
  return compareCodeUnits(left.path, right.path);
}

export function selectLatestRace(refs, provenance, now = Date.now()) {
  return refs
    .filter((ref) => eligibleLatestRace(ref, provenance.get(ref.path), now))
    .sort((left, right) => compareLatest(left, right, provenance))[0] || null;
}

export async function auditCandidate(candidateRoot, { requireReleaseRecord = true, now = Date.now() } = {}) {
  const paths = await assertCandidateRoot(candidateRoot);
  const errors = [];
  if (!Number.isFinite(now)) fail(errors, "audit time must be a valid timestamp.");
  await assertMirrors(paths, errors);
  const sourceSessions = await auditOpenF1Manifests(paths, errors);
  const seasonIndex = parse(SeasonIndexSchema, await readJson(path.join(paths.publicData, "manifests", "seasons.json"), errors, "manifests/seasons.json"), errors, "manifests/seasons.json");
  const latest = parse(LatestManifestSchema, await readJson(path.join(paths.publicData, "manifests", "latest.json"), errors, "manifests/latest.json"), errors, "manifests/latest.json");
  const provenance = await readProvenance(paths, errors);
  if (seasonIndex && latest) {
    const refs = collectRefs(seasonIndex);
    const seen = new Set();
    requireUnique(seasonIndex.seasons.map((season) => season.season), errors, "manifests/seasons.json seasons");
    for (const season of seasonIndex.seasons) {
      requireUnique(season.grandsPrix.map((grandPrix) => grandPrix.grandPrixSlug), errors, `manifests/seasons.json ${season.season} Grand Prix slugs`);
      for (const grandPrix of season.grandsPrix) requireUnique(grandPrix.sessions.map((ref) => ref.sessionSlug), errors, `manifests/seasons.json ${season.season}/${grandPrix.grandPrixSlug} session slugs`);
    }
    for (const ref of refs) {
      const expectedPath = `/sessions/${ref.season}/${ref.grandPrixSlug}/${ref.sessionSlug}`;
      if (ref.path !== expectedPath) fail(errors, `${ref.path}: public index path must be ${expectedPath}.`);
      if (ref.grandPrixSlug === "demo-weekend") fail(errors, `${ref.path}: demo session is publicly indexed.`);
      if (seen.has(ref.path)) fail(errors, `${ref.path}: duplicate public index entry.`);
      seen.add(ref.path);
      await auditSession(paths, ref, sourceSessions.get(ref.path), provenance.get(ref.path), errors, now);
    }
    for (const provenancePath of provenance.keys()) {
      if (!seen.has(provenancePath)) fail(errors, `release/provenance-ledger.json: unindexed public session ${provenancePath}.`);
    }
    const selectedLatest = selectLatestRace(refs, provenance, now);
    if (JSON.stringify(latest.latest) !== JSON.stringify(selectedLatest)) {
      fail(errors, "manifests/latest.json: latest must exactly match the eligible sourceEventEndAt, sessionKey, and path ordering, or be null.");
    }
    const featuredPaths = [...provenance.values()].filter((entry) => entry.publicationState === "featured").map((entry) => entry.path).sort();
    const expectedFeaturedPaths = selectedLatest ? [selectedLatest.path] : [];
    if (JSON.stringify(featuredPaths) !== JSON.stringify(expectedFeaturedPaths)) fail(errors, "release/provenance-ledger.json: featured publication state must exactly match latest.");
    const expectedSeasons = seasonIndex.seasons.map((season) => season.season);
    if (JSON.stringify(latest.seasons) !== JSON.stringify(expectedSeasons)) fail(errors, "manifests/latest.json: seasons do not match the public season index.");
    const generatedAtValues = refs.map((ref) => Date.parse(provenance.get(ref.path)?.generatedAt));
    const expectedGeneratedAt = generatedAtValues.length && generatedAtValues.every(Number.isFinite)
      ? new Date(Math.max(...generatedAtValues)).toISOString()
      : null;
    if (!utcTimestamp(seasonIndex.generatedAt) || seasonIndex.generatedAt !== expectedGeneratedAt) {
      fail(errors, "manifests/seasons.json: generatedAt must equal the newest indexed provenance generation time.");
    }
  }
  const modelIds = await auditModels(paths, errors);
  await auditSimulationPacks(paths, modelIds, errors);
  if (requireReleaseRecord) {
    await auditArtifactProjection(paths, errors);
    await auditReleaseRecord(paths, errors, now);
  }
  if (errors.length) throw new Error(`Release data audit failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  return { paths };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidateRoot = candidateRootFrom(options);
  await auditCandidate(candidateRoot, { now: options.now ? Date.parse(options.now) : Date.now() });
  process.stdout.write(`Release data audit passed: ${candidateRoot}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
