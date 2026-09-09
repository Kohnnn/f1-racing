import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { formatLapTime } = require("@f1-racing/telemetry-utils");
assert.equal(formatLapTime(null), "Unavailable");
assert.equal(formatLapTime(0), "0.000");
assert.equal(formatLapTime(90), "1:30.000");
async function loadComponent(relative) {
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function("require", "exports", output)((name) => name === "@/lib/art" ? { getCircuitArt: () => null } : require(name), exports);
  return exports;
}
const { StintStory } = await loadComponent("../apps/web/src/components/telemetry/stint-story.tsx");
const { ReplayStintPanel, ReplayStrategyPanel } = await loadComponent("../apps/web/src/components/replay/replay-insights.tsx");
for (const Component of [StintStory, ReplayStintPanel, ReplayStrategyPanel]) {
  for (const trend of [null, 0, 0.1]) {
    const stintPack = { trackId: "test", sessionKey: 1, drivers: [{ driverCode: "TST", team: "Test", stints: [{ stintNumber: 1, compound: "MEDIUM", lapStart: 1, lapEnd: 1, tyreAgeAtStart: 0, averageLapTime: trend === null ? null : 90, trendPerLap: trend, lapTimes: trend === null ? [] : [90] }] }] };
    const html = renderToStaticMarkup(React.createElement(Component, { stintPack, strategy: null }));
    assert.match(html, /TST/);
    assert.match(html, /MEDIUM/);
    if (trend === null) {
      assert.match(html, /Unavailable/);
      assert.doesNotMatch(html, /stable|0\.000|NaN|Infinity/);
    } else {
      assert.match(html, trend === 0 ? /0\.000/ : /0\.100/);
    }
  }
}
console.log("Nullable stint consumer tests passed.");
