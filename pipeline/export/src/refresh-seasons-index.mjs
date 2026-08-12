import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const candidateRoot = process.env.F1_CANDIDATE_ROOT ? path.resolve(process.env.F1_CANDIDATE_ROOT) : null;
const dataDir = candidateRoot ? path.join(candidateRoot, "canonical", "data") : path.join(root, "data");
const manifestsDir = path.join(dataDir, "manifests");
const packsDir = path.join(dataDir, "packs", "seasons");
const dataSeasonsPath = path.join(manifestsDir, "seasons.json");
const dataLatestPath = path.join(manifestsDir, "latest.json");
const publicManifestsDir = candidateRoot
  ? path.join(candidateRoot, "public", "data", "manifests")
  : path.join(root, "apps", "web", "public", "data", "manifests");
const publicSeasonsPath = path.join(publicManifestsDir, "seasons.json");
const publicLatestPath = path.join(publicManifestsDir, "latest.json");

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonText(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function readJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf-8");
    const payload = JSON.parse(raw);
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function listSeasonManifestPaths() {
  let entries;
  try {
    entries = await readdir(manifestsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && /^openf1-\d{4}-season\.json$/.test(entry.name))
    .map((entry) => path.join(manifestsDir, entry.name))
    .sort();
}

function readCanonicalSessions(seasonManifest) {
  if (!Array.isArray(seasonManifest.grandsPrix)) return [];

  return seasonManifest.grandsPrix.flatMap((grandPrix) => {
    if (!isRecord(grandPrix) || !Array.isArray(grandPrix.sessions)) return [];
    return grandPrix.sessions
      .filter(isRecord)
      .map((session) => ({
        ...session,
        grandPrixSlug: typeof session.grandPrixSlug === "string" ? session.grandPrixSlug : grandPrix.grandPrixSlug,
        grandPrixName: typeof session.grandPrixName === "string" ? session.grandPrixName : grandPrix.grandPrixName,
      }));
  });
}

function isCanonicalSession(session) {
  return Number.isInteger(session.season)
    && typeof session.grandPrixSlug === "string"
    && typeof session.grandPrixName === "string"
    && typeof session.sessionSlug === "string"
    && typeof session.sessionName === "string"
    && Number.isInteger(session.sessionKey)
    && typeof session.trackId === "string"
    && typeof session.startDate === "string"
    && Number.isFinite(Date.parse(session.startDate));
}

function hasSessionKey(payload, session) {
  return payload.sessionKey === session.sessionKey;
}

function matchesReplay(payload, session) {
  return hasSessionKey(payload, session)
    && payload.season === session.season
    && payload.trackId === session.trackId;
}

async function hasCompleteReplay(sessionDir, session) {
  const replayMeta = await readJson(path.join(sessionDir, "replay.meta.json"));
  if (replayMeta && matchesReplay(replayMeta, session)) {
    const firstChunkPath = replayMeta.frameChunkIndex?.[0]?.path;
    if (typeof firstChunkPath === "string" && firstChunkPath.length) {
      const firstChunk = await readJson(path.join(sessionDir, firstChunkPath));
      if (firstChunk && Array.isArray(firstChunk.frames) && firstChunk.frames.length) return true;
    }
  }

  const replay = await readJson(path.join(sessionDir, "replay.json"));
  return Boolean(replay && matchesReplay(replay, session) && Array.isArray(replay.frames) && replay.frames.length);
}

async function toAvailableSession(session) {
  if (!isCanonicalSession(session) || session.grandPrixSlug === "demo-weekend") return null;

  const sessionDir = path.join(packsDir, String(session.season), session.grandPrixSlug, session.sessionSlug);
  const [manifest, summary] = await Promise.all([
    readJson(path.join(sessionDir, "manifest.json")),
    readJson(path.join(sessionDir, "summary.json")),
  ]);
  if (!manifest || !summary || !(await hasCompleteReplay(sessionDir, session))) return null;
  if (!hasSessionKey(manifest, session) || !matchesReplay(summary, session)) return null;

  return {
    season: session.season,
    grandPrixSlug: session.grandPrixSlug,
    sessionSlug: session.sessionSlug,
    grandPrixName: session.grandPrixName,
    sessionName: session.sessionName,
    sessionKey: session.sessionKey,
    trackId: session.trackId,
    path: `/sessions/${session.season}/${session.grandPrixSlug}/${session.sessionSlug}`,
    startDate: session.startDate,
  };
}

function compareSessionPath(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareByStartDate(left, right) {
  const startDifference = Date.parse(right.startDate) - Date.parse(left.startDate);
  if (startDifference) return startDifference;
  if (left.sessionKey !== right.sessionKey) return right.sessionKey - left.sessionKey;
  return compareSessionPath(left.path, right.path);
}

function compareForIndex(left, right) {
  if (left.season !== right.season) return right.season - left.season;
  const grandPrixDifference = compareSessionPath(left.grandPrixSlug, right.grandPrixSlug);
  if (grandPrixDifference) return grandPrixDifference;
  const startDifference = Date.parse(left.startDate) - Date.parse(right.startDate);
  if (startDifference) return startDifference;
  if (left.sessionKey !== right.sessionKey) return left.sessionKey - right.sessionKey;
  return compareSessionPath(left.sessionSlug, right.sessionSlug);
}

function toSessionRef(session) {
  const { startDate, ...ref } = session;
  return ref;
}

export function buildPayloads(sessions) {
  if (!sessions.length) throw new Error("No complete non-demo OpenF1 session packs found.");

  const sortedSessions = [...sessions].sort(compareForIndex);
  const seasons = [];
  for (const season of [...new Set(sortedSessions.map((session) => session.season))]) {
    const seasonSessions = sortedSessions.filter((session) => session.season === season);
    const grandsPrix = [];
    for (const grandPrixSlug of [...new Set(seasonSessions.map((session) => session.grandPrixSlug))]) {
      const grandPrixSessions = seasonSessions.filter((session) => session.grandPrixSlug === grandPrixSlug);
      grandsPrix.push({
        grandPrixSlug,
        grandPrixName: grandPrixSessions[0].grandPrixName,
        sessions: grandPrixSessions.map(toSessionRef),
      });
    }
    seasons.push({ season, grandsPrix });
  }

  const latest = [...sessions]
    .filter((session) => session.sessionSlug === "race")
    .sort(compareByStartDate)[0];
  if (!latest) throw new Error("No complete non-demo OpenF1 race packs found.");

  const generatedAt = new Date(Math.max(...sessions.map((session) => Date.parse(session.startDate)))).toISOString();
  return {
    seasons: { generatedAt, seasons },
    latest: {
      version: 1,
      seasons: seasons.map((season) => season.season),
      latest: toSessionRef(latest),
    },
  };
}

async function collectPayloads() {
  const sessions = [];
  for (const manifestPath of await listSeasonManifestPaths()) {
    const seasonManifest = await readJson(manifestPath);
    if (!seasonManifest) continue;
    for (const session of readCanonicalSessions(seasonManifest)) {
      const availableSession = await toAvailableSession(session);
      if (availableSession) sessions.push(availableSession);
    }
  }
  return buildPayloads(sessions);
}

async function assertMatches(filePath, expected) {
  let actual;
  try {
    actual = await readFile(filePath, "utf-8");
  } catch {
    throw new Error(`Missing ${path.relative(root, filePath)}`);
  }
  if (actual !== expected) throw new Error(`Outdated ${path.relative(root, filePath)}`);
}

async function writeIfChanged(filePath, content) {
  let current = null;
  try {
    current = await readFile(filePath, "utf-8");
  } catch {}
  if (current === content) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

export async function refreshFeaturedIndexes({ check = false } = {}) {
  const payloads = await collectPayloads();
  const seasonsText = jsonText(payloads.seasons);
  const latestText = jsonText(payloads.latest);

  if (check) {
    await Promise.all([
      assertMatches(dataSeasonsPath, seasonsText),
      assertMatches(publicSeasonsPath, seasonsText),
      assertMatches(dataLatestPath, latestText),
      assertMatches(publicLatestPath, latestText),
    ]);
    return payloads;
  }

  await Promise.all([
    writeIfChanged(dataSeasonsPath, seasonsText),
    writeIfChanged(publicSeasonsPath, seasonsText),
    writeIfChanged(dataLatestPath, latestText),
    writeIfChanged(publicLatestPath, latestText),
  ]);
  return payloads;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  refreshFeaturedIndexes({ check: process.argv.includes("--check") })
    .then((payloads) => {
      process.stdout.write(process.argv.includes("--check")
        ? "Featured race and season mirrors are current.\n"
        : `Featured race: ${payloads.latest.latest.path}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
      process.exit(1);
    });
}
