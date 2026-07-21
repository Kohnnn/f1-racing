import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ReplayFrameChunkSchema,
  ReplayMetaSchema,
  ReplayPackSchema,
} from "../../../packages/schemas/src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const chunkSize = 120;
const seasonRoots = [
  path.join(root, "data", "packs", "seasons"),
  path.join(root, "apps", "web", "public", "data", "packs", "seasons"),
];

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    options[token.slice(2)] = value;
    index += 1;
  }
  return options;
}

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
      continue;
    }

    if (entry.isFile() && entry.name === "replay.json") {
      files.push(fullPath);
    }
  }

  return files;
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function splitReplayPack(filePath) {
  const replay = JSON.parse(await readFile(filePath, "utf8"));
  ReplayPackSchema.parse(replay);
  const frames = replay.frames;
  const laps = replay.laps;
  const raceControlMessages = replay.raceControlMessages ?? [];

  if (!frames.length) {
    throw new Error(`Replay pack has no frames: ${path.relative(root, filePath)}`);
  }

  const chunkDirectory = path.join(path.dirname(filePath), "replay.frames");
  await rm(chunkDirectory, { recursive: true, force: true });

  const chunkFileNames = [];
  const chunkIndex = [];
  for (let index = 0; index < frames.length; index += chunkSize) {
    const chunkFrames = frames.slice(index, index + chunkSize);
    const chunkName = `chunk-${String(index / chunkSize).padStart(3, "0")}.json`;
    chunkFileNames.push(`replay.frames/${chunkName}`);
    chunkIndex.push({
      index: index / chunkSize,
      fromTime: chunkFrames[0]?.t ?? 0,
      toTime: chunkFrames.at(-1)?.t ?? chunkFrames[0]?.t ?? 0,
      path: `replay.frames/${chunkName}`,
    });
    const chunk = {
      index: index / chunkSize,
      fromTime: chunkFrames[0]?.t ?? 0,
      toTime: chunkFrames.at(-1)?.t ?? chunkFrames[0]?.t ?? 0,
      frames: chunkFrames,
    };
    ReplayFrameChunkSchema.parse(chunk);
    await writeJson(path.join(chunkDirectory, chunkName), chunk);
  }

  const totalLaps = laps.reduce((max, lap) => Math.max(max, lap.lapNumber || 0), 0);
  const fastestLap = laps
    .filter((lap) => typeof lap.lapTime === "number")
    .sort((left, right) => (left.lapTime ?? Number.POSITIVE_INFINITY) - (right.lapTime ?? Number.POSITIVE_INFINITY))[0] ?? null;

  await writeJson(filePath.replace(/replay\.json$/i, "replay.laps.json"), laps);
  await writeJson(filePath.replace(/replay\.json$/i, "replay.race-control.json"), raceControlMessages);

  const metaPayload = {
    ...replay,
    laps: [],
    raceControlMessages: [],
    totalTime: frames.at(-1)?.t ?? 0,
    totalLaps,
    fastestLap,
    frameCount: frames.length,
    frameChunkSize: chunkSize,
    frameChunks: chunkFileNames,
    frameChunkIndex: chunkIndex,
  };
  delete metaPayload.frames;
  ReplayMetaSchema.parse(metaPayload);

  await writeJson(filePath.replace(/\.json$/i, ".meta.json"), metaPayload);
  process.stdout.write(`Split ${path.relative(root, filePath)} into ${chunkFileNames.length} frame chunks\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const hasTarget = options.season || options.grandPrixSlug || options.sessionSlug;
  if (hasTarget && !(options.season && options.grandPrixSlug && options.sessionSlug)) {
    throw new Error("Targeted replay splitting requires --season, --grandPrixSlug, and --sessionSlug");
  }

  const replayFiles = [];
  for (const seasonRoot of seasonRoots) {
    if (hasTarget) {
      replayFiles.push(path.join(
        seasonRoot,
        options.season,
        options.grandPrixSlug,
        options.sessionSlug,
        "replay.json",
      ));
    } else {
      await walk(seasonRoot, replayFiles);
    }
  }

  for (const replayFile of replayFiles) {
    await splitReplayPack(replayFile);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
