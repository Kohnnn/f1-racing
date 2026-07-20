import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "apps/web/src/components/replay/three/replay-director.ts");
const tempDir = await mkdtemp(path.join(tmpdir(), "replay-director-"));
const outputPath = path.join(tempDir, "replay-director.mjs");
const source = await readFile(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

try {
  await writeFile(outputPath, output);
  const { createDirectorState, selectDirectorShot } = await import(pathToFileURL(outputPath).href);
  const focus = { code: "VER", brake: 0, drs: 0, position: 1, interval: 0, arcDistance: 100 };
  const battle = { code: "NOR", brake: 0, drs: 0, position: 2, interval: 1.1, arcDistance: 101 };
  const base = {
    mode: "director",
    now: 0,
    isPlaying: true,
    reducedMotion: false,
    seekToken: 0,
    yellow: false,
    safetyCarActive: false,
    focus,
    states: [focus],
  };

  let state = createDirectorState();
  state = selectDirectorShot(base, state);
  assert.deepEqual(state.targetCodes, ["VER"]);
  assert.equal(state.shotKind, "follow");
  assert.equal(state.reason, "normal");
  assert.equal(state.holdUntil, 5000);

  state = selectDirectorShot({ ...base, now: 100, focus: { ...focus, brake: 80 } }, state);
  assert.equal(state.reason, "normal");

  state = selectDirectorShot({ ...base, now: 5000, focus: { ...focus, brake: 80 } }, state);
  assert.equal(state.shotKind, "trackside");
  assert.equal(state.reason, "braking");

  state = selectDirectorShot({ ...base, now: 10000, states: [focus, battle] }, state);
  assert.deepEqual(state.targetCodes, ["VER", "NOR"]);
  assert.equal(state.reason, "battle");

  state = selectDirectorShot({ ...base, now: 15000, yellow: true }, state);
  assert.equal(state.shotKind, "helicopter");
  assert.equal(state.reason, "yellow");
  assert.equal(state.holdUntil, 23000);

  state = selectDirectorShot({ ...base, now: 16000 }, state);
  assert.equal(state.reason, "yellow");

  state = selectDirectorShot({ ...base, now: 23000, focus: { ...focus, drs: 10 } }, state);
  assert.equal(state.shotKind, "follow");
  assert.equal(state.reason, "drs");

  state = selectDirectorShot({ ...base, now: 28000, isPlaying: false }, state);
  assert.equal(state.reason, "paused");
  assert.equal(state.holdUntil, 29250);

  state = selectDirectorShot({ ...base, now: 28100, isPlaying: true }, state);
  assert.equal(state.reason, "paused");

  state = selectDirectorShot({ ...base, now: 29250, seekToken: 1 }, state);
  assert.equal(state.reason, "seek");
  assert.equal(state.shotKind, "helicopter");

  state = selectDirectorShot({ ...base, now: 29300, isPlaying: false, seekToken: 2 }, state);
  assert.equal(state.reason, "seek");
  assert.equal(state.holdUntil, 30550);

  state = selectDirectorShot({ ...base, now: 29400, isPlaying: false, seekToken: 2 }, state);
  assert.equal(state.reason, "seek");

  state = selectDirectorShot({ ...base, now: 30600, isPlaying: false, seekToken: 2 }, state);
  assert.equal(state.reason, "paused");

  state = selectDirectorShot({ ...base, now: 32000, reducedMotion: true }, state);
  assert.equal(state.reason, "reduced-motion");
  assert.equal(state.holdUntil, Infinity);

  const manual = selectDirectorShot({ ...base, mode: "orbit", now: 32001, reducedMotion: true }, state);
  assert.equal(manual.shotKind, "orbit");
  assert.equal(manual.reason, "manual-orbit");

  console.log("replay-director.test.mjs: ok");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
