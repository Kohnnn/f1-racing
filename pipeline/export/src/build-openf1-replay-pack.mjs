import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  fetchCarData,
  fetchDrivers,
  fetchLaps,
  fetchPosition,
  fetchLocation,
  fetchRaceControl,
  fetchSessions,
  fetchStints,
  fetchWeather,
} from "../../ingest/src/openf1-client.mjs";
import { slugify } from "../../normalize/src/normalize-session.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dataRoot = path.join(root, "data");
const publicRoot = path.join(root, "apps", "web", "public", "data");

const TEAM_COLORS = {
  "Red Bull Racing": "#3671C6",
  "Ferrari": "#E8002D",
  "McLaren": "#FF8000",
  "Mercedes": "#27F4D2",
  "Aston Martin": "#229971",
  "Alpine": "#FF87BC",
  "Williams": "#64C4FF",
  "RB": "#9BB1FF",
  "Racing Bulls": "#9BB1FF",
  "Kick Sauber": "#52E252",
  "Haas F1 Team": "#B6BABE",
  "Haas": "#B6BABE",
};

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(relativePath, payload) {
  const targets = [path.join(dataRoot, relativePath), path.join(publicRoot, relativePath)];
  await Promise.all(
    targets.map(async (filePath) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    })
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoToMs(value) {
  return value ? new Date(value).getTime() : 0;
}

function getReplayStartTime(ref, lapsRaw, carDataByDriver, positionData) {
  const lapStartCandidates = [];
  const fallbackCandidates = [];

  for (const lap of lapsRaw) {
    const lapNumber = Number(lap.lap_number ?? 0);
    const startMs = isoToMs(lap.date_start);
    if (lapNumber >= 1 && startMs > 0) {
      lapStartCandidates.push(startMs);
    }
  }

  if (lapStartCandidates.length) {
    return Math.min(...lapStartCandidates);
  }

  for (const samples of carDataByDriver.values()) {
    const firstMovingSample = samples
      .filter((point) => Number(point.speed ?? 0) > 20)
      .sort((left, right) => isoToMs(left.date) - isoToMs(right.date))[0];
    if (firstMovingSample) {
      fallbackCandidates.push(isoToMs(firstMovingSample.date));
    }
  }

  for (const data of positionData) {
    const firstPosition = data.positions
      .slice()
      .sort((left, right) => isoToMs(left.date) - isoToMs(right.date))[0];
    if (firstPosition) {
      fallbackCandidates.push(isoToMs(firstPosition.date));
    }
  }

  const fallback = isoToMs(ref.startDate);
  return Math.min(...fallbackCandidates.filter((value) => value > 0), fallback || Date.now());
}

function summarizeWeather(samples) {
  if (!samples.length) {
    return {
      airTempC: 0,
      trackTempC: 0,
      rainRiskPct: 0,
    };
  }

  const airTempC = samples.reduce((sum, item) => sum + Number(item.air_temperature || 0), 0) / samples.length;
  const trackTempC = samples.reduce((sum, item) => sum + Number(item.track_temperature || 0), 0) / samples.length;
  const rainRiskPct = Math.max(...samples.map((item) => Number(item.rainfall || 0)), 0) * 100;

  return {
    airTempC: Math.round(airTempC),
    trackTempC: Math.round(trackTempC),
    rainRiskPct: Math.round(rainRiskPct),
  };
}

function findLatestIndex(entries, target, getTime = (entry) => entry.t) {
  let left = 0;
  let right = entries.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (getTime(entries[mid]) <= target) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

function buildReplayLaps(lapsRaw, drivers) {
  const driverCodeByNumber = new Map(drivers.map((driver) => [driver.driverNumber, driver.driverCode]));

  return lapsRaw
    .filter((lap) => Number.isFinite(lap.lap_duration))
    .map((lap) => ({
      driverCode: driverCodeByNumber.get(Number(lap.driver_number)) || String(lap.driver_number),
      lapNumber: Number(lap.lap_number),
      lapTime: Number(lap.lap_duration),
      compound: lap.compound ?? null,
    }))
    .sort((left, right) => {
      if (left.lapNumber !== right.lapNumber) {
        return left.lapNumber - right.lapNumber;
      }
      return left.driverCode.localeCompare(right.driverCode);
    });
}

function buildLapTimelines(lapsRaw) {
  const byDriver = new Map();

  for (const lap of lapsRaw) {
    const driverNumber = Number(lap.driver_number);
    const startMs = isoToMs(lap.date_start);
    const durationS = Number(lap.lap_duration ?? 0);
    const durationMs = Number.isFinite(durationS) && durationS > 0 ? durationS * 1000 : 90000;

    if (!byDriver.has(driverNumber)) {
      byDriver.set(driverNumber, []);
    }

    byDriver.get(driverNumber).push({
      lapNumber: Number(lap.lap_number ?? 0),
      startMs,
      endMs: startMs + durationMs,
      durationS: durationMs / 1000,
      compound: lap.compound ?? null,
      stintNumber: lap.stint_number == null ? null : Number(lap.stint_number),
    });
  }

  for (const entries of byDriver.values()) {
    entries.sort((left, right) => left.startMs - right.startMs);
  }

  return byDriver;
}

function getStintForLap(stintTimeline, lapNumber) {
  if (!stintTimeline?.length) {
    return null;
  }

  return stintTimeline.find((stint) => lapNumber >= stint.lapStart && lapNumber <= stint.lapEnd)
    || stintTimeline.find((stint) => lapNumber <= stint.lapEnd)
    || stintTimeline.at(-1)
    || null;
}

function enrichReplayLapsWithStints(replayLaps, drivers, stintTimelines) {
  const numberByCode = new Map(drivers.map((driver) => [driver.driverCode, driver.driverNumber]));

  return replayLaps.map((lap) => {
    const driverNumber = numberByCode.get(lap.driverCode);
    const stint = getStintForLap(stintTimelines.get(driverNumber), lap.lapNumber);

    return {
      ...lap,
      compound: stint?.compound ?? lap.compound ?? null,
      stintNumber: stint ? Math.max(1, stint.stintNumber + (stint.stintNumber === 0 ? 1 : 0)) : null,
    };
  });
}

function buildStintTimelines(stintsRaw) {
  const byDriver = new Map();

  for (const stint of stintsRaw) {
    const driverNumber = Number(stint.driver_number);
    if (!byDriver.has(driverNumber)) {
      byDriver.set(driverNumber, []);
    }

    byDriver.get(driverNumber).push({
      stintNumber: Number(stint.stint_number ?? 0),
      lapStart: Number(stint.lap_start ?? 0),
      lapEnd: Number(stint.lap_end ?? 0),
      compound: stint.compound ?? null,
      tyreAgeAtStart: Number(stint.tyre_age_at_start ?? 0),
    });
  }

  for (const entries of byDriver.values()) {
    entries.sort((left, right) => left.lapStart - right.lapStart);
  }

  return byDriver;
}

function buildRaceControlTimeline(messages, sessionStartTime) {
  return messages
    .map((message) => ({
      t: isoToMs(message.date) - sessionStartTime,
      lapNumber: message.lap_number == null ? null : Number(message.lap_number),
      category: message.category || "Other",
      flag: message.flag ?? null,
      scope: message.scope ?? null,
      sector: message.sector == null ? null : Number(message.sector),
      message: message.message || "",
    }))
    .filter((message) => message.t >= 0)
    .sort((left, right) => left.t - right.t);
}

function buildWeatherTimeline(samples, sessionStartTime) {
  return samples
    .map((sample) => ({
      t: isoToMs(sample.date) - sessionStartTime,
      airTempC: Number(sample.air_temperature ?? 0),
      trackTempC: Number(sample.track_temperature ?? 0),
      humidityPct: Number(sample.humidity ?? 0),
      rainfall: Boolean(sample.rainfall),
      windSpeedMps: Number(sample.wind_speed ?? 0),
      windDirectionDeg: Number(sample.wind_direction ?? 0),
    }))
    .filter((sample) => sample.t >= 0)
    .sort((left, right) => left.t - right.t);
}

function getWeatherState(weatherTimeline, frameTimeMs, fallbackWeatherSummary) {
  if (!weatherTimeline.length) {
    return {
      airTempC: fallbackWeatherSummary.airTempC,
      trackTempC: fallbackWeatherSummary.trackTempC,
      humidityPct: 0,
      rainfall: false,
      windSpeedMps: 0,
      windDirectionDeg: 0,
    };
  }

  const index = findLatestIndex(weatherTimeline, frameTimeMs, (entry) => entry.t);
  return weatherTimeline[index === -1 ? 0 : index];
}

function getLapState(lapTimeline, frameTimeMs) {
  if (!lapTimeline?.length) {
    return {
      lapNumber: 1,
      lapProgress: 0,
      raceProgressRatio: 0,
      lapDurationS: 95,
      compound: null,
    };
  }

  const index = findLatestIndex(lapTimeline, frameTimeMs, (entry) => entry.startMs);
  const activeLap = index === -1 ? lapTimeline[0] : lapTimeline[Math.min(index, lapTimeline.length - 1)];
  const lapDurationMs = Math.max(1000, (activeLap.durationS || 95) * 1000);
  const rawProgress = (frameTimeMs - activeLap.startMs) / lapDurationMs;
  const lapProgress = Math.max(0, Math.min(0.999, rawProgress));
  const raceProgressRatio = Math.max(0, Math.min(1.15, rawProgress));

  return {
    lapNumber: activeLap.lapNumber || 1,
    lapProgress,
    raceProgressRatio,
    lapDurationS: activeLap.durationS || 95,
    compound: activeLap.compound,
  };
}

function getTyreState(stintTimeline, lapNumber, fallbackCompound) {
  if (!stintTimeline?.length) {
    return {
      tyreCompound: fallbackCompound ?? null,
      tyreAge: null,
    };
  }

  const activeStint = stintTimeline.find((stint) => lapNumber >= stint.lapStart && lapNumber <= stint.lapEnd)
    || stintTimeline.at(-1);

  if (!activeStint) {
    return {
      tyreCompound: fallbackCompound ?? null,
      tyreAge: null,
    };
  }

  return {
    tyreCompound: activeStint.compound ?? fallbackCompound ?? null,
    tyreAge: Math.max(0, activeStint.tyreAgeAtStart + Math.max(0, lapNumber - activeStint.lapStart)),
  };
}

function determineTrackStatus(raceControlTimeline, frameTimeMs) {
  let status = "GREEN";

  for (const message of raceControlTimeline) {
    if (message.t > frameTimeMs) {
      break;
    }

    if (message.category === "SafetyCar") {
      if (/VIRTUAL SAFETY CAR/i.test(message.message)) {
        status = /ENDING|ENDED/i.test(message.message) ? "GREEN" : "VSC";
        continue;
      }

      if (/SAFETY CAR/i.test(message.message)) {
        status = "SC";
        continue;
      }
    }

    if (message.category === "Flag" && message.scope !== "Driver") {
      switch (message.flag) {
        case "GREEN":
        case "CLEAR":
          status = "GREEN";
          break;
        case "YELLOW":
        case "DOUBLE YELLOW":
          status = message.flag;
          break;
        case "RED":
          status = "RED";
          break;
        case "CHEQUERED":
          status = "CHEQUERED";
          break;
        default:
          break;
      }
    }
  }

  return status;
}

function determineSafetyCarState(raceControlTimeline, frameTimeMs) {
  let deployTime = null;
  let inThisLapTime = null;
  let clearTime = null;

  for (const message of raceControlTimeline) {
    if (message.t > frameTimeMs) {
      break;
    }

    if (message.category === "SafetyCar" && /SAFETY CAR DEPLOYED/i.test(message.message)) {
      deployTime = message.t;
      inThisLapTime = null;
      clearTime = null;
    }

    if (message.category === "SafetyCar" && /SAFETY CAR IN THIS LAP/i.test(message.message)) {
      inThisLapTime = message.t;
    }

    if (message.category === "Flag" && message.scope === "Track" && (message.flag === "CLEAR" || message.flag === "GREEN")) {
      clearTime = message.t;
    }
  }

  if (deployTime == null || (clearTime != null && clearTime >= deployTime && clearTime <= frameTimeMs)) {
    return "none";
  }

  if (inThisLapTime != null && inThisLapTime <= frameTimeMs) {
    return "returning";
  }

  if (frameTimeMs - deployTime < 4000) {
    return "deploying";
  }

  return "on_track";
}

function normalizeSessionRef(session, args = {}) {
  const grandPrixName = args.grandPrixName || session.meeting_name || session.grand_prix || `${session.country_name || session.location || "Unknown"} Grand Prix`;
  const grandPrixSlug = args.grandPrixSlug || slugify(grandPrixName);
  const trackId = args.trackId || slugify(session.circuit_short_name || session.location || grandPrixName);
  return {
    season: session.year,
    grandPrixSlug,
    sessionSlug: slugify(session.session_name || session.session_type || "Session"),
    grandPrixName,
    sessionName: session.session_name || session.session_type || "Session",
    sessionKey: Number(session.session_key),
    trackId,
    path: `/sessions/${session.year}/${grandPrixSlug}/${slugify(session.session_name || session.session_type || "session")}`,
    startDate: session.date_start,
    endDate: session.date_end,
    location: session.location || "",
    countryName: session.country_name || "",
  };
}

async function getSeasonManifest(year) {
  const targetYear = Number(year ?? 2025);
  const filePath = path.join(dataRoot, "manifests", `openf1-${targetYear}-season.json`);
  return readJson(filePath);
}

async function resolveSession(args) {
  if (args.sessionKey) {
    const sessions = await fetchSessions({ year: args.season || 2025 });
    const session = sessions.find((item) => Number(item.session_key) === Number(args.sessionKey));
    if (!session) {
      throw new Error(`Session key ${args.sessionKey} not found.`);
    }

    // Try to find matching session in manifest for correct slug
    try {
      const manifest = await getSeasonManifest(session.year || args.season);
      const manifestSessions = manifest.grandsPrix.flatMap((gp) => gp.sessions);
      const manifestSession = manifestSessions.find(
        (ms) => Number(ms.sessionKey) === Number(args.sessionKey)
      );
      if (manifestSession) {
        session._manifestSlug = manifestSession.grandPrixSlug;
        session._manifestGpName = manifestSession.grandPrixName;
      }
    } catch {
      // Ignore manifest lookup errors
    }
    return session;
  }

  const manifest = await getSeasonManifest(args.season);
  const sessions = manifest.grandsPrix.flatMap((grandPrix) => grandPrix.sessions);

  if (args.grandPrixSlug && args.sessionSlug) {
    const session = sessions.find(
      (item) => item.grandPrixSlug === args.grandPrixSlug && item.sessionSlug === args.sessionSlug,
    );
    if (!session) {
      throw new Error(`Session ${args.grandPrixSlug}/${args.sessionSlug} not found in season manifest.`);
    }
    return {
      year: session.season,
      meeting_name: session.grandPrixName,
      session_name: session.sessionName,
      session_key: session.sessionKey,
      circuit_short_name: session.trackId,
      date_start: session.startDate,
      date_end: session.endDate,
      location: session.location,
      country_name: session.countryName,
    };
  }

  const qualifyingSessions = sessions.filter((session) => session.sessionName === "Qualifying");
  const latest = qualifyingSessions.at(-1) || sessions.at(-1);
  if (!latest) {
    throw new Error(`No sessions found in OpenF1 ${args.season ?? 2025} season manifest.`);
  }

  return {
    year: latest.season,
    meeting_name: latest.grandPrixName,
    session_name: latest.sessionName,
    session_key: latest.sessionKey,
    circuit_short_name: latest.trackId,
    date_start: latest.startDate,
    date_end: latest.endDate,
    location: latest.location,
    country_name: latest.countryName,
  };
}

function buildDriverInfo(driversRaw) {
  const driverNumbers = [...new Set(driversRaw.map((d) => d.driver_number))];

  return driverNumbers.map((driverNumber) => {
    const driver = driversRaw.find((d) => d.driver_number === driverNumber);
    const teamName = driver?.team_name || "Unknown";
    const teamColor = TEAM_COLORS[teamName] || "#888888";

    return {
      driverCode: driver?.name_acronym || String(driverNumber),
      driverNumber: driverNumber,
      fullName: driver?.full_name || `${driverNumber}`,
      team: teamName,
      teamColor,
    };
  });
}

/**
 * Returns the canonical centerline polyline for a circuit, sourced from
 * `data/track-shapes/<trackId>.json`. Falls back to the legacy hand-coded
 * generator when no canonical shape is available.
 *
 * Aliases are resolved so the OpenF1 trackId (e.g. "albert-park") still
 * matches our canonical filename (e.g. "melbourne").
 */
function loadCanonicalTrackShape(trackId) {
  const slug = String(trackId || "").toLowerCase();

  // Per-trackId alias map: keep the canonical filename on the right side.
  const aliasMap = {
    "albert-park": "melbourne",
    "yas-marina": "yas-marina-circuit",
    "abu-dhabi": "yas-marina-circuit",
    "spa-francorchamps": "spa",
    "sao-paulo": "interlagos",
    "saopaulo": "interlagos",
    "catalunya": "barcelona",
    "red-bull-ring": "spielberg",
    "emilia-romagna": "imola",
    "hungaroring": "budapest",
    "cota": "austin",
    "china": "shanghai",
    "marina-bay": "singapore",
    "bahrain": "sakhir",
    "autodromo": "mexico",
    "azerbaijan": "baku",
    "saudi-arabian": "jeddah",
    "las-vegas": "lasvegas",
    "qatar": "lusail",
    "canada": "montreal",
    "yas-island": "yas-marina-circuit",
    "monte-carlo": "monaco",
    "mexico-city": "mexico",
  };

  const canonicalSlug = aliasMap[slug] ?? slug;
  const filePath = path.join(dataRoot, "track-shapes", `${canonicalSlug}.json`);
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    if (Array.isArray(raw.centerline) && raw.centerline.length >= 32) {
      return raw;
    }
  } catch {
    // Missing or invalid -- fall back below.
  }
  return null;
}

function generateTrackPath(trackId) {
  const canonical = loadCanonicalTrackShape(trackId);
  if (canonical) {
    // Canonical shapes are already rotated to broadcast orientation and centered.
    // Densify to keep the runtime renderer happy without changing the underlying shape.
    return densifyPath(canonical.centerline, 4);
  }

  const trackShapes = {
    melbourne: generateOvalPath(900, 600, 16),
    bahrain: generateBahrainPath(),
    jeddah: generateFastFlowPath(1000, 500, 14),
    suzuka: generateSuzukaPath(),
    monaco: generateMonacoPath(),
    silverstone: generateSilverstonePath(),
    spa: generateSpaPath(),
    monza: generateMonzaPath(),
    hungaroring: generateHungaryPath(),
    interlagos: generateInterlagosPath(),
    mexico: generateMexicoPath(),
    lasvegas: generateLasVegasPath(),
    miami: generateMiamiPath(),
    singapore: generateSingaporePath(),
    baku: generateBakuPath(),
    "yas-marina-circuit": generateYasMarinaPath(),
    default: generateOvalPath(900, 600, 12),
  };

  return trackShapes[trackId] || trackShapes.default;
}

function generateOvalPath(width, height, segments) {
  const points = [];
  const cx = 0;
  const cy = 0;
  const rx = width / 2;
  const ry = height / 2;

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }

  return smoothPath(points);
}

