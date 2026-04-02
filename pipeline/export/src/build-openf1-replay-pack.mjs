import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "path";
import {
  fetchCarData,
  fetchDrivers,
  fetchLaps,
  fetchPosition,
  fetchRaceControl,
  fetchSessions,
} from "../../ingest/src/openf1-client.mjs";
import { slugify } from "../../normalize/src/normalize-session.mjs";

const root = path.resolve(process.cwd());
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

async function getSeasonManifest() {
  const filePath = path.join(dataRoot, "manifests", "openf1-2025-season.json");
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
      const manifest = await getSeasonManifest();
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

  const manifest = await getSeasonManifest();
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
    throw new Error("No sessions found in OpenF1 2025 season manifest.");
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

function generateTrackPath(trackId) {
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

  process.stdout.write(`Fetching race control data...\n`);
  let raceControlMessages = [];
  try {
    raceControlMessages = await fetchRaceControl({ sessionKey });
  } catch (err) {
    process.stderr.write(`Warning: Failed to fetch race control: ${err.message}\n`);
  }

  process.stdout.write(`Building replay frames...\n`);

  const trackPath = generateTrackPath(ref.trackId);

  const sessionStartTime = new Date(ref.startDate).getTime();
  const sessionEndTime = new Date(ref.endDate).getTime();
  const sessionDurationS = (sessionEndTime - sessionStartTime) / 1000;

  const frameInterval = 2;
  const totalFrames = Math.min(Math.floor(sessionDurationS / frameInterval), 300);

  if (totalFrames <= 0) {
    throw new Error("Session duration too short or invalid.");
  }

  process.stdout.write(`Building ${totalFrames} frames...\n`);

  const positionByDriverTime = new Map();
  for (const data of allPositionData) {
    const sorted = data.positions
      .map((p) => ({ t: new Date(p.date).getTime() - sessionStartTime, position: p.position }))
      .filter((p) => p.t >= 0)
      .sort((a, b) => a.t - b.t);
    positionByDriverTime.set(data.driverCode, sorted);
  }

  const speedByDriverTime = new Map();
  carDataByDriver.forEach((data, driverNumber) => {
    if (data && data.length > 0) {
      const speedMap = new Map();
      data.forEach((d) => {
        const t = new Date(d.date).getTime() - sessionStartTime;
        if (t >= 0) {
          speedMap.set(t, d.speed || 0);
        }
      });
      speedByDriverTime.set(driverNumber, speedMap);
    }
  });

  const frames = [];

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const t = frameIndex * frameInterval * 1000;
    const frameTime = frameIndex * frameInterval;

    const frameDrivers = {};

    for (const driver of drivers) {
      const positionHistory = positionByDriverTime.get(driver.driverCode) || [];
      const currentPosIdx = positionHistory.findIndex((p) => p.t > t);
      const racePosition = currentPosIdx > 0
        ? positionHistory[currentPosIdx - 1].position
        : positionHistory.length > 0
          ? positionHistory[positionHistory.length - 1].position
          : drivers.indexOf(driver) + 1;

      const speedMap = speedByDriverTime.get(driver.driverNumber);
      let speed = 180;
      if (speedMap && speedMap.size > 0) {
        let closestT = 0;
        let closestSpeed = 180;
        speedMap.forEach((s, time) => {
          if (time <= t && time > closestT) {
            closestT = time;
            closestSpeed = s;
          }
        });
        speed = closestSpeed;
      }

      const carData = carDataByDriver.get(driver.driverNumber);
      let throttle = 60, brake = 0, gear = 7, drs = 0;
      if (carData && carData.length > 0) {
        const closestSample = carData.reduce((prev, curr) => {
          const currT = new Date(curr.date).getTime() - sessionStartTime;
          const prevT = new Date(prev.date).getTime() - sessionStartTime;
          return Math.abs(currT - t) < Math.abs(prevT - t) ? curr : prev;
        });

        throttle = closestSample.throttle || 60;
        brake = closestSample.brake || 0;
        gear = closestSample.n_gear || 7;
        drs = closestSample.drs || 0;
      }

      const positionRatio = Math.max(0, Math.min(1, (racePosition - 1) / Math.max(1, drivers.length - 1)));
      const lapOffset = ((t / 1000) / 90) % 1;
      const trackRatio = (1 - positionRatio) * 0.95 + lapOffset * 0.05;

      const jitter = speed > 0 ? (Math.random() - 0.5) * 1.5 : 0;
      const [baseX, baseY] = interpolatePosition(trackPath, trackRatio);
      const x = baseX + jitter;
      const y = baseY + jitter;

      const currentLap = Math.floor(frameTime / 90) + 1;

      frameDrivers[driver.driverCode] = {
        driverCode: driver.driverCode,
        driverNumber: driver.driverNumber,
        team: driver.team,
        position: racePosition,
        x,
        y,
        speed,
        throttle,
        brake,
        gear,
        drs,
        lap: currentLap,
        interval: racePosition === 1 ? 0 : (racePosition - 1) * 2.0 + Math.random() * 0.3,
        tyreCompound: "MEDIUM",
        tyreAge: Math.floor(currentLap / 12),
      };
    }

    const sortedDrivers = Object.values(frameDrivers).sort((a, b) => a.position - b.position);
    sortedDrivers.forEach((driver, idx) => {
      driver.position = idx + 1;
    });

    const scPhase = determineSafetyCarPhase(raceControlMessages, t);

    frames.push({
      t: frameTime,
      drivers: frameDrivers,
      safetyCar: {
        phase: scPhase,
        x: scPhase !== "none" ? trackPath[0][0] : null,
        y: scPhase !== "none" ? trackPath[0][1] : null,
      },
      trackStatus: scPhase === "none" ? "GREEN" : "SC",
    });

    if (frameIndex % 50 === 0) {
      process.stdout.write(`  Frame ${frameIndex}/${totalFrames}...\n`);
    }
  }

  return {
    frames,
    trackPath,
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

  const { frames, trackPath } = await buildReplayPack(ref.sessionKey, drivers, ref);

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
    note: "Position data derived from OpenF1 race_position. For true X/Y GPS coordinates, use FastF1 Python pipeline.",
    drivers: drivers.map((d) => ({
      driverCode: d.driverCode,
      driverNumber: d.driverNumber,
      fullName: d.fullName,
      team: d.team,
      teamColor: d.teamColor,
    })),
    trackPath,
    laps: [],
    frames,
  };

  const base = path.join("packs", "seasons", String(ref.season), ref.grandPrixSlug, ref.sessionSlug);

  await writeJson(path.join(base, "replay.json"), replayPack);

  const manifestPath = path.join(base, "manifest.json");
  let manifest = { sessionKey: ref.sessionKey };
  try {
    manifest = await readJson(manifestPath);
  } catch {}
  manifest.replay = "replay.json";
  await writeJson(manifestPath, manifest);

  const summary = {
    season: ref.season,
    grandPrix: ref.grandPrixName,
    session: ref.sessionName,
    sessionKey: ref.sessionKey,
    trackId: ref.trackId,
    generatedAt: new Date().toISOString(),
    source: "openf1",
    drivers: drivers.map((d) => d.driverCode),
    weatherSummary: {
      airTempC: 25,
      trackTempC: 35,
      rainRiskPct: 0,
    },
  };
  await writeJson(path.join(base, "summary.json"), summary);

  process.stdout.write(`Built replay pack at ${base}/replay.json\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
