import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ReplayFrameChunkSchema,
  ReplayMetaSchema,
  ReplayPackSchema,
} from "../../../packages/schemas/src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const candidateRoot = process.env.F1_CANDIDATE_ROOT ? path.resolve(process.env.F1_CANDIDATE_ROOT) : null;
const chunkSize = 120;
const seasonRoots = candidateRoot
  ? [
    path.join(candidateRoot, "canonical", "data", "packs", "seasons"),
    path.join(candidateRoot, "public", "data", "packs", "seasons"),
  ]
  : [
    path.join(root, "data", "packs", "seasons"),
    path.join(root, "apps", "web", "public", "data", "packs", "seasons"),
  ];

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

async function walk(directory, replayFiles = [], manifestFiles = []) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return { replayFiles, manifestFiles };
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, replayFiles, manifestFiles);
    } else if (entry.isFile() && entry.name === "replay.json") {
      replayFiles.push(fullPath);
    } else if (entry.isFile() && entry.name === "manifest.json") {
      manifestFiles.push(fullPath);
    }
  }
  return { replayFiles, manifestFiles };
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function removeManifestReplay(baseDir) {
  const manifestPath = path.join(baseDir, "manifest.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!Object.hasOwn(manifest, "replay")) return;
    delete manifest.replay;
    await writeJson(manifestPath, manifest);
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
}

export async function writeSplitReplayPack(baseDir, replay) {
  ReplayPackSchema.parse(replay);

  const frames = replay.frames;
  const laps = replay.laps;
  const raceControlMessages = replay.raceControlMessages ?? [];
  if (!frames.length) throw new Error(`Replay pack has no frames: ${path.relative(root, baseDir)}`);

  const chunkDirectory = path.join(baseDir, "replay.frames");
  const temporaryChunkDirectory = `${chunkDirectory}.tmp-${process.pid}`;
  await rm(temporaryChunkDirectory, { recursive: true, force: true });

  const chunkFileNames = [];
  const chunkIndex = [];
  for (let index = 0; index < frames.length; index += chunkSize) {
    const chunkFrames = frames.slice(index, index + chunkSize);
    const chunkName = `chunk-${String(index / chunkSize).padStart(3, "0")}.json`;
    const chunk = {
      index: index / chunkSize,
      fromTime: chunkFrames[0]?.t ?? 0,
      toTime: chunkFrames.at(-1)?.t ?? chunkFrames[0]?.t ?? 0,
      frames: chunkFrames,
    };
    ReplayFrameChunkSchema.parse(chunk);
    chunkFileNames.push(`replay.frames/${chunkName}`);
    chunkIndex.push({
      index: chunk.index,
      fromTime: chunk.fromTime,
      toTime: chunk.toTime,
      path: `replay.frames/${chunkName}`,
    });
    await writeJson(path.join(temporaryChunkDirectory, chunkName), chunk);
  }

  const totalLaps = laps.reduce((max, lap) => Math.max(max, lap.lapNumber || 0), 0);
  const fastestLap = laps
    .filter((lap) => typeof lap.lapTime === "number")
    .sort((left, right) => (left.lapTime ?? Number.POSITIVE_INFINITY) - (right.lapTime ?? Number.POSITIVE_INFINITY))[0] ?? null;
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

  await writeJson(path.join(baseDir, "replay.laps.json"), laps);
  await writeJson(path.join(baseDir, "replay.race-control.json"), raceControlMessages);
  await rm(chunkDirectory, { recursive: true, force: true });
  await rename(temporaryChunkDirectory, chunkDirectory);
  await writeJson(path.join(baseDir, "replay.meta.json"), metaPayload);
  await removeManifestReplay(baseDir);
  return chunkFileNames.length;
}

export async function splitReplayPack(filePath, { removeInput = true } = {}) {
  let replay;
  try {
    replay = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
  const chunkCount = await writeSplitReplayPack(path.dirname(filePath), replay);
  if (removeInput) await rm(filePath, { force: true });
  process.stdout.write(`Split ${path.relative(root, filePath)} into ${chunkCount} frame chunks\n`);
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const hasTarget = options.season || options.grandPrixSlug || options.sessionSlug;
  if (hasTarget && !(options.season && options.grandPrixSlug && options.sessionSlug)) {
    throw new Error("Targeted replay splitting requires --season, --grandPrixSlug, and --sessionSlug");
  }

  const replayFiles = [];
  const manifestFiles = [];
  for (const seasonRoot of seasonRoots) {
    if (hasTarget) {
      replayFiles.push(path.join(seasonRoot, options.season, options.grandPrixSlug, options.sessionSlug, "replay.json"));
      manifestFiles.push(path.join(seasonRoot, options.season, options.grandPrixSlug, options.sessionSlug, "manifest.json"));
    } else {
      await walk(seasonRoot, replayFiles, manifestFiles);
    }
  }
  const splitFiles = [];
  for (const replayFile of replayFiles) {
    if (await splitReplayPack(replayFile, { removeInput: false })) splitFiles.push(replayFile);
  }
  await Promise.all(splitFiles.map((replayFile) => rm(replayFile, { force: true })));
  await Promise.all(manifestFiles.map((manifestFile) => removeManifestReplay(path.dirname(manifestFile))));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