function generateRoundedRectPath(width, height, corners) {
  const points = [];
  const w = width / 2 - 50;
  const h = height / 2 - 50;
  const r = Math.min(w, h) * 0.3;

  const segments = corners * 4;

  let x = -w;
  let y = -h + r;

  for (let i = 0; i < segments; i++) {
    points.push([x, y]);

    const segProgress = (i % (segments / 4)) / (segments / 4);

    if (segProgress < 0.15) {
      const cornerAngle = -Math.PI / 2 + (segProgress / 0.15) * (Math.PI / 2);
      x = -w + r + Math.cos(cornerAngle) * r;
      y = -h + r + Math.sin(cornerAngle) * r;
    } else if (segProgress < 0.85) {
      const moveAngle = [0, -Math.PI / 2, Math.PI, Math.PI / 2][Math.floor(i / (segments / 4))];
      x += Math.cos(moveAngle) * (w * 2 / (segments / 4 - 1));
      y += Math.sin(moveAngle) * (h * 2 / (segments / 4 - 1));
    } else {
      const cornerAngle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(i / (segments / 4))];
      x = -w + r + Math.cos(cornerAngle) * r;
      y = -h + r + Math.sin(cornerAngle) * r;
    }
  }

  return smoothPath(points);
}

function generateFastFlowPath(width, height, turns) {
  const points = [];
  const cx = 0;
  const cy = 0;
  const segments = turns * 3;

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const angle = t * Math.PI * 2;
    const rx = width / 2 * (0.9 + 0.1 * Math.sin(angle * 3));
    const ry = height / 2 * (0.85 + 0.15 * Math.cos(angle * 2));
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }

  return smoothPath(points);
}

