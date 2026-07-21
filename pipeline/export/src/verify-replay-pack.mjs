import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ReplayFrameChunkSchema,
  ReplayMetaSchema,
} from "../../../packages/schemas/src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function parseArgs(argv) {
  const args = {
    season: "2025",
    grandPrixSlug: "abu-dhabi-grand-prix",
    sessionSlug: "race",
  };

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasMovingCoordinates(frames) {
  if (frames.length < 2) {
    return false;
  }

  const first = frames[0];
  const driverCodes = Object.keys(first.drivers).slice(0, 8);
  const sampleFrames = [frames[1], frames[Math.floor(frames.length / 2)], frames.at(-1)].filter(Boolean);

  return driverCodes.some((driverCode) => {
    const baseline = first.drivers[driverCode];
    if (!baseline || baseline.x === null || baseline.y === null) {
      return false;
    }

    return sampleFrames.some((frame) => {
      const sample = frame.drivers[driverCode];
      return sample && (sample.x !== baseline.x || sample.y !== baseline.y);
    });
  });
}

async function validateChunks(basePath, meta, label) {
  const chunks = [];
  for (const [position, entry] of meta.frameChunkIndex.entries()) {
    assert(entry.index === position, `${label} replay chunk indexes are not contiguous.`);
    assert(entry.path === meta.frameChunks[position], `${label} replay chunk path lists disagree.`);
    const chunk = ReplayFrameChunkSchema.parse(await readJson(path.join(basePath, entry.path)));
    assert(chunk.index === entry.index, `${label} replay chunk ${entry.index} has the wrong index.`);
    assert(chunk.fromTime === entry.fromTime, `${label} replay chunk ${entry.index} has the wrong start time.`);
    assert(chunk.toTime === entry.toTime, `${label} replay chunk ${entry.index} has the wrong end time.`);
    assert(chunk.frames[0].t === entry.fromTime, `${label} replay chunk ${entry.index} frame coverage starts incorrectly.`);
    assert(chunk.frames.at(-1).t === entry.toTime, `${label} replay chunk ${entry.index} frame coverage ends incorrectly.`);
    chunks.push(chunk);
  }
  return chunks;
}

async function main() {
  const args = parseArgs(process.argv);
  const basePath = path.join(
    root,
    "data",
    "packs",
    "seasons",
    String(args.season),
    String(args.grandPrixSlug),
    String(args.sessionSlug),
  );
  const publicBasePath = path.join(
    root,
    "apps",
    "web",
    "public",
    "data",
    "packs",
    "seasons",
    String(args.season),
    String(args.grandPrixSlug),
    String(args.sessionSlug),
  );

  const meta = ReplayMetaSchema.parse(await readJson(path.join(basePath, "replay.meta.json")));
  const publicMeta = ReplayMetaSchema.parse(await readJson(path.join(publicBasePath, "replay.meta.json")));

  assert(meta.trackPath?.length >= 20, "Replay trackPath is missing or too sparse.");
  assert(meta.totalTime > 0, "Replay totalTime must be positive.");
  assert(JSON.stringify(publicMeta) === JSON.stringify(meta), "Public replay metadata does not match canonical data.");

  const chunks = await validateChunks(basePath, meta, "Canonical");
  const publicChunks = await validateChunks(publicBasePath, publicMeta, "Public");
  const frameCount = chunks.reduce((count, chunk) => count + chunk.frames.length, 0);
  const publicFrameCount = publicChunks.reduce((count, chunk) => count + chunk.frames.length, 0);
  const firstEntry = meta.frameChunkIndex[0];
  const lastEntry = meta.frameChunkIndex.at(-1);
  const firstChunk = chunks[0];

  assert(frameCount === meta.frameCount, "Replay chunks do not contain the declared frame count.");
  assert(publicFrameCount === meta.frameCount, "Public replay chunks do not contain the declared frame count.");
  assert(firstEntry.fromTime <= 0.01, "First replay chunk does not start at the beginning.");
  assert(lastEntry.toTime === meta.totalTime, "Replay chunks do not cover totalTime.");
  assert(Object.keys(firstChunk.frames[0].drivers).length >= 10, "First replay frame has too few drivers.");
  assert(hasMovingCoordinates(firstChunk.frames), "First replay chunk has frozen driver coordinates.");

  console.log(JSON.stringify({
    ok: true,
    season: Number(args.season),
    grandPrixSlug: args.grandPrixSlug,
    sessionSlug: args.sessionSlug,
    trackPoints: meta.trackPath.length,
    chunks: meta.frameChunkIndex.length,
    frames: frameCount,
    totalTime: meta.totalTime,
    firstChunkFrames: firstChunk.frames.length,
    drivers: Object.keys(firstChunk.frames[0].drivers).length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
