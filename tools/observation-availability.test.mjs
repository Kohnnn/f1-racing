import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../apps/web/src/lib/observation-availability.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helperUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
const { classifyPositions, timingAvailability, framePositionSources, hasWeatherEvidence, availabilityLabel, weatherLabels } = await import(helperUrl);

for (const [sources, expected] of [
  [["gps", "gps"], "recorded"],
  [["gps", "synthetic"], "mixed"],
  [["synthetic", "synthetic"], "synthetic"],
  [[], "unknown"],
  [[undefined], "unknown"],
  [["gps", undefined], "unknown"],
  [["synthetic", "unrecognized"], "unknown"],
]) {
  assert.equal(classifyPositions(sources), expected);
}
const frames = [
  { drivers: { A: { positionSource: "synthetic" } } },
  { drivers: { A: { positionSource: "gps" } } },
];
assert.equal(classifyPositions(framePositionSources(frames.slice(0, 1))), "synthetic");
assert.equal(classifyPositions(framePositionSources(frames)), "mixed");
assert.equal(timingAvailability([]), "unavailable");
const lap = { driverCode: "VER", lapNumber: 1, lapTime: 90, compound: null };
assert.equal(timingAvailability([{ ...lap, lapTime: null }, { ...lap, lapTime: 0 }]), "unavailable");
assert.equal(timingAvailability([lap]), "available");
for (const malformed of [{}, { lapTime: 90 }, { ...lap, lapTime: "90" }, { ...lap, lapNumber: null }]) assert.equal(timingAvailability([malformed]), "unknown");
assert.equal(timingAvailability(null), "unknown");
assert.equal(timingAvailability({}), "unknown");
assert.equal(timingAvailability([null]), "unknown");
assert.equal(classifyPositions(framePositionSources([{ drivers: {} }, ...frames])), "unknown");
assert.equal(hasWeatherEvidence(null), false);
assert.equal(hasWeatherEvidence({ airTempC: 0, trackTempC: 0, humidityPct: 0, windSpeedMps: 0, windDirectionDeg: 0, rainfall: false }), false);
assert.equal(hasWeatherEvidence({ airTempC: 20, trackTempC: 30, humidityPct: 50, windSpeedMps: 0, windDirectionDeg: 0, rainfall: false }), true);
const labels = ["recorded", "mixed", "synthetic", "unknown"].map((positions) => availabilityLabel({
  positions, timing: "unavailable", controls: "unavailable", weather: "unavailable", provider: "openf1",
}));
assert.equal(new Set(labels).size, 4);
assert.match(labels[2], /Whole pack: Synthetic positions\. Recorded timing unavailable; race controls unavailable; weather unavailable/);
assert.match(availabilityLabel(), /coverage unknown.*timing unknown/);
const { buildWeatherTimeline } = await import("../pipeline/export/src/build-openf1-replay-pack.mjs");
const { ReplayWeatherSampleSchema } = await import("@f1-racing/schemas");
for (const [raw, expected] of [
  [{ rainfall: true }, { weatherLabel: "Unavailable", windLabel: "Unavailable" }],
  [{ humidity: 50 }, { weatherLabel: "Unavailable", windLabel: "Unavailable" }],
  [{ air_temperature: 0, track_temperature: 0, wind_speed: 0, wind_direction: 0 }, { weatherLabel: "0C air · 0C track", windLabel: "0.0 m/s · 0°" }],
]) {
  const [sample] = buildWeatherTimeline([{ date: "2025-01-01T00:00:00Z", ...raw }], Date.parse("2025-01-01T00:00:00Z"));
  const parsed = ReplayWeatherSampleSchema.parse(sample);
  assert.equal(hasWeatherEvidence(parsed), true);
  assert.deepEqual(weatherLabels(parsed), expected);
}
assert.equal(hasWeatherEvidence({ rainfall: true }), true);
assert.deepEqual(weatherLabels({ airTempC: 0, trackTempC: 0, humidityPct: 50, windSpeedMps: 0, windDirectionDeg: 0 }), { weatherLabel: "Unavailable", windLabel: "Unavailable" });
assert.deepEqual(weatherLabels(null), { weatherLabel: "Unavailable", windLabel: "Unavailable" });

const serverSource = await readFile(new URL("../apps/web/src/lib/observation-availability-server.ts", import.meta.url), "utf8");
const serverOutput = ts.transpileModule(serverSource.replace(/import .* from "\.\/data";/, "const { getReplayFrameChunk, getReplayLaps, getReplayMetaPack, getReplayRaceControl } = globalThis.availabilityData;").replace('"./observation-availability"', JSON.stringify(helperUrl)), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let fixture;
let active = 0;
let peak = 0;
globalThis.availabilityData = {
  getReplayMetaPack: async () => ({ source: "openf1", frameCount: 2, frameChunkIndex: [0, 1] }),
  getReplayLaps: async () => fixture.laps,
  getReplayRaceControl: async () => fixture.controls,
  getReplayFrameChunk: async (_season, _gp, _session, entry) => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    if (fixture.missing && entry === 1) throw new Error("Missing chunk");
    return { frames: [{ drivers: { VER: { positionSource: fixture.sources[entry] } }, weather: fixture.weather }] };
  },
};
const { getObservationAvailability } = await import(`data:text/javascript;base64,${Buffer.from(serverOutput).toString("base64")}`);
for (const [sources, positions] of [[["gps", "gps"], "recorded"], [["gps", "synthetic"], "mixed"], [["synthetic", "synthetic"], "synthetic"]]) {
  fixture = { sources, laps: [], controls: [] };
  assert.deepEqual(await getObservationAvailability(2025, "test", "race"), { provider: "openf1", positions, timing: "unavailable", controls: "unavailable", weather: "unavailable" });
}
for (const controls of [[null], [{}], [{ t: 0, category: "Flag", message: "" }], null]) {
  fixture.controls = controls;
  assert.equal((await getObservationAvailability(2025, "test", "race")).controls, "unknown");
}
fixture = { sources: ["gps", "gps"], laps: [lap], controls: [{ t: 0, category: "Flag", message: "Green flag" }], weather: { rainfall: true } };
assert.deepEqual(await getObservationAvailability(2025, "test", "race"), { provider: "openf1", positions: "recorded", timing: "available", controls: "available", weather: "available" });
fixture.laps = [{}];
fixture.missing = true;
const incomplete = await getObservationAvailability(2025, "test", "race");
assert.equal(incomplete.positions, "unknown");
assert.equal(incomplete.timing, "unknown");
assert.equal(peak, 1);
delete globalThis.availabilityData;
console.log("Availability helper, exporter/schema, weather-label and server aggregation fixtures passed.");