function generateTechnicalPath(width, height, turns) {
  const points = [];
  const cx = 0;
  const cy = 0;
  const segments = turns * 4;

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const angle = t * Math.PI * 2;
    const rx = width / 2;
    const ry = height / 2;
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }

  return smoothPath(points);
}

function generateTightWindingPath(width, height, turns) {
  const points = [];
  const cx = 0;
  const cy = 0;
  const segments = turns * 5;

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const angle = t * Math.PI * 2;
    const rx = width / 2 * (0.7 + 0.3 * Math.sin(t * Math.PI * 6));
    const ry = height / 2 * (0.7 + 0.3 * Math.cos(t * Math.PI * 4));
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }

  return smoothPath(points);
}

function generateBahrainPath() {
  const points = [];
  const w = 500, h = 280;
  points.push([0, -h]);
  points.push([w * 0.7, -h]);
  points.push([w, -h * 0.6]);
  points.push([w, -h * 0.2]);
  points.push([w * 0.8, h * 0.1]);
  points.push([w * 0.5, h * 0.3]);
  points.push([w * 0.2, h * 0.5]);
  points.push([-w * 0.3, h * 0.7]);
  points.push([-w * 0.7, h * 0.4]);
  points.push([-w, h * 0.2]);
  points.push([-w, -h * 0.3]);
  points.push([-w * 0.6, -h * 0.7]);
  points.push([-w * 0.2, -h]);
  points.push([0, -h]);
  return smoothPath(points);
}

