import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEvidenceBriefs, generateEvidenceBriefs, validateBriefIndex } from "./build-evidence-briefs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sourcePublicDataRoot = path.join(root, "apps", "web", "public", "data");
const publicDataRoot = process.env.F1_CANDIDATE_ROOT
  ? path.join(path.resolve(process.env.F1_CANDIDATE_ROOT), "public", "data")
  : sourcePublicDataRoot;
const candidateIndex = await buildEvidenceBriefs({ publicDataRoot });
const index = await buildEvidenceBriefs({ publicDataRoot: sourcePublicDataRoot, omitUnavailable: false });

assert.ok(candidateIndex.briefs.length > 0);
assert.deepEqual(candidateIndex.briefs.map(({ id }) => id), index.briefs.filter(({ id }) => candidateIndex.briefs.some((brief) => brief.id === id)).map(({ id }) => id));
assert.equal(index.version, 1);
assert.equal(index.templateVersion, "evidence-brief-v1");
assert.deepEqual(index.briefs.map(({ id }) => id), ["monza-braking", "mexico-aero", "zandvoort-strategy-tyres"]);
assert.ok(index.briefs.every(({ learningOutcome }) => typeof learningOutcome === "string" && learningOutcome.length > 0));
assert.deepEqual(index.briefs[0].evidence.find(({ id }) => id === "monza-sectors").sourceAnchors[0].anchors.map(({ expected }) => expected), [0, 0.3333079500456899, "VER", 116, 0.3333079500456899, 0.6694207533759773, "NOR", 45, 0.6694207533759773, 1, "VER", 6]);
assert.deepEqual(index.briefs[1].evidence.find(({ id }) => id === "mexico-sectors").sourceAnchors[0].anchors.map(({ expected }) => expected), [0, 0.3495988311623991, "NOR", 337, 0.3495988311623991, 0.7415680253578327, "NOR", 133, 0.7415680253578327, 1, "NOR", 354]);
assert.deepEqual(index.briefs[2].evidence.find(({ id }) => id === "zandvoort-restart").sourceAnchors[0].anchors.map(({ expected }) => expected), [2027936, 26, "SAFETY CAR IN THIS LAP", 2105936, 26, "TRACK CLEAR", 2189936, 28, "DRS ENABLED"]);
assert.deepEqual(index.briefs[2].evidence.find(({ id }) => id === "zandvoort-stints").sourceAnchors[0].anchors.map(({ expected }) => expected), ["NOR", 1, 23, 24, 53, "PIA", 1, 23, 24, 53]);
for (const brief of index.briefs) {
  assert.deepEqual([...new Set(brief.evidence.map(({ class: className }) => className))].sort(), ["Derived", "Recorded", "Unknown"]);
  for (const claim of brief.evidence) assert.equal(claim.provenance[0].anchors[0].expected, "openf1");
}

