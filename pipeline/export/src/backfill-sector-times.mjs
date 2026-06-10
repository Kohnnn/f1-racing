import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLaps } from "../../ingest/src/openf1-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const seasonRoots = [
  path.join(root, "data", "packs", "seasons"),
  path.join(root, "apps", "web", "public", "data", "packs", "seasons"),
];

const sectorsBySession = new Map();

async function walk(directory, files = []) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else if (entry.isFile() && entry.name === "replay.json") {
      files.push(fullPath);
    }
  }

  return files;
}

async function getSessionSectors(sessionKey) {
  if (sectorsBySession.has(sessionKey)) {
    return sectorsBySession.get(sessionKey);
  }

  let lapsRaw = [];
  try {
    lapsRaw = await fetchLaps({ sessionKey });
  } catch (error) {
    process.stdout.write(`  /laps fetch failed for session ${sessionKey}: ${error.message}\n`);
  }

  const byDriverLap = new Map();
  for (const lap of lapsRaw) {
    byDriverLap.set(`${Number(lap.driver_number)}|${Number(lap.lap_number)}`, {
      sector1: Number.isFinite(lap.duration_sector_1) ? Number(lap.duration_sector_1) : null,
      sector2: Number.isFinite(lap.duration_sector_2) ? Number(lap.duration_sector_2) : null,
      sector3: Number.isFinite(lap.duration_sector_3) ? Number(lap.duration_sector_3) : null,
    });
  }

  sectorsBySession.set(sessionKey, byDriverLap);
  return byDriverLap;
}

async function backfillPack(filePath) {
  const relative = path.relative(root, filePath);
  const replay = JSON.parse(await readFile(filePath, "utf8"));
  const laps = Array.isArray(replay.laps) ? replay.laps : [];

  if (!laps.length) {
    process.stdout.write(`SKIP (no laps) ${relative}\n`);
    return;
  }

  if (laps.every((lap) => "sector1" in lap)) {
    process.stdout.write(`SKIP (already has sectors) ${relative}\n`);
    return;
  }

  const sessionKey = Number(replay.sessionKey);
  if (!Number.isFinite(sessionKey)) {
    process.stdout.write(`SKIP (no sessionKey) ${relative}\n`);
    return;
  }

  const sectors = await getSessionSectors(sessionKey);
  const driverNumberByCode = new Map(
    (replay.drivers ?? []).map((driver) => [driver.driverCode, Number(driver.driverNumber)]),
  );

  let matched = 0;
  const nextLaps = laps.map((lap) => {
    const driverNumber = driverNumberByCode.get(lap.driverCode) ?? Number(lap.driverCode);
    const sector = sectors.get(`${driverNumber}|${Number(lap.lapNumber)}`) ?? null;
    if (sector && (sector.sector1 != null || sector.sector2 != null || sector.sector3 != null)) {
      matched += 1;
    }
    return {
      driverCode: lap.driverCode,
      lapNumber: lap.lapNumber,
      lapTime: lap.lapTime,
      compound: lap.compound ?? null,
      sector1: sector?.sector1 ?? null,
      sector2: sector?.sector2 ?? null,
      sector3: sector?.sector3 ?? null,
      stintNumber: lap.stintNumber ?? null,
    };
  });

  replay.laps = nextLaps;
  await writeFile(filePath, `${JSON.stringify(replay, null, 2)}\n`, "utf8");
  await writeFile(
    filePath.replace(/replay\.json$/i, "replay.laps.json"),
    `${JSON.stringify(nextLaps, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(`OK ${relative} - ${matched}/${nextLaps.length} laps with sector data\n`);
}

async function main() {
  const replayFiles = [];
  for (const seasonRoot of seasonRoots) {
    await walk(seasonRoot, replayFiles);
  }

  process.stdout.write(`Found ${replayFiles.length} replay packs\n`);
  for (const replayFile of replayFiles) {
    await backfillPack(replayFile);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
