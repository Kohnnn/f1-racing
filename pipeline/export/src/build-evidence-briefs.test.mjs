import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildEvidenceBriefs, generateEvidenceBriefs, validateBriefIndex } from "./build-evidence-briefs.mjs";

const { scripts } = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
assert.equal(scripts["check:briefs"], "node pipeline/export/src/build-evidence-briefs.mjs --check");
assert.ok(!scripts["quality:source"].split(" && ").includes("npm run check:briefs"));
assert.ok(scripts.quality.split(" && ").includes("npm run check:briefs"));

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "f1-evidence-briefs-"));
try {
  const tempData = path.join(tempRoot, "fixture-inputs");
  const monzaRoot = "packs/seasons/2025/italian-grand-prix/qualifying";
  const mexicoRoot = "packs/seasons/2025/mexico-city-grand-prix/race";
  const zandvoortRoot = "packs/seasons/2025/dutch-grand-prix/race";
  const monzaPoints = [];
  monzaPoints[8] = { ratio: 0.08243222662199208, speed: 348, throttle: 100, brake: 0, gear: 8, drs: 12 };
  monzaPoints[10] = { ratio: 0.1052771855010661, speed: 312, throttle: 0, brake: 100, gear: 8, drs: 8 };
  const mexicoPoints = [];
  mexicoPoints[11] = { ratio: 0.11059382893368333, speed: 344, throttle: 99, brake: 0, gear: 8, drs: 14 };
  mexicoPoints[15] = { ratio: 0.1512059828636521, speed: 238, throttle: 0, brake: 100, gear: 7, drs: 8 };
  const raceControl = [];
  raceControl[12] = { t: 1705936, lapNumber: 23, message: "DOUBLE YELLOW IN TRACK SECTOR 5" };
  raceControl[15] = { t: 1720936, lapNumber: 23, message: "SAFETY CAR DEPLOYED" };
  raceControl[21] = { t: 2027936, lapNumber: 26, message: "SAFETY CAR IN THIS LAP" };
  raceControl[22] = { t: 2105936, lapNumber: 26, message: "TRACK CLEAR" };
  raceControl[23] = { t: 2189936, lapNumber: 28, message: "DRS ENABLED" };
  const stintDrivers = [];
  for (const [position, driverCode] of [[1, "NOR"], [18, "PIA"]]) {
    stintDrivers[position] = { driverCode, stints: [{ lapStart: 1, lapEnd: 23 }, { lapStart: 24, lapEnd: 53 }] };
  }
  const fixtureSources = {
    [`${monzaRoot}/summary.json`]: { source: "openf1", sessionKey: 9908 },
    [`${mexicoRoot}/summary.json`]: { source: "openf1", sessionKey: 9877 },
    [`${zandvoortRoot}/summary.json`]: { source: "openf1", sessionKey: 9920 },
    [`${zandvoortRoot}/replay.meta.json`]: { source: "openf1", sessionKey: 9920 },
    [`${monzaRoot}/compare/ver-nor.json`]: {
      drivers: ["VER", "NOR"], laps: [17, 20],
      deltaSections: [
        { from: 0, to: 0.3333079500456899, leader: "VER", deltaMs: 116 },
        { from: 0.3333079500456899, to: 0.6694207533759773, leader: "NOR", deltaMs: 45 },
        { from: 0.6694207533759773, to: 1, leader: "VER", deltaMs: 6 },
      ],
      telemetry: { left: { sampleHz: 3.7, points: monzaPoints }, right: {} },
    },
    [`${mexicoRoot}/compare/nor-lec.json`]: {
      drivers: ["NOR", "LEC"], laps: [45, 45],
      deltaSections: [
        { from: 0, to: 0.3495988311623991, leader: "NOR", deltaMs: 337 },
        { from: 0.3495988311623991, to: 0.7415680253578327, leader: "NOR", deltaMs: 133 },
        { from: 0.7415680253578327, to: 1, leader: "NOR", deltaMs: 354 },
      ],
      telemetry: { left: { sampleHz: 3.7, points: mexicoPoints }, right: {} },
    },
    [`${zandvoortRoot}/replay.race-control.json`]: raceControl,
    [`${zandvoortRoot}/stints.json`]: { drivers: stintDrivers },
  };
  for (const [relativePath, payload] of Object.entries(fixtureSources)) {
    const filePath = path.join(tempData, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(payload), "utf8");
  }
  const index = await buildEvidenceBriefs({ publicDataRoot: tempData, omitUnavailable: false });
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

  const destinations = [
    path.join(tempRoot, "fixture-output-a", "index.json"),
    path.join(tempRoot, "fixture-output-b", "index.json"),
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
  assert.ok(availableIndex.briefs.length > 0);
  assert.deepEqual(availableIndex.briefs.map(({ id }) => id), ["monza-braking", "zandvoort-strategy-tyres"]);
  assert.deepEqual(availableIndex.briefs, index.briefs.filter(({ id }) => availableIndex.briefs.some((brief) => brief.id === id)));
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
