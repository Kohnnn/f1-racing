import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertCandidateRoot } from "../../../tools/release-data.mjs";

const OPENF1_BASE_URL = "https://api.openf1.org/v1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function contained(root, target) {
  const relative = path.relative(root, target);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isUtcTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

async function assertOwnedCacheRoot(cacheRoot) {
  const candidateRoot = process.env.F1_CANDIDATE_ROOT && path.resolve(process.env.F1_CANDIDATE_ROOT);
  if (!candidateRoot) throw new Error("Set F1_CANDIDATE_ROOT before enabling the OpenF1 response cache.");
  await assertCandidateRoot(candidateRoot);
  const candidateRealPath = await realpath(candidateRoot);
  const privateRoot = path.join(candidateRoot, "private");
  const resolved = path.resolve(cacheRoot);
  if (resolved === privateRoot || !contained(privateRoot, resolved)) {
    throw new Error("OpenF1 response cache must stay inside F1_CANDIDATE_ROOT/private.");
  }
  const relative = path.relative(candidateRoot, resolved);
  let current = candidateRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory() || !contained(candidateRealPath, await realpath(current))) {
        throw new Error(`Unsafe OpenF1 response cache path: ${current}`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
  await mkdir(resolved, { recursive: true });
  const [privateInfo, resolvedInfo, privateRealPath, resolvedRealPath] = await Promise.all([
    lstat(privateRoot),
    lstat(resolved),
    realpath(privateRoot),
    realpath(resolved),
  ]);
  if (
    privateInfo.isSymbolicLink()
    || resolvedInfo.isSymbolicLink()
    || !privateInfo.isDirectory()
    || !resolvedInfo.isDirectory()
    || !contained(candidateRealPath, privateRealPath)
    || !contained(privateRealPath, resolvedRealPath)
  ) throw new Error(`Unsafe OpenF1 response cache path: ${resolved}`);
  return resolved;
}

async function cachePaths(cacheRoot, identifier) {
  if (!cacheRoot) return null;
  const resolved = await assertOwnedCacheRoot(cacheRoot);
  const entry = path.join(resolved, digest(identifier));
  try {
    const [entryInfo, resolvedRealPath, entryRealPath] = await Promise.all([
      lstat(entry),
      realpath(resolved),
      realpath(entry),
    ]);
    if (entryInfo.isSymbolicLink() || !entryInfo.isDirectory() || !contained(resolvedRealPath, entryRealPath)) {
      throw new Error(`Unsafe OpenF1 response cache entry: ${entry}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return {
    root: resolved,
    entry,
    body: path.join(entry, "response.body"),
    metadata: path.join(entry, "metadata.json"),
  };
}

async function readCacheFile(filePath, encoding) {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Unsafe OpenF1 response cache entry: ${filePath}`);
  const handle = await open(filePath, "r");
  try {
    const openedInfo = await handle.stat();
    if (!openedInfo.isFile() || openedInfo.dev !== info.dev || openedInfo.ino !== info.ino) {
      throw new Error(`Unsafe OpenF1 response cache entry: ${filePath}`);
    }
    return handle.readFile(encoding);
  } finally {
    await handle.close();
  }
}

async function cacheEntryIdentity(root, entry) {
  const [rootInfo, entryInfo, rootRealPath, entryRealPath] = await Promise.all([
    lstat(root),
    lstat(entry),
    realpath(root),
    realpath(entry),
  ]);
  if (
    rootInfo.isSymbolicLink()
    || entryInfo.isSymbolicLink()
    || !rootInfo.isDirectory()
    || !entryInfo.isDirectory()
    || !contained(rootRealPath, entryRealPath)
  ) throw new Error(`Unsafe OpenF1 response cache entry: ${entry}`);
  return {
    rootDev: rootInfo.dev,
    rootIno: rootInfo.ino,
    rootRealPath,
    entryDev: entryInfo.dev,
    entryIno: entryInfo.ino,
    entryRealPath,
  };
}

async function readCachedResponse(paths, identifier, includeMetadata = false) {
  if (!paths) return null;
  let before;
  try {
    before = await cacheEntryIdentity(paths.root, paths.entry);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  const [bodyResult, metadataResult] = await Promise.allSettled([
    readCacheFile(paths.body),
    readCacheFile(paths.metadata, "utf8").then(JSON.parse),
  ]);
  const bodyMissing = bodyResult.status === "rejected" && bodyResult.reason?.code === "ENOENT";
  const metadataMissing = metadataResult.status === "rejected" && metadataResult.reason?.code === "ENOENT";
  if (bodyMissing && metadataMissing) throw new Error(`Incomplete OpenF1 response cache entry: ${identifier}`);
  if (bodyResult.status === "rejected") {
    if (bodyMissing) throw new Error(`Incomplete OpenF1 response cache entry: ${identifier}`);
    throw bodyResult.reason;
  }
  if (metadataResult.status === "rejected") {
    if (metadataMissing) throw new Error(`Incomplete OpenF1 response cache entry: ${identifier}`);
    throw metadataResult.reason;
  }
  const after = await cacheEntryIdentity(paths.root, paths.entry);
  if (
    after.rootDev !== before.rootDev
    || after.rootIno !== before.rootIno
    || after.rootRealPath !== before.rootRealPath
    || after.entryDev !== before.entryDev
    || after.entryIno !== before.entryIno
    || after.entryRealPath !== before.entryRealPath
  ) throw new Error(`Unsafe OpenF1 response cache entry: ${paths.entry}`);
  const metadata = metadataResult.value;
  const payload = JSON.parse(bodyResult.value.toString("utf8"));
  const noResults = metadata.status === 404 && typeof payload?.detail === "string" && /no results/i.test(payload.detail);
  if (
    metadata.schemaVersion !== 1
    || metadata.provider !== "openf1"
    || metadata.identifier !== identifier
    || metadata.responseSha256 !== digest(bodyResult.value)
    || metadata.bytes !== bodyResult.value.length
    || typeof metadata.statusText !== "string"
    || !isUtcTimestamp(metadata.retrievedAt)
    || (!(metadata.status >= 200 && metadata.status < 300) && !noResults)
  ) throw new Error(`Invalid OpenF1 response cache entry: ${identifier}`);
  const response = noResults ? [] : payload;
  return includeMetadata ? { metadata, payload: response } : response;
}

async function writeCachedResponse(paths, body, metadata) {
  if (!paths) return;
  const temporaryEntry = `${paths.entry}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await mkdir(temporaryEntry);
    await Promise.all([
      writeFile(path.join(temporaryEntry, "response.body"), body, { flag: "wx" }),
      writeFile(path.join(temporaryEntry, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", flag: "wx" }),
    ]);
    try {
      await rename(temporaryEntry, paths.entry);
    } catch (error) {
      if (!new Set(["EEXIST", "ENOTEMPTY", "EPERM"]).has(error?.code)) throw error;
      let winnerInfo;
      try {
        winnerInfo = await lstat(paths.entry);
      } catch {
        throw error;
      }
      if (!winnerInfo.isDirectory() || winnerInfo.isSymbolicLink()) throw error;
    }
  } finally {
    await rm(temporaryEntry, { recursive: true, force: true });
  }
}

function requestIdentifier(endpoint, params) {
  if (typeof endpoint !== "string" || !/^[a-z_]+$/.test(endpoint)) throw new Error(`Invalid OpenF1 endpoint: ${endpoint}`);
  const url = new URL(`${OPENF1_BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.href;
}

export async function readOpenF1Evidence(endpoint, params = {}, options = {}) {
  const identifier = requestIdentifier(endpoint, params);
  const defaultCacheRoot = process.env.F1_CANDIDATE_ROOT
    ? path.join(process.env.F1_CANDIDATE_ROOT, "private", "openf1-responses")
    : null;
  const paths = await cachePaths(options.cacheRoot ?? process.env.F1_OPENF1_CACHE_ROOT ?? defaultCacheRoot, identifier);
  const cached = await readCachedResponse(paths, identifier, true);
  if (cached === null) throw new Error(`Missing OpenF1 response cache entry: ${identifier}`);
  return cached;
}

export async function openF1Fetch(endpoint, params = {}, options = {}) {
  const identifier = requestIdentifier(endpoint, params);
  const url = new URL(identifier);
  const defaultCacheRoot = process.env.F1_CANDIDATE_ROOT
    ? path.join(process.env.F1_CANDIDATE_ROOT, "private", "openf1-responses")
    : null;
  const paths = await cachePaths(options.cacheRoot ?? process.env.F1_OPENF1_CACHE_ROOT ?? defaultCacheRoot, identifier);
  const cached = await readCachedResponse(paths, identifier);
  if (cached !== null) return cached;
  if (options.cacheOnly || process.env.F1_OPENF1_CACHE_ONLY === "1") {
    throw new Error(`Missing OpenF1 response cache entry: ${identifier}`);
  }
  const fetchImpl = options.fetch ?? fetch;
  const wait = options.sleep ?? sleep;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: "application/json",
        },
      });
    } catch (error) {
      if (attempt === 4) throw error;
      await wait(1000 * 2 ** attempt);
      continue;
    }

    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await wait(response.status === 429 ? 12000 + attempt * 3000 : 1000 * 2 ** attempt);
      continue;
    }

    const body = Buffer.from(await response.arrayBuffer());
    let payload;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch {
      throw new Error(`OpenF1 returned invalid JSON: ${response.status} ${response.statusText}`);
    }
    const noResults = response.status === 404 && typeof payload?.detail === "string" && /no results/i.test(payload.detail);
    if (response.ok || noResults) {
      const retrievedAt = (options.now ? options.now() : new Date()).toISOString();
      await writeCachedResponse(paths, body, {
        schemaVersion: 1,
        provider: "openf1",
        identifier,
        retrievedAt,
        responseSha256: digest(body),
        bytes: body.length,
        status: response.status,
        statusText: response.statusText,
      });
      if (paths) return readCachedResponse(paths, identifier);
      return response.ok ? payload : [];
    }

    throw new Error(`OpenF1 request failed: ${response.status} ${response.statusText}`);
  }

  throw new Error("OpenF1 request failed after retries.");
}

