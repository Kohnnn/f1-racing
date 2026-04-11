import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const chunkSize = 120;
const seasonRoots = [
  path.join(root, "data", "packs", "seasons"),
  path.join(root, "apps", "web", "public", "data", "packs", "seasons"),
];

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

async function splitReplayPack(filePath) {
  const replay = JSON.parse(await readFile(filePath, "utf8"));
  const frames = Array.isArray(replay.frames) ? replay.frames : [];

  if (!frames.length) {
    return;
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
    await writeJson(path.join(chunkDirectory, chunkName), {
      index: index / chunkSize,
      fromTime: chunkFrames[0]?.t ?? 0,
      toTime: chunkFrames.at(-1)?.t ?? chunkFrames[0]?.t ?? 0,
      frames: chunkFrames,
    });
  }

  const meta = {
    ...replay,
    totalTime: frames.at(-1)?.t ?? 0,
    frameCount: frames.length,
    frameChunkSize: chunkSize,
    frameChunks: chunkFileNames,
    frameChunkIndex: chunkIndex,
  };
  delete meta.frames;

  await writeJson(filePath.replace(/\.json$/i, ".meta.json"), meta);
  process.stdout.write(`Split ${path.relative(root, filePath)} into ${chunkFileNames.length} frame chunks\n`);
}

async function main() {
  const replayFiles = [];
  for (const seasonRoot of seasonRoots) {
    await walk(seasonRoot, replayFiles);
  }

  for (const replayFile of replayFiles) {
    await splitReplayPack(replayFile);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
