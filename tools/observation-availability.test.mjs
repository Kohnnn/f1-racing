import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../apps/web/src/lib/observation-availability.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { classifyPositions, timingAvailability, framePositionSources, hasWeatherEvidence, availabilityLabel } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

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
assert.equal(timingAvailability([{ lapTime: null }, { lapTime: 0 }]), "unavailable");
assert.equal(timingAvailability([{ lapTime: 90 }]), "available");
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
console.log("Availability fixtures passed: recorded, mixed, synthetic, unknown, loaded-window separation, empty timing.");