export async function fetchSessionMetadata({ year, countryName, sessionName }) {
  return openF1Fetch("sessions", {
    year,
    country_name: countryName,
    session_name: sessionName,
  });
}

export async function fetchSessions({ year, meetingKey, sessionName } = {}) {
  return openF1Fetch("sessions", {
    year,
    meeting_key: meetingKey,
    session_name: sessionName,
  });
}

export async function fetchMeetings({ year } = {}) {
  return openF1Fetch("meetings", {
    year,
  });
}

export async function fetchDrivers({ sessionKey }) {
  return openF1Fetch("drivers", {
    session_key: sessionKey,
  });
}

export async function fetchLaps({ sessionKey, driverNumber }) {
  return openF1Fetch("laps", {
    session_key: sessionKey,
    driver_number: driverNumber,
  });
}

export async function fetchCarData({ sessionKey, driverNumber, driverNumbers } = {}) {
  if (Array.isArray(driverNumbers)) {
    return (await Promise.all(driverNumbers.map((value) => openF1Fetch("car_data", {
      session_key: sessionKey,
      driver_number: value,
    })))).flat();
  }
  return openF1Fetch("car_data", {
    session_key: sessionKey,
    driver_number: driverNumber,
  });
}

export async function fetchSessionResult({ sessionKey }) {
  return openF1Fetch("session_result", {
    session_key: sessionKey,
  });
}

