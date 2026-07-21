import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "apps/web/src/components/replay/replay-chunks.ts");
const schemaPath = pathToFileURL(path.join(root, "packages/schemas/src/index.js")).href;
const tempDir = await mkdtemp(path.join(tmpdir(), "replay-chunks-"));
const outputPath = path.join(tempDir, "replay-chunks.mjs");
const source = await readFile(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText.replace("@f1-racing/schemas", schemaPath);

try {
  await writeFile(outputPath, output);
  const { loadReplayChunkQueue, validateReplayFrameChunk } = await import(pathToFileURL(outputPath).href);
  const frame = {
    t: 0,
    lap: 1,
    drivers: {},
    safetyCar: { phase: "none", x: null, y: null },
    trackStatus: "GREEN",
  };
  const entry = { index: 0, fromTime: 0, toTime: 8, path: "replay.frames/chunk-000.json" };
  const chunk = { index: 0, fromTime: 0, toTime: 8, frames: [frame, { ...frame, t: 8 }] };
  assert.deepEqual(validateReplayFrameChunk(chunk, entry), chunk);
  assert.throws(
    () => validateReplayFrameChunk({ ...chunk, index: 1 }, entry),
    /does not match its index metadata/,
  );
  assert.throws(
    () => validateReplayFrameChunk({ ...chunk, frames: [{ ...frame, t: 1 }, { ...frame, t: 8 }] }, entry),
    /does not match its index metadata/,
  );
  assert.throws(
    () => validateReplayFrameChunk({ ...chunk, frames: [frame, { ...frame, t: 7 }, { ...frame, t: 6 }, { ...frame, t: 8 }] }, entry),
    /out-of-range or unordered frames/,
  );

  let active = 0;
  let maxActive = 0;
  const loaded = [];
  await loadReplayChunkQueue(Array.from({ length: 12 }, (_, index) => index), async (index) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    loaded.push(index);
    active -= 1;
  }, undefined, () => active);
  assert.equal(maxActive, 4);
  assert.deepEqual(loaded.sort((left, right) => left - right), Array.from({ length: 12 }, (_, index) => index));
  await assert.rejects(() => loadReplayChunkQueue([0], async () => {}, 0), /positive integer/);
  console.log("replay-chunks.test.mjs: ok");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
