import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "apps/web/src/lib/learning-trail.ts");
const tempDir = await mkdtemp(path.join(tmpdir(), "learning-trail-"));
const outputPath = path.join(tempDir, "learning-trail.mjs");
const source = await readFile(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

try {
  await writeFile(outputPath, output);
  const model = await import(pathToFileURL(outputPath).href);
  const now = new Date("2026-08-21T12:00:00.000Z");
  const earlier = "2026-08-20T12:00:00.000Z";
  const later = "2026-08-21T11:00:00.000Z";
  const valid = {
    schemaVersion: 1,
    updatedAt: earlier,
    trail: {
      updatedAt: earlier,
      briefId: "monza-braking",
      learn: { slug: "braking", anchor: "check" },
      modelviewHref: "/cars/current-spec?season=2025&constructor=mclaren&focus=brakes",
      replayHref: "/replay/2025/italian-grand-prix/qualifying?t=74.2&tab=compare&drivers=VER,NOR&focus=brakes#analysis",
    },
    modules: { braking: { readAt: earlier } },
  };

  assert.deepEqual(model.PILOT_BRIEF_IDS, ["monza-braking", "mexico-aero", "zandvoort-strategy-tyres"]);
  assert.deepEqual(model.parseLearningTrail(JSON.stringify(valid), now.getTime()), valid);
  const childNewerThanDocument = structuredClone(valid);
  childNewerThanDocument.modules.braking.readAt = later;
  assert.equal(model.parseLearningTrail(JSON.stringify(childNewerThanDocument), now.getTime()), null);
  assert.equal(model.parseLearningTrail("{", now.getTime()), null);
  assert.equal(model.parseLearningTrail(`{"padding":"${"x".repeat(8192)}"}`, now.getTime()), null);
  const exactExpiry = structuredClone(valid);
  exactExpiry.trail.updatedAt = new Date(now.getTime() - model.LEARNING_TRAIL_TTL_MS).toISOString();
  const exactExpiryParsed = model.parseLearningTrail(JSON.stringify(exactExpiry), now.getTime());
  assert.ok(exactExpiryParsed);
  assert.equal(exactExpiryParsed.trail, undefined);
  assert.deepEqual(exactExpiryParsed.modules, valid.modules);
  const removedContent = structuredClone(valid);
  removedContent.trail.briefId = "retired-brief";
  removedContent.modules.retired = { readAt: earlier };
  const removedContentParsed = model.parseLearningTrail(JSON.stringify(removedContent), now.getTime());
  assert.equal(removedContentParsed.trail, undefined);
  assert.deepEqual(removedContentParsed.modules, valid.modules);

  const migrated = model.migrateLegacyProgress(JSON.stringify({ car: true, aero: false, braking: true, injected: true }), later);
  assert.deepEqual(migrated, {
    schemaVersion: 1,
    updatedAt: later,
    modules: { car: { readAt: later }, braking: { readAt: later } },
  });

  const incoming = {
    schemaVersion: 1,
    updatedAt: later,
    trail: { updatedAt: later, briefId: "mexico-aero", learn: { slug: "aero" } },
    modules: {
      braking: { readAt: earlier, completedAt: later },
      aero: { readAt: later },
    },
  };
  const merged = model.mergeLearningTrails(valid, incoming);
  assert.equal(merged.updatedAt, later);
  assert.equal(merged.trail.briefId, "mexico-aero");
  assert.equal(merged.modules.braking.completedAt, later);
  assert.equal(merged.modules.aero.readAt, later);
  const equalTimestamp = model.mergeLearningTrails(valid, { ...incoming, updatedAt: earlier, trail: { ...incoming.trail, updatedAt: earlier } });
  assert.equal(equalTimestamp.trail.briefId, "monza-braking");
  const read = model.markModuleRead(valid, "aero", true, later);
  assert.equal(read.modules.aero.readAt, later);
  const unread = model.markModuleRead(read, "braking", false, now.toISOString());
  assert.equal(unread.modules.braking, undefined);
  const wrong = model.recordModuleCompletion(valid, "braking", false, later);
  assert.equal(wrong.modules.braking.completedAt, undefined);
  const correct = model.recordModuleCompletion(valid, "braking", true, later);
  assert.equal(correct.modules.braking.completedAt, later);
  assert.equal(correct.modules.braking.readAt, earlier);
  assert.equal(correct.trail.learn.anchor, "check");

  const malicious = [
    "https://evil.example/replay/2025/italian-grand-prix/qualifying",
    "//evil.example/replay/2025/italian-grand-prix/qualifying",
    "/replay/2025/italian-grand-prix/qualifying?next=https://evil.example",
    "/replay/2025/italian-grand-prix/qualifying?tab=unknown",
    "/replay/2025/italian-grand-prix/qualifying?drivers=VER,<script>",
    "/replay/2025/italian-grand-prix/qualifying#javascript:alert(1)",
    "/replay/2025/italian-grand-prix/qualifying?tab=compare&tab=strategy",
    "/replay/2025/monaco-grand-prix/race?tab=telemetry",
  ];
  for (const href of malicious) assert.equal(model.validateReplayHref(href), false, href);
  assert.equal(model.validateReplayHref(valid.trail.replayHref), true);
  assert.equal(model.validateModelviewHref("/cars/current-spec?focus=brakes"), true);
  assert.equal(model.validateModelviewHref("/cars/current-spec?focus=unknown"), false);
  assert.equal(model.validateModelviewHref("/cars/current-spec?season=2025&constructor=evil&focus=brakes"), false);
  assert.equal(model.validateModelviewHref("https://evil.example/cars/current-spec?focus=brakes"), false);

  const freshValues = new Map([[model.LEARNING_TRAIL_STORAGE_KEY, JSON.stringify(valid)]]);
  const freshStorage = {
    getItem: (key) => freshValues.get(key) ?? null,
    setItem: (key, value) => freshValues.set(key, value),
    removeItem: (key) => freshValues.delete(key),
  };
  const fresh = model.writeLearningTrail(freshStorage, valid, now);
  assert.equal(fresh.updatedAt, now.toISOString());
  assert.equal(fresh.trail.updatedAt, now.toISOString());
  const deleted = model.updateModuleRead(freshStorage, "braking", false, new Date(now.getTime() + 1));
  assert.equal(deleted.modules.braking, undefined);
  const staleTab = model.mergeLearningTrails(deleted, valid);
  assert.equal(staleTab.modules.braking, undefined);
  freshValues.set(model.LEARNING_TRAIL_STORAGE_KEY, JSON.stringify(valid));
  globalThis.window = { localStorage: freshStorage, dispatchEvent() {} };
  const replayUpdate = model.saveActiveReplayHrefInBrowser("/replay/2025/italian-grand-prix/qualifying?t=82.4&tab=compare&drivers=VER,NOR#analysis", now);
  assert.equal(replayUpdate.trail.replayHref, "/replay/2025/italian-grand-prix/qualifying?t=82.4&tab=compare&drivers=VER,NOR#analysis");
  assert.equal(model.saveActiveReplayHrefInBrowser("/replay/2025/mexico-city-grand-prix/race?tab=compare&drivers=NOR,LEC#analysis", now), null);
  const modelviewUpdate = model.saveActiveModelviewHrefInBrowser("/cars/current-spec?season=2025&constructor=mclaren&focus=brakes", now);
  assert.equal(modelviewUpdate.trail.modelviewHref, "/cars/current-spec?season=2025&constructor=mclaren&focus=brakes");
  delete globalThis.window;
  const unknownRaw = JSON.stringify({ schemaVersion: 2, updatedAt: now.toISOString(), modules: {} });
  freshValues.set(model.LEARNING_TRAIL_STORAGE_KEY, unknownRaw);
  assert.equal(model.readLearningTrail(freshStorage, now), null);
  assert.equal(freshValues.get(model.LEARNING_TRAIL_STORAGE_KEY), unknownRaw);

  const values = new Map([[model.LEGACY_LEARN_PROGRESS_KEY, JSON.stringify({ tyres: true })]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const storedMigration = model.readLearningTrail(storage, now);
  assert.equal(storedMigration.modules.tyres.readAt, now.toISOString());
  assert.equal(values.has(model.LEGACY_LEARN_PROGRESS_KEY), false);
  assert.ok(values.has(model.LEARNING_TRAIL_STORAGE_KEY));
  assert.equal(model.clearLearningTrail(storage), true);
  assert.equal(values.size, 0);

  const brokenStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(model.readLearningTrail(brokenStorage, now), null);
  assert.equal(model.writeLearningTrail(brokenStorage, valid, now.getTime()), null);
  assert.equal(model.clearLearningTrail(brokenStorage), false);

  console.log("learning-trail.test.mjs: ok");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