for (const href of ["//evil.example/replay", "https://evil.example/replay", "/privacy", "/learn/aero?x=1", "/learn/aero#x", "/cars/current-spec?focus=engine", "/replay/2025/italian-grand-prix/qualifying?drivers=VER,NOR&tab=compare#analysis"] ) {
  const invalid = structuredClone(index);
  invalid.briefs[0].handoffs[0].href = href;
  assert.throws(() => validateBriefIndex(invalid), /Malformed handoff/);
}
const wrongKind = structuredClone(index);
wrongKind.briefs[0].handoffs[0] = { kind: "learn", href: "/cars/current-spec?focus=brakes" };
assert.throws(() => validateBriefIndex(wrongKind), /Incomplete handoffs/);
const duplicateHandoff = structuredClone(index);
duplicateHandoff.briefs[0].handoffs.push(structuredClone(duplicateHandoff.briefs[0].handoffs[0]));
assert.throws(() => validateBriefIndex(duplicateHandoff), /Duplicate handoff/);
const missingLearningOutcome = structuredClone(index);
missingLearningOutcome.briefs[0].learningOutcome = "";
assert.throws(() => validateBriefIndex(missingLearningOutcome), /Incomplete learner brief/);
const missingProvenance = structuredClone(index);
missingProvenance.briefs[0].evidence[0].provenance = [];
assert.throws(() => validateBriefIndex(missingProvenance), /Malformed claim/);
const missingCoverage = structuredClone(index);
missingCoverage.briefs[0].evidence[0].coverage = "";
assert.throws(() => validateBriefIndex(missingCoverage), /Malformed claim/);
const missingUncertainty = structuredClone(index);
missingUncertainty.briefs[0].evidence[0].uncertainty = "";
assert.throws(() => validateBriefIndex(missingUncertainty), /Malformed claim/);
const missingAnchors = structuredClone(index);
missingAnchors.briefs[0].evidence[0].sourceAnchors = [];
assert.throws(() => validateBriefIndex(missingAnchors), /Missing anchors/);
const missingAbsenceContract = structuredClone(index);
missingAbsenceContract.briefs[0].evidence.find(({ class: className }) => className === "Unknown").absentAnchors = [];
assert.throws(() => validateBriefIndex(missingAbsenceContract), /Missing anchors/);
const overclaim = structuredClone(index);
overclaim.briefs[1].evidence[0].statement = "NOR had lower drag caused by a superior rear wing.";
assert.throws(() => validateBriefIndex(overclaim), /Forbidden causal overclaim/);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "f1-evidence-briefs-"));
try {
  const tempData = path.join(tempRoot, "data");
  await cp(path.join(sourcePublicDataRoot, "packs"), path.join(tempData, "packs"), { recursive: true });
  const destinations = [
    path.join(tempRoot, "canonical", "data", "briefs", "index.json"),
    path.join(tempRoot, "public", "data", "briefs", "index.json"),
  ];
  await generateEvidenceBriefs({ publicDataRoot: tempData, destinations });
  await generateEvidenceBriefs({ check: true, publicDataRoot: tempData, destinations });
  assert.equal(await readFile(destinations[0], "utf8"), await readFile(destinations[1], "utf8"));
  await rm(destinations[0]);
  await assert.rejects(generateEvidenceBriefs({ check: true, publicDataRoot: tempData, destinations }), /Missing generated evidence briefs/);
  await generateEvidenceBriefs({ publicDataRoot: tempData, destinations });

  const mexicoPath = path.join(tempData, "packs", "seasons", "2025", "mexico-city-grand-prix", "race", "compare", "nor-lec.json");
  const originalMexico = await readFile(mexicoPath, "utf8");
  await rm(mexicoPath);
  await assert.rejects(buildEvidenceBriefs({ publicDataRoot: tempData, omitUnavailable: false }), /Missing evidence source/);
  const availableIndex = await buildEvidenceBriefs({ publicDataRoot: tempData, omitUnavailable: true });
  assert.deepEqual(availableIndex.briefs.map(({ id }) => id), ["monza-braking", "zandvoort-strategy-tyres"]);
  await writeFile(mexicoPath, originalMexico, "utf8");

  async function changedAnchor(relativePath, mutate, expectedError) {
    const filePath = path.join(tempData, ...relativePath.split("/"));
    const original = await readFile(filePath, "utf8");
    const payload = JSON.parse(original);
    mutate(payload);
    await writeFile(filePath, JSON.stringify(payload), "utf8");
    await assert.rejects(buildEvidenceBriefs({ publicDataRoot: tempData }), expectedError);
    await writeFile(filePath, original, "utf8");
  }

  await changedAnchor("packs/seasons/2025/italian-grand-prix/qualifying/compare/ver-nor.json", (payload) => { payload.deltaSections[0].leader = "NOR"; }, /Evidence anchor changed:.*deltaSections\/0\/leader/);
  await changedAnchor("packs/seasons/2025/mexico-city-grand-prix/race/compare/nor-lec.json", (payload) => { payload.deltaSections[1].to = 0.75; }, /Evidence anchor changed:.*deltaSections\/1\/to/);
  await changedAnchor("packs/seasons/2025/dutch-grand-prix/race/stints.json", (payload) => { payload.drivers[18].stints[1].lapEnd = 52; }, /Evidence anchor changed:.*drivers\/18\/stints\/1\/lapEnd/);
  await changedAnchor("packs/seasons/2025/italian-grand-prix/qualifying/summary.json", (payload) => { delete payload.source; }, /Missing anchor \/source/);
  await changedAnchor("packs/seasons/2025/mexico-city-grand-prix/race/compare/nor-lec.json", (payload) => { payload.telemetry.left.drag = 0.8; }, /Unknown evidence is now present:.*telemetry\/left\/drag/);

  const monzaPath = path.join(tempData, "packs", "seasons", "2025", "italian-grand-prix", "qualifying", "compare", "ver-nor.json");
  const originalMonza = await readFile(monzaPath, "utf8");
  const monza = JSON.parse(originalMonza);
  delete monza.telemetry.left.points[10].brake;
  await writeFile(monzaPath, JSON.stringify(monza), "utf8");
  await assert.rejects(buildEvidenceBriefs({ publicDataRoot: tempData }), /Missing anchor \/telemetry\/left\/points\/10\/brake/);
  await writeFile(monzaPath, "{", "utf8");
  await assert.rejects(buildEvidenceBriefs({ publicDataRoot: tempData }), /Malformed evidence source/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

process.stdout.write("Evidence brief generator tests passed.\n");