function generateSuzukaPath() {
  const points = [];
  const w = 450, h = 300;
  points.push([0, -h]);
  points.push([w * 0.4, -h]);
  points.push([w * 0.8, -h * 0.7]);
  points.push([w, -h * 0.3]);
  points.push([w * 0.9, h * 0.2]);
  points.push([w * 0.6, h * 0.6]);
  points.push([w * 0.3, h]);
  points.push([-w * 0.2, h * 0.8]);
  points.push([-w * 0.6, h * 0.5]);
  points.push([-w, h * 0.1]);
  points.push([-w * 0.9, -h * 0.2]);
  points.push([-w * 0.7, -h * 0.6]);
  points.push([-w * 0.3, -h * 0.9]);
  points.push([0, -h]);
  return smoothPath(points);
}

function generateMonacoPath() {
  const points = [];
  const w = 400, h = 250;
  points.push([0, -h]);
  points.push([w * 0.5, -h]);
  points.push([w, -h * 0.5]);
  points.push([w, 0]);
  points.push([w * 0.8, h * 0.3]);
  points.push([w * 0.4, h * 0.6]);
  points.push([0, h * 0.8]);
  points.push([-w * 0.5, h * 0.6]);
  points.push([-w, h * 0.3]);
  points.push([-w, -h * 0.2]);
  points.push([-w * 0.6, -h * 0.5]);
  points.push([-w * 0.2, -h * 0.8]);
  points.push([0, -h]);
  return smoothPath(points);
}

function generateSilverstonePath() {
  const points = [];
  const w = 500, h = 350;
  points.push([0, -h * 0.6]);
  points.push([w * 0.4, -h]);
  points.push([w * 0.8, -h * 0.8]);
  points.push([w, -h * 0.4]);
  points.push([w * 0.9, 0]);
  points.push([w * 0.7, h * 0.4]);
  points.push([w * 0.3, h * 0.7]);
  points.push([-w * 0.1, h]);
  points.push([-w * 0.5, h * 0.6]);
  points.push([-w, h * 0.2]);
  points.push([-w, -h * 0.3]);
  points.push([-w * 0.6, -h * 0.6]);
  points.push([-w * 0.2, -h * 0.5]);
  points.push([0, -h * 0.6]);
  return smoothPath(points);
}

function generateSpaPath() {
  const points = [];
  const w = 550, h = 300;
  points.push([-w * 0.3, -h]);
  points.push([w * 0.3, -h * 0.8]);
  points.push([w * 0.7, -h * 0.6]);
  points.push([w, -h * 0.2]);
  points.push([w * 0.8, h * 0.2]);
  points.push([w * 0.4, h * 0.5]);
  points.push([0, h * 0.8]);
  points.push([-w * 0.5, h * 0.5]);
  points.push([-w, h * 0.1]);
  points.push([-w * 0.9, -h * 0.2]);
  points.push([-w * 0.7, -h * 0.7]);
  points.push([-w * 0.3, -h]);
  return smoothPath(points);
}

function generateMonzaPath() {
  const points = [];
  const w = 600, h = 350;
  points.push([0, -h]);
  points.push([w * 0.6, -h * 0.7]);
  points.push([w, -h * 0.3]);
  points.push([w * 0.8, h * 0.3]);
  points.push([w * 0.3, h * 0.7]);
  points.push([-w * 0.2, h]);
  points.push([-w * 0.7, h * 0.5]);
  points.push([-w, 0]);
  points.push([-w * 0.8, -h * 0.5]);
  points.push([-w * 0.3, -h * 0.8]);
  points.push([0, -h]);
  return smoothPath(points);
}

