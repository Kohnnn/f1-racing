import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CarModelCatalogSchema,
  ComparePackSchema,
  DriverSummarySchema,
  LapRecordSchema,
  LatestManifestSchema,
  ReplayFrameChunkSchema,
  ReplayMetaSchema,
  ReplayPackSchema,
  SeasonIndexSchema,
  SessionManifestSchema,
  SessionSummarySchema,
  StintPackSchema,
} from "../packages/schemas/src/index.js";

export const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  return {
    root: candidateRoot,
    canonicalData: path.join(candidateRoot, "canonical", "data"),
    publicRoot: path.join(candidateRoot, "public"),
    publicData: path.join(candidateRoot, "public", "data"),
    releaseRecord: path.join(candidateRoot, "release-record.json"),
    releaseManifest: path.join(candidateRoot, "public", "release-manifest.json"),
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

async function walk(directory, prefix = "") {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath.split(path.sep).join("/"));
  }
  return files;
}

export async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function resolveContained(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath.length) return null;
  const resolved = path.resolve(root, relativePath);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

async function assertFile(root, relativePath, errors, label) {
  const filePath = resolveContained(root, relativePath);
  if (!filePath) {
    fail(errors, `${label}: unsafe path ${JSON.stringify(relativePath)}`);
    return null;
  }
  try {
    if (!(await stat(filePath)).isFile()) throw new Error("not a file");
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

function utcTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
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

async function readProvenance(paths, errors) {
  const relativePath = "release/provenance-ledger.json";
  const ledger = await readJson(path.join(paths.publicData, relativePath), errors, relativePath);
  if (!isRecord(ledger) || ledger.schemaVersion !== 1 || !Array.isArray(ledger.sessions)) {
    fail(errors, "release/provenance-ledger.json: expected schemaVersion 1 with sessions.");
    return new Map();
  }
  return new Map(ledger.sessions.filter(isRecord).map((entry) => [entry.path, entry]));
}

function validateProvenance(ref, provenance, requiredPaths, errors, now) {
  const label = `${sessionPath(ref)}/provenance`;
  if (!isRecord(provenance)) {
    fail(errors, `${label}: missing ledger entry.`);
    return;
  }
  if (provenance.publicationState === "future" || provenance.publicationState === "partial" || provenance.publicationState === "unknown") {
    fail(errors, `${label}: forbidden public state ${provenance.publicationState}.`);
  }
  for (const field of ["sourceEventStartAt", "sourceEventEndAt", "retrievedAtMin", "retrievedAtMax", "generatedAt"]) {
    if (!utcTimestamp(provenance[field])) fail(errors, `${label}: ${field} must be an RFC 3339 UTC timestamp.`);
  }
  if (utcTimestamp(provenance.sourceEventStartAt) && utcTimestamp(provenance.sourceEventEndAt)
    && Date.parse(provenance.sourceEventEndAt) < Date.parse(provenance.sourceEventStartAt)) {
    fail(errors, `${label}: sourceEventEndAt precedes sourceEventStartAt.`);
  }
  if (utcTimestamp(provenance.sourceEventEndAt) && Date.parse(provenance.sourceEventEndAt) > now) {
    fail(errors, `${label}: future session is publicly indexed.`);
  }
  if (!isRecord(provenance.terminalOutcome) || provenance.terminalOutcome.status !== "completed" || typeof provenance.terminalOutcome.observedAt !== "string") {
    fail(errors, `${label}: explicit completed terminal outcome is required.`);
  }
  if (!Array.isArray(provenance.sources) || !provenance.sources.length) {
    fail(errors, `${label}: at least one source provenance record is required.`);
  } else {
    for (const source of provenance.sources) {
      if (!isRecord(source) || typeof source.provider !== "string" || typeof source.identifier !== "string"
        || !utcTimestamp(source.retrievedAt) || !/^[a-f0-9]{64}$/.test(source.responseSha256 ?? "")
        || typeof source.rightsReference !== "string") {
        fail(errors, `${label}: source records require provider, identifier, retrievedAt, responseSha256, and rightsReference.`);
      }
    }
  }
  if (!isRecord(provenance.artifacts)) {
    fail(errors, `${label}: artifact digest ledger is required.`);
    return;
  }
  for (const relativePath of requiredPaths) {
    if (!/^[a-f0-9]{64}$/.test(provenance.artifacts[relativePath] ?? "")) {
      fail(errors, `${label}: missing SHA-256 for ${relativePath}.`);
    }
  }
}

async function auditSession(paths, ref, provenance, errors, now) {
  const relativeBase = sessionPath(ref);
  const sessionRoot = path.join(paths.publicData, relativeBase);
  const required = new Set(["manifest.json", "summary.json", "drivers.json", "laps.json", "results.json", "stints.json", "strategy.json", "weather.json", "replay.meta.json", "replay.laps.json", "replay.race-control.json"]);
  const manifestPayload = await readJson(path.join(sessionRoot, "manifest.json"), errors, `${relativeBase}/manifest.json`);
  const manifest = parse(SessionManifestSchema, manifestPayload, errors, `${relativeBase}/manifest.json`);
  if (manifest && manifest.sessionKey !== ref.sessionKey) fail(errors, `${relativeBase}/manifest.json: sessionKey mismatch.`);
  if (manifest) {
    for (const member of collectStringPaths({
      summary: manifest.summary,
      drivers: manifest.drivers,
      laps: manifest.laps,
      strategy: manifest.strategy,
      stints: manifest.stints,
      replay: manifest.replay,
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
  if (!sameSession(summary, ref)) fail(errors, `${relativeBase}/summary.json: season, sessionKey, or trackId mismatch.`);
  const driversPayload = payloads.get("drivers.json");
  if (!Array.isArray(driversPayload)) fail(errors, `${relativeBase}/drivers.json: expected an array.`);
  else driversPayload.forEach((driver, index) => parse(DriverSummarySchema, driver, errors, `${relativeBase}/drivers.json[${index}]`));
  const resultsPayload = payloads.get("results.json");
  if (!Array.isArray(resultsPayload) || !resultsPayload.length) fail(errors, `${relativeBase}/results.json: expected non-empty session results.`);
  const weatherPayload = payloads.get("weather.json");
  if (!Array.isArray(weatherPayload) || !weatherPayload.length) fail(errors, `${relativeBase}/weather.json: expected non-empty weather coverage.`);
  const lapsPayload = payloads.get("laps.json");
  if (!Array.isArray(lapsPayload) || !lapsPayload.length) fail(errors, `${relativeBase}/laps.json: expected non-empty lap records.`);
  else lapsPayload.forEach((lap, index) => parse(LapRecordSchema, lap, errors, `${relativeBase}/laps.json[${index}]`));
  const stints = parse(StintPackSchema, payloads.get("stints.json"), errors, `${relativeBase}/stints.json`);
  if (stints && (stints.sessionKey !== ref.sessionKey || stints.trackId !== ref.trackId)) {
    fail(errors, `${relativeBase}/stints.json: sessionKey or trackId mismatch.`);
  }
  const replay = parse(ReplayPackSchema, payloads.get("replay.json"), errors, `${relativeBase}/replay.json`);
  if (!sameSession(replay, ref)) fail(errors, `${relativeBase}/replay.json: season, sessionKey, or trackId mismatch.`);
  const replayMeta = parse(ReplayMetaSchema, payloads.get("replay.meta.json"), errors, `${relativeBase}/replay.meta.json`);
  if (!sameSession(replayMeta, ref)) fail(errors, `${relativeBase}/replay.meta.json: season, sessionKey, or trackId mismatch.`);
  const strategy = payloads.get("strategy.json");
  if (!isRecord(strategy) || strategy.trackId !== ref.trackId) fail(errors, `${relativeBase}/strategy.json: trackId mismatch or invalid strategy.`);
  if (manifest) {
    for (const [key, relativePath] of Object.entries(manifest.compare)) {
      parse(ComparePackSchema, payloads.get(relativePath), errors, `${relativeBase}/${relativePath}`);
      if (payloads.get(relativePath)?.trackId !== ref.trackId) fail(errors, `${relativeBase}/${relativePath}: trackId mismatch.`);
    }
  }
  const raceControl = payloads.get("replay.race-control.json");
  if (!Array.isArray(raceControl)) fail(errors, `${relativeBase}/replay.race-control.json: expected an array.`);
  if (ref.sessionSlug === "race" && !raceControl?.some((entry) => /chequered|checkered/i.test(`${entry?.flag ?? ""} ${entry?.message ?? ""}`))) {
    fail(errors, `${relativeBase}/replay.race-control.json: completed race lacks chequered-flag evidence.`);
  }
  if (replayMeta) {
    const chunks = [...replayMeta.frameChunkIndex].sort((left, right) => left.index - right.index);
    const frames = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const entry = chunks[index];
      if (entry.index !== index) fail(errors, `${relativeBase}/replay.meta.json: missing chunk index ${index}.`);
      const chunkPath = await assertFile(sessionRoot, entry.path, errors, relativeBase);
      if (!chunkPath) continue;
      required.add(entry.path);
      const chunk = parse(ReplayFrameChunkSchema, await readJson(chunkPath, errors, `${relativeBase}/${entry.path}`), errors, `${relativeBase}/${entry.path}`);
      if (chunk) {
        if (chunk.index !== entry.index || chunk.fromTime !== entry.fromTime || chunk.toTime !== entry.toTime) {
          fail(errors, `${relativeBase}/${entry.path}: metadata mismatch.`);
        }
        frames.push(...chunk.frames);
      }
    }
    if (new Set(frames.map((frame) => frame.t)).size !== replayMeta.frameCount || frames.length !== replayMeta.frameCount) {
      fail(errors, `${relativeBase}/replay.meta.json: chunk frames do not exactly cover frameCount.`);
    }
    if (frames.at(-1)?.t < replayMeta.totalTime) fail(errors, `${relativeBase}/replay.meta.json: chunks do not reach totalTime.`);
  }
  const digestPaths = [...required].sort().map((member) => `${relativeBase}/${member}`);
  validateProvenance(ref, provenance, digestPaths, errors, now);
  for (const relativePath of digestPaths) {
    const filePath = await assertFile(paths.publicData, relativePath, errors, "digest");
    if (filePath && provenance?.artifacts?.[relativePath] && await sha256(filePath) !== provenance.artifacts[relativePath]) {
      fail(errors, `digest mismatch: data/${relativePath}`);
    }
  }
}

async function auditModels(paths, errors) {
  const catalogPath = path.join(paths.publicData, "packs", "cars", "catalog.json");
  const catalog = parse(CarModelCatalogSchema, await readJson(catalogPath, errors, "packs/cars/catalog.json"), errors, "packs/cars/catalog.json");
  if (!catalog) return;
  for (const model of catalog.models) {
    const modelPath = typeof model?.file === "string" ? model.file.replace(/^\//, "") : null;
    if (!modelPath || !modelPath.startsWith("models/")) fail(errors, "packs/cars/catalog.json: model file must be a public /models path.");
    else await assertFile(paths.publicRoot, modelPath, errors, "model reference");
  }
}

async function auditReleaseRecord(paths, errors) {
  const record = await readJson(paths.releaseRecord, errors, "release-record.json");
  const manifest = await readJson(paths.releaseManifest, errors, "release-manifest.json");
  if (!isRecord(record) || !isRecord(manifest)) return;
  if (!Array.isArray(manifest.entries)) {
    fail(errors, "release-manifest.json: entries are required.");
    return;
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit ?? "") || !utcTimestamp(manifest.generatedAt)) {
    fail(errors, "release-manifest.json: sourceCommit and generatedAt are required.");
  }
  const expectedDigest = createHash("sha256").update(`${JSON.stringify(manifest.entries)}\n`).digest("hex");
  if (manifest.manifestSha256 !== expectedDigest || manifest.releaseId !== `sha256-${expectedDigest}`) {
    fail(errors, "release-manifest.json: release ID or manifest SHA-256 mismatch.");
  }
  const actualFiles = (await walk(paths.publicRoot)).filter((relativePath) => relativePath !== "release-manifest.json").sort();
  const manifestPaths = manifest.entries.map((entry) => entry?.path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifestPaths) || new Set(manifestPaths).size !== manifestPaths.length) {
    fail(errors, "release-manifest.json: indexed artifact paths do not exactly match the candidate tree.");
  }
  for (const entry of manifest.entries) {
    if (!isRecord(entry) || typeof entry.path !== "string") {
      fail(errors, "release-manifest.json: invalid artifact entry.");
      continue;
    }
    const filePath = await assertFile(paths.publicRoot, entry.path, errors, "release manifest");
    if (filePath && ((await stat(filePath)).size !== entry.bytes || await sha256(filePath) !== entry.sha256)) {
      fail(errors, `release-manifest.json: digest or size mismatch for ${entry.path}.`);
    }
  }
  if (record.releaseId !== manifest.releaseId || record.assetReleaseId !== manifest.releaseId || record.manifestSha256 !== manifest.manifestSha256) {
    fail(errors, "release-record.json: release identity does not match release-manifest.json.");
  }
  if (!utcTimestamp(record.generatedAt) || record.publishedAt !== null) {
    fail(errors, "release-record.json: candidate requires generatedAt and publishedAt null before promotion.");
  }
}

export async function auditCandidate(candidateRoot, { requireReleaseRecord = true, now = Date.now() } = {}) {
  const paths = candidatePaths(candidateRoot);
  const errors = [];
  await assertMirrors(paths, errors);
  const seasonIndex = parse(SeasonIndexSchema, await readJson(path.join(paths.publicData, "manifests", "seasons.json"), errors, "manifests/seasons.json"), errors, "manifests/seasons.json");
  const latest = parse(LatestManifestSchema, await readJson(path.join(paths.publicData, "manifests", "latest.json"), errors, "manifests/latest.json"), errors, "manifests/latest.json");
  const provenance = await readProvenance(paths, errors);
  if (seasonIndex && latest) {
    const refs = collectRefs(seasonIndex);
    const seen = new Set();
    for (const ref of refs) {
      if (ref.grandPrixSlug === "demo-weekend") fail(errors, `${ref.path}: demo session is publicly indexed.`);
      if (seen.has(ref.path)) fail(errors, `${ref.path}: duplicate public index entry.`);
      seen.add(ref.path);
      await auditSession(paths, ref, provenance.get(ref.path), errors, now);
    }
    if (latest.latest.sessionSlug !== "race" || !seen.has(latest.latest.path)) {
      fail(errors, "manifests/latest.json: latest must reference an indexed race.");
    }
  }
  await auditModels(paths, errors);
  if (requireReleaseRecord) await auditReleaseRecord(paths, errors);
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
