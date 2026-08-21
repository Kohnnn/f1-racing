import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const defaultPublicDataRoot = path.join(root, "apps", "web", "public", "data");
const outputPath = path.join(defaultPublicDataRoot, "briefs", "index.json");
const claimClasses = new Set(["Recorded", "Derived", "Unknown"]);
const canonicalBriefIds = ["monza-braking", "mexico-aero", "zandvoort-strategy-tyres"];
const approvedReplayHandoffs = new Set([
  "/replay/2025/italian-grand-prix/qualifying?tab=compare&drivers=VER,NOR#analysis",
  "/replay/2025/mexico-city-grand-prix/race?tab=compare&drivers=NOR,LEC#analysis",
  "/replay/2025/dutch-grand-prix/race?tab=racecontrol#analysis",
]);
const approvedLearnHandoffs = new Set(["/learn/car", "/learn/aero", "/learn/tyres", "/learn/braking", "/learn/setup", "/learn/strategy"]);
const approvedModelviewHandoffs = new Set([
  "/cars/current-spec?focus=brakes",
  "/cars/current-spec?focus=rear-wing",
  "/cars/current-spec?focus=tyres",
]);
const approvedHandoffs = {
  replay: approvedReplayHandoffs,
  learn: approvedLearnHandoffs,
  modelview: approvedModelviewHandoffs,
};
const forbiddenAssertions = [
  /\bcaused by\b/i,
  /\bproved? (?:that )?(?:lower drag|more downforce|better setup|superior rear wing)\b/i,
  /\bhad (?:lower drag|more downforce|better setup|a superior rear wing)\b/i,
  /\bmade (?:a )?pit stop cheap\b/i,
  /\btook advantage\b/i,
  /\bmeasured pit loss\b/i,
  /\btyres? switched on\b/i,
  /\bliteral brake point\b/i,
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasPointer(value, pointer) {
  try {
    resolvePointer(value, pointer);
    return true;
  } catch {
    return false;
  }
}

function resolvePointer(value, pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/")) throw new Error(`Malformed anchor pointer: ${String(pointer)}`);
  return pointer.slice(1).split("/").reduce((current, segment) => {
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    if ((!isRecord(current) && !Array.isArray(current)) || !Object.hasOwn(current, key)) throw new Error(`Missing anchor ${pointer}`);
    return current[key];
  }, value);
}

async function readSource(publicDataRoot, sourcePath) {
  if (typeof sourcePath !== "string" || !sourcePath.startsWith("packs/seasons/") || sourcePath.includes("..")) throw new Error(`Malformed source path: ${String(sourcePath)}`);
  let raw;
  try {
    raw = await readFile(path.join(publicDataRoot, ...sourcePath.split("/")), "utf8");
  } catch {
    throw new Error(`Missing evidence source: ${sourcePath}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Malformed evidence source: ${sourcePath}`);
  }
}

function source(pathname, anchors) {
  return { path: pathname, anchors };
}

function absent(pathname, pointers) {
  return { path: pathname, pointers };
}

function provenance(pathname, sessionKey) {
  return [source(pathname, [{ pointer: "/source", expected: "openf1" }, { pointer: "/sessionKey", expected: sessionKey }])];
}

function evidence(id, className, statement, sourceAnchors, provenanceAnchors, coverage, uncertainty, absentAnchors = []) {
  return { id, class: className, statement, sourceAnchors, absentAnchors, provenance: provenanceAnchors, coverage, uncertainty };
}

function templates() {
  const monzaRoot = "packs/seasons/2025/italian-grand-prix/qualifying";
  const mexicoRoot = "packs/seasons/2025/mexico-city-grand-prix/race";
  const zandvoortRoot = "packs/seasons/2025/dutch-grand-prix/race";
  const monzaCompare = `${monzaRoot}/compare/ver-nor.json`;
  const mexicoCompare = `${mexicoRoot}/compare/nor-lec.json`;
  const zandvoortControl = `${zandvoortRoot}/replay.race-control.json`;
  const zandvoortStints = `${zandvoortRoot}/stints.json`;
  const monzaProvenance = provenance(`${monzaRoot}/summary.json`, 9908);
  const mexicoProvenance = provenance(`${mexicoRoot}/summary.json`, 9877);
  const zandvoortSessionProvenance = provenance(`${zandvoortRoot}/summary.json`, 9920);
  const zandvoortReplayProvenance = provenance(`${zandvoortRoot}/replay.meta.json`, 9920);

  return {
    version: 1,
    templateVersion: "evidence-brief-v1",
    briefs: [
      {
        id: "monza-braking",
        title: "Monza qualifying: braking zone versus exit",
        subsystem: ["Braking"],
        question: "On the selected fastest laps, where does VER gain or lose time to NOR, and what do sampled controls establish?",
        learningOutcome: "Identify sector-level gains and sampled control transitions without treating a threshold sample as a literal brake point or causal explanation.",
        handoffs: [
          { kind: "replay", href: "/replay/2025/italian-grand-prix/qualifying?tab=compare&drivers=VER,NOR#analysis" },
          { kind: "learn", href: "/learn/braking" },
          { kind: "modelview", href: "/cars/current-spec?focus=brakes" },
        ],
        evidence: [
          evidence("monza-laps", "Recorded", "The selected comparison is VER lap 17 against NOR lap 20.", [source(monzaCompare, [{ pointer: "/drivers", expected: ["VER", "NOR"] }, { pointer: "/laps", expected: [17, 20] }])], monzaProvenance, "Selected lap pair in the local public comparison pack.", "Local source identity does not establish rights, completeness, driver intent, or car setup."),
          evidence("monza-sectors", "Recorded", "S1 spans ratios 0–0.3333079500456899 with VER leading by 116 ms; S2 spans 0.3333079500456899–0.6694207533759773 with NOR leading by 45 ms; S3 spans 0.6694207533759773–1 with VER leading by 6 ms.", [source(monzaCompare, [
            { pointer: "/deltaSections/0/from", expected: 0 }, { pointer: "/deltaSections/0/to", expected: 0.3333079500456899 }, { pointer: "/deltaSections/0/leader", expected: "VER" }, { pointer: "/deltaSections/0/deltaMs", expected: 116 },
            { pointer: "/deltaSections/1/from", expected: 0.3333079500456899 }, { pointer: "/deltaSections/1/to", expected: 0.6694207533759773 }, { pointer: "/deltaSections/1/leader", expected: "NOR" }, { pointer: "/deltaSections/1/deltaMs", expected: 45 },
            { pointer: "/deltaSections/2/from", expected: 0.6694207533759773 }, { pointer: "/deltaSections/2/to", expected: 1 }, { pointer: "/deltaSections/2/leader", expected: "VER" }, { pointer: "/deltaSections/2/deltaMs", expected: 6 },
          ])], monzaProvenance, "Three exported timing-sector windows cover lap ratio 0 through 1.", "Timing-sector windows are not named corners."),
          evidence("monza-brake-sample", "Recorded", "At approximately 3.7 Hz, VER has a sample at ratio 0.08243222662199208 recording 348 km/h, 100% throttle, brake 0, gear 8, and DRS code 12; the later ratio 0.1052771855010661 sample records 312 km/h, throttle 0, brake 100, gear 8, and DRS code 8.", [source(monzaCompare, [
            { pointer: "/telemetry/left/sampleHz", expected: 3.7 }, { pointer: "/telemetry/left/points/8/ratio", expected: 0.08243222662199208 }, { pointer: "/telemetry/left/points/8/speed", expected: 348 }, { pointer: "/telemetry/left/points/8/throttle", expected: 100 }, { pointer: "/telemetry/left/points/8/brake", expected: 0 }, { pointer: "/telemetry/left/points/8/gear", expected: 8 }, { pointer: "/telemetry/left/points/8/drs", expected: 12 },
            { pointer: "/telemetry/left/points/10/ratio", expected: 0.1052771855010661 }, { pointer: "/telemetry/left/points/10/speed", expected: 312 }, { pointer: "/telemetry/left/points/10/throttle", expected: 0 }, { pointer: "/telemetry/left/points/10/brake", expected: 100 }, { pointer: "/telemetry/left/points/10/gear", expected: 8 }, { pointer: "/telemetry/left/points/10/drs", expected: 8 },
          ])], monzaProvenance, "Two named samples from the local comparison trace.", "Sample spacing and pedal calibration prevent continuous onset precision."),
          evidence("monza-threshold", "Derived", "The braking probe is a deterministic annotation from sampled telemetry thresholds.", [source(monzaCompare, [{ pointer: "/telemetry/left/sampleHz", expected: 3.7 }, { pointer: "/telemetry/left/points/10/brake", expected: 100 }])], monzaProvenance, "Derived only from the locally exported sampled trace.", "The first threshold sample is not a literal brake point."),
          evidence("monza-unknown", "Unknown", "Not established: brake balance, brake temperature, energy recovery, steering or line, setup, confidence, intent, or a causal explanation.", [], monzaProvenance, "The explicit fields are absent from both selected telemetry traces in the local comparison pack.", "Requires calibrated pedals, brake sensors, steering, GPS-to-corner mapping, and video.", [absent(monzaCompare, ["/telemetry/left/brakeBalance", "/telemetry/right/brakeBalance", "/telemetry/left/brakeTemperature", "/telemetry/right/brakeTemperature", "/telemetry/left/energyRecovery", "/telemetry/right/energyRecovery", "/telemetry/left/steering", "/telemetry/right/steering", "/telemetry/left/setup", "/telemetry/right/setup", "/telemetry/left/driverIntent", "/telemetry/right/driverIntent"])]),
        ],
        prohibitedConclusions: ["Treating a sampled brake threshold as a literal brake point", "Inferring brake balance, temperature, setup, driver intent, or causality"],
      },
      {
        id: "mexico-aero",
        title: "Mexico race: whole-lap advantage without a single magic corner",
        subsystem: ["Aero"],
        question: "How should a learner read a lap that is faster in every timing sector without inventing one aerodynamic cause?",
        learningOutcome: "Aggregate sector evidence across a lap while keeping drag, downforce, setup, rear-wing specification, and single-corner causes unknown.",
        handoffs: [
          { kind: "replay", href: "/replay/2025/mexico-city-grand-prix/race?tab=compare&drivers=NOR,LEC#analysis" },
          { kind: "learn", href: "/learn/aero" },
          { kind: "modelview", href: "/cars/current-spec?focus=rear-wing" },
        ],
        evidence: [
          evidence("mexico-laps", "Recorded", "The selected comparison is NOR against LEC, both on lap 45.", [source(mexicoCompare, [{ pointer: "/drivers", expected: ["NOR", "LEC"] }, { pointer: "/laps", expected: [45, 45] }])], mexicoProvenance, "Selected lap pair in the local public comparison pack.", "Same-lap selection does not control traffic, wind, fuel, or tyre state."),
          evidence("mexico-sectors", "Recorded", "S1 spans ratios 0–0.3495988311623991 with NOR leading by 337 ms; S2 spans 0.3495988311623991–0.7415680253578327 with NOR leading by 133 ms; S3 spans 0.7415680253578327–1 with NOR leading by 354 ms.", [source(mexicoCompare, [
            { pointer: "/deltaSections/0/from", expected: 0 }, { pointer: "/deltaSections/0/to", expected: 0.3495988311623991 }, { pointer: "/deltaSections/0/leader", expected: "NOR" }, { pointer: "/deltaSections/0/deltaMs", expected: 337 },
            { pointer: "/deltaSections/1/from", expected: 0.3495988311623991 }, { pointer: "/deltaSections/1/to", expected: 0.7415680253578327 }, { pointer: "/deltaSections/1/leader", expected: "NOR" }, { pointer: "/deltaSections/1/deltaMs", expected: 133 },
            { pointer: "/deltaSections/2/from", expected: 0.7415680253578327 }, { pointer: "/deltaSections/2/to", expected: 1 }, { pointer: "/deltaSections/2/leader", expected: "NOR" }, { pointer: "/deltaSections/2/deltaMs", expected: 354 },
          ])], mexicoProvenance, "Three exported timing-sector windows cover lap ratio 0 through 1.", "Sector windows do not identify a named corner or cause."),
          evidence("mexico-controls", "Recorded", "At approximately 3.7 Hz, NOR records 344 km/h, throttle 99, brake 0, gear 8, and DRS code 14 at ratio 0.11059382893368333; at ratio 0.1512059828636521 the sample records 238 km/h, throttle 0, brake 100, gear 7, and DRS code 8.", [source(mexicoCompare, [
            { pointer: "/telemetry/left/sampleHz", expected: 3.7 }, { pointer: "/telemetry/left/points/11/ratio", expected: 0.11059382893368333 }, { pointer: "/telemetry/left/points/11/speed", expected: 344 }, { pointer: "/telemetry/left/points/11/throttle", expected: 99 }, { pointer: "/telemetry/left/points/11/brake", expected: 0 }, { pointer: "/telemetry/left/points/11/gear", expected: 8 }, { pointer: "/telemetry/left/points/11/drs", expected: 14 },
            { pointer: "/telemetry/left/points/15/ratio", expected: 0.1512059828636521 }, { pointer: "/telemetry/left/points/15/speed", expected: 238 }, { pointer: "/telemetry/left/points/15/throttle", expected: 0 }, { pointer: "/telemetry/left/points/15/brake", expected: 100 }, { pointer: "/telemetry/left/points/15/gear", expected: 7 }, { pointer: "/telemetry/left/points/15/drs", expected: 8 },
          ])], mexicoProvenance, "Two named samples from the local comparison trace.", "DRS code is a state, not force, flap angle, drag, or downforce measurement."),
          evidence("mexico-sector-aggregation", "Derived", "The whole-lap timing observation aggregates three sector deltas: 337 ms, 133 ms, and 354 ms, each led by NOR.", [source(mexicoCompare, [{ pointer: "/deltaSections/0/leader", expected: "NOR" }, { pointer: "/deltaSections/0/deltaMs", expected: 337 }, { pointer: "/deltaSections/1/leader", expected: "NOR" }, { pointer: "/deltaSections/1/deltaMs", expected: 133 }, { pointer: "/deltaSections/2/leader", expected: "NOR" }, { pointer: "/deltaSections/2/deltaMs", expected: 354 }])], mexicoProvenance, "Derived only across the three exported timing-sector windows.", "Aggregation does not isolate an aerodynamic mechanism."),
          evidence("mexico-unknown", "Unknown", "Not established: drag, downforce, setup, rear-wing specification, steering, ride height, wind at the car, traffic state, or a causal car-versus-driver explanation.", [], mexicoProvenance, "The explicit fields are absent from both selected telemetry traces in the local comparison pack.", "Requires wing geometry, aerodynamic coefficients, ride height, wind-relative speed, traffic, steering, and video.", [absent(mexicoCompare, ["/telemetry/left/drag", "/telemetry/right/drag", "/telemetry/left/downforce", "/telemetry/right/downforce", "/telemetry/left/setup", "/telemetry/right/setup", "/telemetry/left/rearWingSpecification", "/telemetry/right/rearWingSpecification", "/telemetry/left/steering", "/telemetry/right/steering", "/telemetry/left/rideHeight", "/telemetry/right/rideHeight", "/telemetry/left/windAtCar", "/telemetry/right/windAtCar", "/telemetry/left/trafficState", "/telemetry/right/trafficState"])]),
        ],
        prohibitedConclusions: ["Claiming lower drag, more downforce, better setup, or a superior rear wing", "Assigning the whole-lap difference to one corner or one cause"],
      },
      {
        id: "zandvoort-strategy-tyres",
        title: "Zandvoort race: safety-car interruption changes the question",
        subsystem: ["Strategy", "Tyres"],
        question: "What evidence changes when the race is neutralised, and why must raw pace comparison stop across the interruption?",
        learningOutcome: "Segment evidence around the neutralisation and restart before discussing strategy or tyres, without inventing intent, pit loss, or causal advantage.",
        handoffs: [
          { kind: "replay", href: "/replay/2025/dutch-grand-prix/race?tab=racecontrol#analysis" },
          { kind: "learn", href: "/learn/strategy" },
          { kind: "learn", href: "/learn/tyres" },
          { kind: "modelview", href: "/cars/current-spec?focus=tyres" },
        ],
        evidence: [
          evidence("zandvoort-deploy", "Recorded", "A double yellow is recorded on lap 23 at T+1,705,936 ms, then safety car deploys on lap 23 at T+1,720,936 ms.", [source(zandvoortControl, [{ pointer: "/12/t", expected: 1705936 }, { pointer: "/12/lapNumber", expected: 23 }, { pointer: "/12/message", expected: "DOUBLE YELLOW IN TRACK SECTOR 5" }, { pointer: "/15/t", expected: 1720936 }, { pointer: "/15/lapNumber", expected: 23 }, { pointer: "/15/message", expected: "SAFETY CAR DEPLOYED" }])], zandvoortReplayProvenance, "Recorded local race-control messages with session-relative timestamps.", "Local source identity does not establish rights, completeness, incident cause, or strategy intent."),
          evidence("zandvoort-restart", "Recorded", "Safety car is called in on lap 26 at T+2,027,936 ms, track is clear on lap 26 at T+2,105,936 ms, and DRS is enabled on lap 28 at T+2,189,936 ms.", [source(zandvoortControl, [{ pointer: "/21/t", expected: 2027936 }, { pointer: "/21/lapNumber", expected: 26 }, { pointer: "/21/message", expected: "SAFETY CAR IN THIS LAP" }, { pointer: "/22/t", expected: 2105936 }, { pointer: "/22/lapNumber", expected: 26 }, { pointer: "/22/message", expected: "TRACK CLEAR" }, { pointer: "/23/t", expected: 2189936 }, { pointer: "/23/lapNumber", expected: 28 }, { pointer: "/23/message", expected: "DRS ENABLED" }])], zandvoortReplayProvenance, "Recorded local chronology from safety-car call-in through DRS enablement.", "DRS enablement is not a pace-normalisation guarantee."),
          evidence("zandvoort-stints", "Recorded", "NOR stint 1 spans laps 1–23 and stint 2 spans laps 24–53; PIA stint 1 spans laps 1–23 and stint 2 spans laps 24–53.", [source(zandvoortStints, [
            { pointer: "/drivers/1/driverCode", expected: "NOR" }, { pointer: "/drivers/1/stints/0/lapStart", expected: 1 }, { pointer: "/drivers/1/stints/0/lapEnd", expected: 23 }, { pointer: "/drivers/1/stints/1/lapStart", expected: 24 }, { pointer: "/drivers/1/stints/1/lapEnd", expected: 53 },
            { pointer: "/drivers/18/driverCode", expected: "PIA" }, { pointer: "/drivers/18/stints/0/lapStart", expected: 1 }, { pointer: "/drivers/18/stints/0/lapEnd", expected: 23 }, { pointer: "/drivers/18/stints/1/lapStart", expected: 24 }, { pointer: "/drivers/18/stints/1/lapEnd", expected: 53 },
          ])], zandvoortSessionProvenance, "Recorded local compound-stint lap boundaries for NOR and PIA.", "A stint boundary does not establish why a stop occurred."),
          evidence("zandvoort-bands", "Derived", "Evidence is segmented into pre-neutralisation through lap 22, safety-car laps 23–26, restart before DRS on lap 27, and post-restart from lap 28.", [source(zandvoortControl, [{ pointer: "/15/lapNumber", expected: 23 }, { pointer: "/21/lapNumber", expected: 26 }, { pointer: "/23/lapNumber", expected: 28 }])], zandvoortReplayProvenance, "Deterministic bands derived only from recorded local race-control boundaries.", "Raw pace must not be compared across these bands."),
          evidence("zandvoort-unknown", "Unknown", "Not established: pit entry or exit time, stationary time, team intent, tyre condition or temperature, traffic state, measured pit loss, undercut or overcut success, or causal advantage.", [], zandvoortSessionProvenance, "The explicit fields are absent from the local stint pack.", "Requires pit timing, radio, tyre condition, traffic, and a validated counterfactual.", [absent(zandvoortStints, ["/drivers/1/stints/0/pitEntryTime", "/drivers/1/stints/0/pitExitTime", "/drivers/1/stints/0/stationaryTime", "/drivers/1/stints/0/teamIntent", "/drivers/1/stints/0/tyreCondition", "/drivers/1/stints/0/tyreTemperature", "/drivers/1/stints/0/trafficState", "/drivers/1/stints/0/measuredPitLoss", "/drivers/18/stints/0/pitEntryTime", "/drivers/18/stints/0/pitExitTime", "/drivers/18/stints/0/stationaryTime", "/drivers/18/stints/0/teamIntent", "/drivers/18/stints/0/tyreCondition", "/drivers/18/stints/0/tyreTemperature", "/drivers/18/stints/0/trafficState", "/drivers/18/stints/0/measuredPitLoss"])]),
        ],
        prohibitedConclusions: ["Claiming the safety car made a stop cheap or caused a stop", "Claiming undercut success, tyre warm-up, team intent, measured pit loss, or causal advantage"],
      },
    ],
  };
}

function validateHandoffs(briefItem) {
  if (!Array.isArray(briefItem.handoffs) || !briefItem.handoffs.some(({ kind }) => kind === "replay") || !briefItem.handoffs.some(({ kind }) => kind === "learn") || !briefItem.handoffs.some(({ kind }) => kind === "modelview")) throw new Error(`Incomplete handoffs for ${briefItem.id}.`);
  const seen = new Set();
  for (const handoff of briefItem.handoffs) {
    if (!isRecord(handoff) || typeof handoff.href !== "string" || !Object.hasOwn(approvedHandoffs, handoff.kind) || !approvedHandoffs[handoff.kind].has(handoff.href) || handoff.href.startsWith("//")) throw new Error(`Malformed handoff for ${briefItem.id}.`);
    const key = `${handoff.kind}:${handoff.href}`;
    if (seen.has(key)) throw new Error(`Duplicate handoff for ${briefItem.id}.`);
    seen.add(key);
  }
}

function validateAnchorGroup(item, claimId, key) {
  if (!isRecord(item) || typeof item.path !== "string" || !Array.isArray(item[key]) || !item[key].length) throw new Error(`Malformed ${key} in ${claimId}.`);
  for (const anchor of item[key]) {
    if (key === "anchors" && (!isRecord(anchor) || typeof anchor.pointer !== "string" || !anchor.pointer.startsWith("/") || !Object.hasOwn(anchor, "expected"))) throw new Error(`Malformed anchor in ${claimId}.`);
    if (key === "pointers" && (typeof anchor !== "string" || !anchor.startsWith("/"))) throw new Error(`Malformed absent anchor in ${claimId}.`);
  }
}

export function validateBriefIndex(index) {
  if (!isRecord(index) || index.version !== 1 || index.templateVersion !== "evidence-brief-v1" || !Array.isArray(index.briefs) || index.briefs.length !== 3 || JSON.stringify(index.briefs.map(({ id }) => id)) !== JSON.stringify(canonicalBriefIds)) throw new Error("Malformed evidence brief index.");
  for (const briefItem of index.briefs) {
    if (typeof briefItem.title !== "string" || !briefItem.title || !Array.isArray(briefItem.subsystem) || !briefItem.subsystem.length || briefItem.subsystem.some((item) => typeof item !== "string" || !item) || typeof briefItem.question !== "string" || !briefItem.question || typeof briefItem.learningOutcome !== "string" || !briefItem.learningOutcome) throw new Error(`Incomplete learner brief for ${briefItem.id}.`);
    validateHandoffs(briefItem);
    if (!Array.isArray(briefItem.evidence) || !briefItem.evidence.length || !Array.isArray(briefItem.prohibitedConclusions) || !briefItem.prohibitedConclusions.length) throw new Error(`Incomplete evidence contract for ${briefItem.id}.`);
    const presentClasses = new Set();
    for (const claim of briefItem.evidence) {
      if (!isRecord(claim) || !claimClasses.has(claim.class) || typeof claim.statement !== "string" || !claim.statement || typeof claim.coverage !== "string" || !claim.coverage || typeof claim.uncertainty !== "string" || !claim.uncertainty || !Array.isArray(claim.sourceAnchors) || !Array.isArray(claim.absentAnchors) || !Array.isArray(claim.provenance) || !claim.provenance.length) throw new Error(`Malformed claim for ${briefItem.id}.`);
      if (!claim.sourceAnchors.length && !claim.absentAnchors.length) throw new Error(`Missing anchors in ${claim.id}.`);
      presentClasses.add(claim.class);
      if (claim.class !== "Unknown" && forbiddenAssertions.some((pattern) => pattern.test(claim.statement))) throw new Error(`Forbidden causal overclaim in ${claim.id}.`);
      if (claim.class === "Unknown" && (!claim.statement.startsWith("Not established:") || !claim.absentAnchors.length)) throw new Error(`Unknown claim must state and anchor its evidence ceiling in ${claim.id}.`);
      for (const item of claim.sourceAnchors) validateAnchorGroup(item, claim.id, "anchors");
      for (const item of claim.absentAnchors) validateAnchorGroup(item, claim.id, "pointers");
      for (const item of claim.provenance) validateAnchorGroup(item, claim.id, "anchors");
    }
    if ([...claimClasses].some((className) => !presentClasses.has(className))) throw new Error(`Missing claim class for ${briefItem.id}.`);
  }
  return index;
}

export async function buildEvidenceBriefs({ publicDataRoot = defaultPublicDataRoot } = {}) {
  const index = validateBriefIndex(templates());
  const sources = new Map();
  async function getSource(sourcePath) {
    if (!sources.has(sourcePath)) sources.set(sourcePath, await readSource(publicDataRoot, sourcePath));
    return sources.get(sourcePath);
  }
  for (const briefItem of index.briefs) {
    for (const claim of briefItem.evidence) {
      for (const item of [...claim.sourceAnchors, ...claim.provenance]) {
        const payload = await getSource(item.path);
        for (const anchor of item.anchors) {
          const actual = resolvePointer(payload, anchor.pointer);
          if (JSON.stringify(actual) !== JSON.stringify(anchor.expected)) throw new Error(`Evidence anchor changed: ${item.path}#${anchor.pointer}`);
        }
      }
      for (const item of claim.absentAnchors) {
        const payload = await getSource(item.path);
        for (const pointer of item.pointers) {
          if (hasPointer(payload, pointer)) throw new Error(`Unknown evidence is now present: ${item.path}#${pointer}`);
        }
      }
    }
  }
  return index;
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function generateEvidenceBriefs({ check = false, publicDataRoot = defaultPublicDataRoot, destination = outputPath } = {}) {
  const expected = jsonText(await buildEvidenceBriefs({ publicDataRoot }));
  if (check) {
    let actual;
    try {
      actual = await readFile(destination, "utf8");
    } catch {
      throw new Error(`Missing generated evidence briefs: ${path.relative(root, destination)}`);
    }
    if (actual !== expected) throw new Error(`Outdated generated evidence briefs: ${path.relative(root, destination)}`);
    return;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, expected, "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateEvidenceBriefs({ check: process.argv.includes("--check") })
    .then(() => process.stdout.write(process.argv.includes("--check") ? "Evidence briefs are current.\n" : "Evidence briefs generated.\n"))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
      process.exit(1);
    });
}