function generateHungaryPath() {
  const points = [];
  const w = 450, h = 300;
  points.push([0, -h]);
  points.push([w * 0.5, -h * 0.6]);
  points.push([w, -h * 0.2]);
  points.push([w * 0.8, h * 0.3]);
  points.push([w * 0.3, h * 0.6]);
  points.push([-w * 0.2, h * 0.8]);
  points.push([-w * 0.6, h * 0.4]);
  points.push([-w, 0]);
  points.push([-w * 0.7, -h * 0.4]);
  points.push([-w * 0.3, -h * 0.7]);
  points.push([0, -h]);
  return smoothPath(points);
}

function generateInterlagosPath() {
  const points = [];
  const w = 450, h = 320;
  points.push([0, -h]);
  points.push([w * 0.4, -h * 0.8]);
  points.push([w * 0.8, -h * 0.4]);
  points.push([w, 0]);
  points.push([w * 0.7, h * 0.5]);
  points.push([w * 0.2, h * 0.9]);
  points.push([-w * 0.3, h * 0.6]);
  points.push([-w * 0.7, h * 0.2]);
  points.push([-w, -h * 0.2]);
  points.push([-w * 0.6, -h * 0.7]);
  points.push([-w * 0.2, -h * 0.9]);
  points.push([0, -h]);
  return smoothPath(points);
}

function generateMexicoPath() {
  const points = [];
  const w = 400, h = 280;
  points.push([0, -h]);
  points.push([w * 0.5, -h * 0.7]);
  points.push([w, -h * 0.3]);
  points.push([w * 0.9, h * 0.2]);
  points.push([w * 0.5, h * 0.6]);
  points.push([0, h * 0.9]);
  points.push([-w * 0.5, h * 0.5]);
  points.push([-w, 0]);
  points.push([-w * 0.8, -h * 0.4]);
  points.push([-w * 0.4, -h * 0.8]);
  points.push([0, -h]);
  return smoothPath(points);
}

function generateLasVegasPath() {
  const points = [];
  const w = 550, h = 250;
  points.push([-w * 0.3, -h]);
  points.push([w * 0.3, -h * 0.8]);
  points.push([w, -h * 0.3]);
  points.push([w * 0.8, h * 0.3]);
  points.push([w * 0.2, h * 0.7]);
  points.push([-w * 0.4, h * 0.5]);
  points.push([-w, 0]);
  points.push([-w * 0.7, -h * 0.5]);
  points.push([-w * 0.3, -h]);
  return smoothPath(points);
}

function generateMiamiPath() {
  const points = [];
  const w = 500, h = 300;
  points.push([0, -h]);
  points.push([w * 0.5, -h * 0.6]);
  points.push([w, -h * 0.2]);
  points.push([w * 0.8, h * 0.3]);
  points.push([w * 0.3, h * 0.7]);
  points.push([-w * 0.2, h * 0.9]);
  points.push([-w * 0.6, h * 0.4]);
  points.push([-w, 0]);
  points.push([-w * 0.7, -h * 0.5]);
  points.push([-w * 0.3, -h * 0.8]);
  points.push([0, -h]);
  return smoothPath(points);
}

function generateSingaporePath() {
  const points = [];
  const w = 420, h = 300;
  points.push([0, -h]);
  points.push([w * 0.4, -h * 0.7]);
  points.push([w * 0.8, -h * 0.3]);
  points.push([w, h * 0.1]);
  points.push([w * 0.7, h * 0.5]);
  points.push([w * 0.2, h * 0.8]);
  points.push([-w * 0.3, h * 0.6]);
  points.push([-w * 0.7, h * 0.2]);
  points.push([-w, -h * 0.2]);
  points.push([-w * 0.6, -h * 0.6]);
  points.push([-w * 0.2, -h * 0.9]);
  points.push([0, -h]);
  return smoothPath(points);
}

function generateBakuPath() {
  const points = [];
  const w = 450, h = 250;
  points.push([0, -h]);
  points.push([w * 0.5, -h * 0.7]);
  points.push([w, -h * 0.2]);
  points.push([w * 0.8, h * 0.4]);
  points.push([w * 0.3, h * 0.8]);
  points.push([-w * 0.3, h * 0.6]);
  points.push([-w, h * 0.1]);
  points.push([-w * 0.7, -h * 0.3]);
  points.push([-w * 0.3, -h * 0.8]);
  points.push([0, -h]);
  return smoothPath(points);
}

function generateYasMarinaPath() {
  const points = [
    [-515, -96],
    [-405, -155],
    [-250, -192],
    [-72, -212],
    [116, -188],
    [286, -146],
    [432, -92],
    [512, -18],
    [496, 52],
    [410, 82],
    [292, 76],
    [170, 50],
    [62, 80],
    [18, 126],
    [72, 174],
    [188, 208],
    [322, 216],
    [426, 176],
    [448, 112],
    [386, 58],
    [280, 24],
    [152, 8],
    [46, -6],
    [-68, 22],
    [-166, 76],
    [-274, 126],
    [-402, 106],
    [-500, 48],
    [-532, -28],
    [-515, -96],
  ];

  return densifyPath(smoothPath(points), 5);
}

function densifyPath(points, stepsPerSegment = 4) {
  if (points.length < 2) return points;
  const dense = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    for (let step = 0; step < stepsPerSegment; step += 1) {
      const ratio = step / stepsPerSegment;
      dense.push([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ]);
    }
  }
  dense.push(points.at(-1));
  return dense;
}

function smoothPath(points) {
  if (points.length < 3) return points;

  const smoothed = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    smoothed.push([
      curr[0] * 0.5 + (prev[0] + next[0]) * 0.25,
      curr[1] * 0.5 + (prev[1] + next[1]) * 0.25,
    ]);
  }
  smoothed.push(points[points.length - 1]);

  return smoothed;
}

function interpolatePosition(trackPath, ratio) {
  if (!trackPath || trackPath.length < 2) return [0, 0];

  const totalSegments = trackPath.length;
  const segmentIndex = Math.floor(ratio * (totalSegments - 1));
  const segmentRatio = (ratio * (totalSegments - 1)) - segmentIndex;

  const p1 = trackPath[segmentIndex];
  const p2 = trackPath[(segmentIndex + 1) % totalSegments];

  return [
    p1[0] + (p2[0] - p1[0]) * segmentRatio,
    p1[1] + (p2[1] - p1[1]) * segmentRatio,
  ];
}