export async function fetchStints({ sessionKey }) {
  return openF1Fetch("stints", {
    session_key: sessionKey,
  });
}

export async function fetchWeather({ sessionKey }) {
  return openF1Fetch("weather", {
    session_key: sessionKey,
  });
}

export async function fetchCarPositions({ sessionKey, driverNumber }) {
  return openF1Fetch("position", {
    session_key: sessionKey,
    driver_number: driverNumber,
  });
}

export async function fetchRaceControl({ sessionKey }) {
  return openF1Fetch("race_control", {
    session_key: sessionKey,
  });
}

export async function fetchPosition({ sessionKey, driverNumber }) {
  return openF1Fetch("position", {
    session_key: sessionKey,
    driver_number: driverNumber,
  });
}

/**
 * GPS-style track location samples (x, y, z, date) for a driver. This is the
 * real positional telemetry — distinct from `position`, which only returns the
 * race rank. Used to project true car coordinates onto the canonical track.
 */
export async function fetchLocation({ sessionKey, driverNumber, driverNumbers } = {}) {
  if (Array.isArray(driverNumbers)) {
    return (await Promise.all(driverNumbers.map((value) => openF1Fetch("location", {
      session_key: sessionKey,
      driver_number: value,
    })))).flat();
  }
  return openF1Fetch("location", {
    session_key: sessionKey,
    driver_number: driverNumber,
  });
}
