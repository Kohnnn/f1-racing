import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath) => readFile(path.join(root, relativePath), "utf-8");

const [loader, browser, windTunnel, styles] = await Promise.all([
  source("apps/web/src/lib/model-viewer-loader.ts"),
  source("apps/web/src/components/model-viewer/car-model-browser.tsx"),
  source("apps/web/src/components/wind/canvas-wind-tunnel.tsx"),
  source("apps/web/src/app/globals.css"),
]);

for (const file of ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]) {
  await access(path.join(root, "apps/web/public/draco", file));
}

assert.match(loader, /dracoDecoderLocation: "\/draco\/"/);
assert.doesNotMatch(loader, /gstatic|googleapis/);
for (const label of ["Camera zoom controls", "Zoom in", "Zoom out", "Reset view"]) {
  assert.ok(browser.includes(label), `Missing accessible camera control: ${label}`);
}
assert.match(browser, /aria-pressed=\{Boolean\(compareSlug\)\}/);
assert.match(browser, /aria-pressed=\{interactionMode === "inspect"\}/);
assert.match(browser, /aria-pressed=\{studioQuality === "studio"\}/);
assert.match(windTunnel, /aria-pressed=\{controls\.quality === preset\}/);
assert.match(windTunnel, /aria-pressed=\{controls\.overlayMode === mode\}/);
assert.match(windTunnel, /aria-pressed=\{paused \|\| reducedMotion\}/);
assert.match(windTunnel, /setPaused\(query\.matches\)/);
assert.match(windTunnel, /if \(pausedRef\.current\) return;/);
assert.match(styles, /\.car-model-hotspot--inspect,/);
assert.match(styles, /\.car-viewer-drag-hint,/);
assert.match(styles, /\.car-viewer-loading__spinner,/);