/**
 * Fit a similarity transform (translate + uniform scale) that maps the OpenF1
 * GPS cloud onto the canonical `trackPath` coordinate frame. OpenF1 location is
 * in metres around an arbitrary origin; the canonical centerline is rotated to
 * broadcast orientation and centered. We align by centroid and by the spread
 * (RMS radius) of each cloud. Rotation is resolved separately by testing a few
 * candidate angles and picking the one whose projected points hug the track
 * centerline most tightly.
 */
function fitGpsTransform(gpsPoints, trackPath) {
  if (!gpsPoints.length || !trackPath || trackPath.length < 8) return null;

  const gpsCentroid = meanPoint(gpsPoints.map((p) => [p.x, p.y]));
  const trackCentroid = meanPoint(trackPath);
  const gpsSpread = rmsRadius(gpsPoints.map((p) => [p.x, p.y]), gpsCentroid) || 1;
  const trackSpread = rmsRadius(trackPath, trackCentroid) || 1;
  const scale = trackSpread / gpsSpread;

  // Sample a subset of GPS points for the rotation search (cheap).
  const sample = [];
  const step = Math.max(1, Math.floor(gpsPoints.length / 600));
  for (let i = 0; i < gpsPoints.length; i += step) sample.push(gpsPoints[i]);

  let bestAngle = 0;
  let bestError = Infinity;
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let error = 0;
    for (const p of sample) {
      const dx = (p.x - gpsCentroid[0]) * scale;
      const dy = (p.y - gpsCentroid[1]) * scale;
      const tx = trackCentroid[0] + dx * cos - dy * sin;
      const ty = trackCentroid[1] + dx * sin + dy * cos;
      error += nearestTrackDistanceSq(trackPath, tx, ty);
    }
    if (error < bestError) {
      bestError = error;
      bestAngle = rad;
    }
  }

  const cos = Math.cos(bestAngle);
  const sin = Math.sin(bestAngle);
  return { gpsCentroid, trackCentroid, scale, cos, sin };
}

function applyGpsTransform(transform, x, y) {
  const dx = (x - transform.gpsCentroid[0]) * transform.scale;
  const dy = (y - transform.gpsCentroid[1]) * transform.scale;
  return [
    transform.trackCentroid[0] + dx * transform.cos - dy * transform.sin,
    transform.trackCentroid[1] + dx * transform.sin + dy * transform.cos,
  ];
}

function meanPoint(points) {
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p[0];
    sy += p[1];
  }
  return [sx / points.length, sy / points.length];
}

function rmsRadius(points, centroid) {
  let sum = 0;
  for (const p of points) {
    const dx = p[0] - centroid[0];
    const dy = p[1] - centroid[1];
    sum += dx * dx + dy * dy;
  }
  return Math.sqrt(sum / points.length);
}

function nearestTrackDistanceSq(trackPath, x, y) {
  let best = Infinity;
  // Coarse stride keeps the rotation search affordable; the final projection
  // for real frames uses the full-resolution nearest search.
  const stride = Math.max(1, Math.floor(trackPath.length / 200));
  for (let i = 0; i < trackPath.length; i += stride) {
    const dx = trackPath[i][0] - x;
    const dy = trackPath[i][1] - y;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return best;
}

function projectToTrackPath(trackPath, x, y) {
  let bestIndex = 0;
  let best = Infinity;
  for (let i = 0; i < trackPath.length; i += 1) {
    const dx = trackPath[i][0] - x;
    const dy = trackPath[i][1] - y;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bestIndex = i;
    }
  }
  return { x: trackPath[bestIndex][0], y: trackPath[bestIndex][1], index: bestIndex };
}

function determineSafetyCarPhase(raceControlMessages, t) {
  if (!raceControlMessages || raceControlMessages.length === 0) return "none";

  for (const msg of raceControlMessages) {
    const msgStart = new Date(msg.date_start).getTime();
    const msgEnd = msg.date_end ? new Date(msg.date_end).getTime() : Infinity;

    if (t >= msgStart && t <= msgEnd && (msg.flag === "SC" || msg.flag === "RED")) {
      const timeSinceSC = t - msgStart;
      const DEPLOY_DURATION = 4000;

      if (timeSinceSC < DEPLOY_DURATION) return "deploying";
      if (msg.flag === "RED") return "none";
      return "on_track";
    }
  }

  return "none";
}

async function buildReplayPack(sessionKey, drivers, ref) {
  process.stdout.write(`Fetching position data for session ${sessionKey}...\n`);

  const allPositionData = [];

  for (const driver of drivers) {
    try {
      const positions = await fetchPosition({ sessionKey, driverNumber: driver.driverNumber });
      if (positions && positions.length > 0) {
        allPositionData.push({
          driverCode: driver.driverCode,
          driverNumber: driver.driverNumber,
          positions,
        });
      }
      await sleep(200);
    } catch (err) {
      process.stderr.write(`Warning: Failed to fetch positions for driver ${driver.driverNumber}: ${err.message}\n`);
    }
  }

  process.stdout.write(`Fetched position data for ${allPositionData.length} drivers.\n`);

  process.stdout.write(`Fetching GPS location data...\n`);
  const allLocationData = [];
  for (const driver of drivers) {
    try {
      const locations = await fetchLocation({ sessionKey, driverNumber: driver.driverNumber });
      if (locations && locations.length > 0) {
        allLocationData.push({
          driverCode: driver.driverCode,
          driverNumber: driver.driverNumber,
          locations,
        });
      }
      await sleep(200);
    } catch (err) {
      process.stderr.write(`Warning: Failed to fetch location for driver ${driver.driverNumber}: ${err.message}\n`);
    }
  }
  process.stdout.write(`Fetched GPS location for ${allLocationData.length} drivers.\n`);

  process.stdout.write(`Fetching car telemetry data...\n`);
  const carDataByDriver = new Map();

  for (const driver of drivers) {
    try {
      const carData = await fetchCarData({ sessionKey, driverNumber: driver.driverNumber });
      if (carData && carData.length > 0) {
        carDataByDriver.set(driver.driverNumber, carData);
      }
      await sleep(200);
    } catch (err) {
      process.stderr.write(`Warning: Failed to fetch car data for driver ${driver.driverNumber}: ${err.message}\n`);
    }
  }

  process.stdout.write(`Fetched telemetry for ${carDataByDriver.size} drivers.\n`);

  process.stdout.write(`Fetching lap, weather, and stint data...\n`);
  const [lapsRaw, weatherRaw, stintsRaw] = await Promise.all([
    fetchLaps({ sessionKey }),
    fetchWeather({ sessionKey }).catch(() => []),
    fetchStints({ sessionKey }).catch(() => []),
  ]);

  process.stdout.write(`Fetching race control data...\n`);
  let raceControlMessages = [];
  try {
    raceControlMessages = await fetchRaceControl({ sessionKey });
  } catch (err) {
    process.stderr.write(`Warning: Failed to fetch race control: ${err.message}\n`);
  }

  process.stdout.write(`Building replay frames...\n`);

  const trackPath = generateTrackPath(ref.trackId);
  const trackMetadata = loadCanonicalTrackShape(ref.trackId);

  const sessionStartTime = getReplayStartTime(ref, lapsRaw, carDataByDriver, allPositionData);
  const lapTimelines = buildLapTimelines(lapsRaw);
  const stintTimelines = buildStintTimelines(stintsRaw);
  const raceControlTimeline = buildRaceControlTimeline(raceControlMessages, sessionStartTime);
  const weatherSummary = summarizeWeather(weatherRaw);
  const weatherTimeline = buildWeatherTimeline(weatherRaw, sessionStartTime);
  const replayLaps = enrichReplayLapsWithStints(buildReplayLaps(lapsRaw, drivers), drivers, stintTimelines);

  const telemetryByDriver = new Map();
  carDataByDriver.forEach((data, driverNumber) => {
    const samples = data
      .map((point) => ({
        t: isoToMs(point.date) - sessionStartTime,
        speed: point.speed == null ? null : Math.max(0, Number(point.speed)),
        throttle: point.throttle == null ? null : Math.max(0, Math.min(100, Number(point.throttle))),
        brake: point.brake == null ? null : Math.max(0, Math.min(100, Number(point.brake))),
        gear: point.n_gear == null ? null : Number(point.n_gear),
        rpm: point.rpm == null ? null : Math.max(0, Number(point.rpm)),
        drs: point.drs == null ? null : Number(point.drs),
      }))
      .filter((point) => point.t >= 0)
      .sort((left, right) => left.t - right.t);
    telemetryByDriver.set(driverNumber, samples);
  });

  const positionByDriverTime = new Map();
  for (const data of allPositionData) {
    const sorted = data.positions
      .map((position) => ({
        t: isoToMs(position.date) - sessionStartTime,
        position: Number(position.position),
      }))
      .filter((position) => position.t >= 0 && Number.isFinite(position.position))
      .sort((left, right) => left.t - right.t);
    positionByDriverTime.set(data.driverCode, sorted);
  }

  // Build GPS location timelines per driver and fit a single GPS->canonical
  // transform from the combined cloud of all drivers (more stable than fitting
  // per driver). Each frame then projects the real GPS sample onto trackPath to
  // get a true on-track coordinate. Falls back to the synthetic lap-progress
  // path when GPS is unavailable for a driver/frame.
  const locationByDriverTime = new Map();
  const combinedGpsCloud = [];
  for (const data of allLocationData) {
    const sorted = data.locations
      .map((loc) => ({
        t: isoToMs(loc.date) - sessionStartTime,
        x: Number(loc.x),
        y: Number(loc.y),
      }))
      .filter((loc) => loc.t >= 0 && Number.isFinite(loc.x) && Number.isFinite(loc.y) && (loc.x !== 0 || loc.y !== 0))
      .sort((left, right) => left.t - right.t);
    if (sorted.length) {
      locationByDriverTime.set(data.driverCode, sorted);
      for (let i = 0; i < sorted.length; i += Math.max(1, Math.floor(sorted.length / 400))) {
        combinedGpsCloud.push(sorted[i]);
      }
    }
  }
  const gpsTransform = combinedGpsCloud.length >= 50
    ? fitGpsTransform(combinedGpsCloud, trackPath)
    : null;
  process.stdout.write(gpsTransform
    ? `GPS transform fitted from ${combinedGpsCloud.length} samples across ${locationByDriverTime.size} drivers.\n`
    : `No GPS transform (insufficient location data); using synthetic path.\n`);

  const sessionEndCandidates = [isoToMs(ref.endDate) - sessionStartTime];
  for (const lapTimeline of lapTimelines.values()) {
    if (lapTimeline.length) {
      sessionEndCandidates.push(lapTimeline[lapTimeline.length - 1].endMs - sessionStartTime);
    }
  }
  for (const samples of telemetryByDriver.values()) {
    if (samples.length) {
      sessionEndCandidates.push(samples[samples.length - 1].t);
    }
  }
  if (raceControlTimeline.length) {
    sessionEndCandidates.push(raceControlTimeline[raceControlTimeline.length - 1].t);
  }

  const sessionDurationS = Math.max(...sessionEndCandidates, 0) / 1000;
  const frameInterval = Math.max(2, Math.ceil(sessionDurationS / 900));
  const totalFrames = Math.max(1, Math.floor(sessionDurationS / frameInterval) + 1);

  if (totalFrames <= 0) {
    throw new Error("Session duration too short or invalid.");
  }

  process.stdout.write(`Building ${totalFrames} frames...\n`);

  const frames = [];

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const t = frameIndex * frameInterval * 1000;
    const frameTime = frameIndex * frameInterval;

    const frameDrivers = {};
    const driverStates = [];

    for (const driver of drivers) {
      const positionHistory = positionByDriverTime.get(driver.driverCode) || [];
      const positionIndex = positionHistory.length ? findLatestIndex(positionHistory, t, (entry) => entry.t) : -1;
      const fallbackPosition = drivers.indexOf(driver) + 1;
      const racePosition = positionIndex >= 0
        ? positionHistory[positionIndex].position
        : fallbackPosition;

      const telemetrySamples = telemetryByDriver.get(driver.driverNumber) || [];
      const telemetryIndex = telemetrySamples.length ? findLatestIndex(telemetrySamples, t, (entry) => entry.t) : -1;
      const telemetry = telemetryIndex >= 0 ? telemetrySamples[telemetryIndex] : null;
      const lapState = getLapState(lapTimelines.get(driver.driverNumber), sessionStartTime + t);
      const tyreState = getTyreState(stintTimelines.get(driver.driverNumber), lapState.lapNumber, lapState.compound);
      const startSpacing = Math.max(0, fallbackPosition - 1) * 0.006;
      const trackRatio = (lapState.lapProgress - startSpacing + 1) % 1;
      const [synthX, synthY] = interpolatePosition(trackPath, trackRatio);

      // Prefer real GPS: find the nearest location sample in time, transform it
      // into the canonical frame, and project onto the centerline. Keep the raw
      // (untransformed) GPS sample for downstream processing.
      let x = synthX;
      let y = synthY;
      let rawX = null;
      let rawY = null;
      let positionSource = "synthetic";
      if (gpsTransform) {
        const locHistory = locationByDriverTime.get(driver.driverCode);
        if (locHistory && locHistory.length) {
          const locIndex = findLatestIndex(locHistory, t, (entry) => entry.t);
          const loc = locIndex >= 0 ? locHistory[locIndex] : null;
          // Only trust the sample if it is reasonably fresh (within ~5s of the
          // frame) so stale GPS doesn't pin a stopped car on track.
          if (loc && Math.abs(loc.t - t) <= 5000) {
            rawX = loc.x;
            rawY = loc.y;
            const [cx, cy] = applyGpsTransform(gpsTransform, loc.x, loc.y);
            const projected = projectToTrackPath(trackPath, cx, cy);
            x = projected.x;
            y = projected.y;
            positionSource = "gps";
          }
        }
      }
      const laneOffset = ((driver.driverNumber % 5) - 2) * 1.8;
      if (positionSource === "synthetic") {
        x = synthX + laneOffset;
        y = synthY - laneOffset;
      }

      const frameDriver = {
        driverCode: driver.driverCode,
        driverNumber: driver.driverNumber,
        team: driver.team,
        position: racePosition,
        x,
        y,
        rawX,
        rawY,
        positionSource,
        speed: telemetry?.speed ?? null,
        throttle: telemetry?.throttle ?? null,
        brake: telemetry?.brake ?? null,
        gear: telemetry?.gear ?? null,
        rpm: telemetry?.rpm ?? null,
        drs: telemetry?.drs ?? null,
        lap: lapState.lapNumber,
        interval: null,
        tyreCompound: tyreState.tyreCompound,
        tyreAge: tyreState.tyreAge,
      };

      frameDrivers[driver.driverCode] = frameDriver;
      driverStates.push({
        driverCode: driver.driverCode,
        racePosition,
        raceProgress: Math.max(0, lapState.lapNumber - 1) + lapState.raceProgressRatio,
        lapDurationS: lapState.lapDurationS,
        trackRatio,
      });
    }

    driverStates.sort((left, right) => {
      if (left.racePosition !== right.racePosition) {
        return left.racePosition - right.racePosition;
      }
      return right.raceProgress - left.raceProgress;
    });

    const leader = driverStates[0] ?? null;
    const referenceLapTime = leader?.lapDurationS || 95;
    driverStates.forEach((state, index) => {
      const frameDriver = frameDrivers[state.driverCode];
      frameDriver.position = index + 1;
      frameDriver.interval = index === 0 || !leader
        ? 0
        : Number(Math.max(0, (leader.raceProgress - state.raceProgress) * referenceLapTime).toFixed(3));
    });

    const scPhase = determineSafetyCarState(raceControlTimeline, t);
    const trackStatus = determineTrackStatus(raceControlTimeline, t);
    const weather = getWeatherState(weatherTimeline, t, weatherSummary);
    const scAnchorRatio = leader ? (leader.trackRatio + 0.03) % 1 : 0;
    const [scX, scY] = interpolatePosition(trackPath, scAnchorRatio);

    frames.push({
      t: frameTime,
      lap: leader ? frameDrivers[leader.driverCode]?.lap ?? null : null,
      drivers: frameDrivers,
      safetyCar: {
        phase: scPhase,
        x: scPhase !== "none" ? scX : null,
        y: scPhase !== "none" ? scY : null,
      },
      trackStatus,
      weather,
    });

    if (frameIndex % 50 === 0) {
      process.stdout.write(`  Frame ${frameIndex}/${totalFrames}...\n`);
    }
  }

  return {
    replayLaps,
    weatherSummary,
    raceControlTimeline,
    frames,
    trackPath,
    trackMetadata,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const session = await resolveSession(args);
  const ref = normalizeSessionRef(session, {
    grandPrixSlug: session._manifestSlug,
    grandPrixName: session._manifestGpName,
  });

  process.stdout.write(`Building replay pack for ${ref.grandPrixName} ${ref.sessionName} (session_key=${ref.sessionKey})\n`);

  const driversRaw = await fetchDrivers({ sessionKey: ref.sessionKey });
  const drivers = buildDriverInfo(driversRaw);

  process.stdout.write(`Found ${drivers.length} drivers.\n`);

  const {
    frames,
    raceControlTimeline,
    replayLaps,
    trackPath,
    trackMetadata,
    weatherSummary,
  } = await buildReplayPack(ref.sessionKey, drivers, ref);

  if (frames.length === 0) {
    throw new Error("Failed to build any frames.");
  }

  process.stdout.write(`Built ${frames.length} frames.\n`);

  const replayPack = {
    generatedAt: new Date().toISOString(),
    sessionKey: ref.sessionKey,
    season: ref.season,
    grandPrix: ref.grandPrixName,
    session: ref.sessionName,
    trackId: ref.trackId,
    source: "openf1",
    note: "Replay timing derived from OpenF1 lap, stint, weather, race control, and car telemetry data. Car coordinates use OpenF1 GPS location projected onto the canonical track when available, with a synthetic lap-progress fallback per driver/frame.",
    weatherSummary,
    drivers: drivers.map((d) => ({
      driverCode: d.driverCode,
      driverNumber: d.driverNumber,
      fullName: d.fullName,
      team: d.team,
      teamColor: d.teamColor,
    })),
    trackPath,
    trackMetadata: trackMetadata
      ? {
          trackId: trackMetadata.trackId,
          name: trackMetadata.name,
          rotationDeg: trackMetadata.rotationDeg,
          length: trackMetadata.length,
          corners: trackMetadata.corners,
          drsZones: trackMetadata.drsZones,
          source: trackMetadata.source,
        }
      : null,
    laps: replayLaps,
    raceControlMessages: raceControlTimeline,
    frames,
  };

  const base = path.join("packs", "seasons", String(ref.season), ref.grandPrixSlug, ref.sessionSlug);

  await writeJson(path.join(base, "replay.json"), replayPack);

  const manifestRelativePath = path.join(base, "manifest.json");
  const manifestPath = path.join(dataRoot, manifestRelativePath);
  let manifest = { sessionKey: ref.sessionKey };
  try {
    manifest = await readJson(manifestPath);
  } catch {}
  manifest.replay = "replay.json";
  await writeJson(manifestRelativePath, manifest);

  const summary = {
    season: ref.season,
    grandPrix: ref.grandPrixName,
    session: ref.sessionName,
    sessionKey: ref.sessionKey,
    trackId: ref.trackId,
    generatedAt: new Date().toISOString(),
    source: "openf1",
    drivers: drivers.map((d) => d.driverCode),
    weatherSummary,
  };
  await writeJson(path.join(base, "summary.json"), summary);

  process.stdout.write(`Built replay pack at ${base}/replay.json\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
