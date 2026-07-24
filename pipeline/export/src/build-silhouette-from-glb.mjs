/**
 * GLB -> wind-tunnel SVG-art silhouette manifest (2026-06-15).
 *
 * Produces the richer "svg" silhouette manifest (polygon + wheelArches +
 * details + aspect) consumed by the wind tunnel's `SVG art` mode
 * (apps/web fetches /data/silhouettes/<slug>.json), but derives the outline
 * DIRECTLY from the GLB geometry so it is 1:1 with the 3D model.
 *
 * It reuses the EXACT same trace pipeline as build-wind-profiles.mjs
 * (loadGlbPositions -> computeRanges -> pickAxes -> projectToSide ->
 * buildOccupancyGrid -> traceContour -> simplify/smooth -> normalize) so the
 * body outline matches the GLB-hull mode and the model-viewer geometry. The
 * only additions over the GLB-hull profile are:
 *
 *   1. Re-orientation to the curated convention (nose at x~0 / left, floor at
 *      y~1 / bottom) so it matches the hand-authored mclaren.json look and the
 *      wind-from-left solver inlet.
 *   2. Arc-length resample of the closed outline to ~100 even points.
 *   3. Derived cosmetic `details` (floor, rearWing, frontWing, halo, stripe,
 *      sidepod) computed from the traced top/bottom envelope -- grounded in the
 *      real silhouette, not invented.
 *
 * Output (2-space JSON) written to BOTH:
 *   data/silhouettes/<slug>.json
 *   apps/web/public/data/silhouettes/<slug>.json
 * plus an ASCII + SVG review snapshot under
 *   pipeline/export/silhouette-snapshots/<slug>.{txt,svg}
 *
 * Usage:
 *   node pipeline/export/src/build-silhouette-from-glb.mjs            # all catalog cars
 *   node pipeline/export/src/build-silhouette-from-glb.mjs --slug=red-bull
 *   node pipeline/export/src/build-silhouette-from-glb.mjs --slug=red-bull --slug=ferrari
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  loadGlbPositions,
  computeRanges,
  pickAxes,
  projectToSide,
  buildOccupancyGrid,
  traceContour,
  simplifyPolygon,
  smoothPolygon,
  normalizePolygonToCanvas,
  detectWheelsFromPolygon,
  fallbackWheelArches,
  resampleClosedByArcLength,
} from "./build-wind-profiles.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_DIRS = [
  path.join(root, "data", "silhouettes"),
  path.join(root, "apps", "web", "public", "data", "silhouettes"),
];
const SNAPSHOT_DIR = path.join(root, "pipeline", "export", "silhouette-snapshots");

const BODY_TARGET_POINTS = 100;
const MIN_POINTS = 32;
const MIN_ASPECT = 2.0;
// Ferrari's genuine GLB trace is ~4.76 (the shipping GLB-hull profile is the
// same); the ceiling must admit it or the silhouette would not be 1:1.
const MAX_ASPECT = 5.0;

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

// --- Orientation: match curated convention (nose left, floor bottom). ---

/**
 * The GLB-hull trace orients the model inconsistently per car (its forward-sign
 * is computed from 3D lateral width, which is near-symmetric on some chassis and
 * flips). We re-derive orientation in 2D from the traced outline using two
 * robust physical invariants, independent of the trace's sign choice:
 *
 *   - Floor at the BOTTOM (y ~ 1): the lower body is wider/flatter (floor +
 *     diffuser span) than the top. Compare the horizontal span of the
 *     top-quartile band vs the bottom-quartile band; the wider band is the
 *     floor and must sit at the bottom. Flip Y if needed.
 *   - Nose at the LEFT (x ~ 0): the REAR of an F1 car carries the tallest
 *     single structure (rear wing + engine cover + diffuser), so the end with
 *     the greater vertical body extent is the rear and must sit on the RIGHT.
 *     Flip X so the taller-edge end lands on the right.
 *
 * Nose-left / rear-right matches the curated mclaren.json convention and the
 * wind-from-left solver inlet.
 */
function orientToCuratedConvention(polygon) {
  if (!polygon.length) return polygon;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  // Floor detection: horizontal span of the top vs bottom quartile band. The
  // wider band is the floor (floor + diffuser) and must sit at the bottom.
  const topBandXs = [];
  const botBandXs = [];
  for (const [x, y] of polygon) {
    const ty = (y - minY) / spanY;
    if (ty <= 0.25) topBandXs.push(x);
    if (ty >= 0.75) botBandXs.push(x);
  }
  const span = (arr) => (arr.length ? Math.max(...arr) - Math.min(...arr) : 0);
  // If the top band is wider than the bottom band, the car is upside down.
  const flipY = span(topBandXs) > span(botBandXs) * 1.02;

  // Rear detection: vertical body extent near each X edge. A wide band avoids a
  // thin front-wing sliver dominating. The taller end is the rear.
  const band = 0.14;
  let leftMinY = Infinity, leftMaxY = -Infinity;
  let rightMinY = Infinity, rightMaxY = -Infinity;
  for (const [x, y] of polygon) {
    const tx = (x - minX) / spanX;
    if (tx <= band) {
      if (y < leftMinY) leftMinY = y;
      if (y > leftMaxY) leftMaxY = y;
    }
    if (tx >= 1 - band) {
      if (y < rightMinY) rightMinY = y;
      if (y > rightMaxY) rightMaxY = y;
    }
  }
  const leftExtent = Number.isFinite(leftMaxY) ? leftMaxY - leftMinY : 0;
  const rightExtent = Number.isFinite(rightMaxY) ? rightMaxY - rightMinY : 0;
  // Rear (taller) should be on the right. If the left edge is taller, flip X.
  const flipX = leftExtent > rightExtent;

  return polygon.map(([x, y]) => [
    flipX ? maxX + minX - x : x,
    flipY ? maxY + minY - y : y,
  ]);
}

// --- Top/bottom envelope sampling from the oriented outline. ---

/**
 * Sample the silhouette into `bins` columns and return, per column, the
 * top (min y) and bottom (max y) of the body. Used to derive grounded detail
 * polylines. Operates in the [0,1] normalized frame.
 */
function sampleEnvelope(polygon, bins) {
  const tops = new Array(bins).fill(Infinity);
  const bottoms = new Array(bins).fill(-Infinity);
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    const steps = Math.max(1, Math.ceil(Math.abs(x2 - x1) * bins) + 1);
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const bin = Math.max(0, Math.min(bins - 1, Math.floor(x * bins)));
      if (y < tops[bin]) tops[bin] = y;
      if (y > bottoms[bin]) bottoms[bin] = y;
    }
  }
  return { tops, bottoms };
}

function binX(bin, bins) {
  return (bin + 0.5) / bins;
}

/**
 * Derive cosmetic detail polylines from the traced envelope. Everything here
 * is grounded in the real silhouette geometry:
 *   - floor: a 2-point line along the lower envelope between the wheels.
 *   - rearWing: the upper-rear crest (top envelope over the rear span).
 *   - frontWing: the lower-front lip (bottom envelope over the nose span).
 *   - halo: a short arc over the cockpit headrest (top envelope around the
 *     mid-chassis high point).
 *   - stripe: the body shoulder/waistline between nose and rear.
 *   - sidepod: the body shoulder behind the cockpit.
 */
function deriveDetails(polygon, wheelArches) {
  const bins = 80;
  const { tops, bottoms } = sampleEnvelope(polygon, bins);
  const valid = (v) => Number.isFinite(v);

  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of polygon) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanY = maxY - minY || 1;
  const details = [];

  // floor: lower envelope, sampled between front wheel and rear wheel.
  const wheelXs = wheelArches.map((w) => w.cx).sort((a, b) => a - b);
  const floorFrom = wheelXs.length ? Math.max(0.08, wheelXs[0]) : 0.18;
  const floorTo = wheelXs.length ? Math.min(0.92, wheelXs[wheelXs.length - 1]) : 0.86;
  const floorPts = [];
  for (let b = 0; b < bins; b += 1) {
    const x = binX(b, bins);
    if (x < floorFrom || x > floorTo) continue;
    if (!valid(bottoms[b])) continue;
    floorPts.push([round4(x), round4(bottoms[b] - spanY * 0.02)]);
  }
  if (floorPts.length >= 2) {
    details.push({ kind: "floor", points: [floorPts[0], floorPts[floorPts.length - 1]] });
  }

  // rearWing: top envelope over the rear 18% span.
  const rearWing = [];
  for (let b = 0; b < bins; b += 1) {
    const x = binX(b, bins);
    if (x < 0.82) continue;
    if (!valid(tops[b])) continue;
    rearWing.push([round4(x), round4(tops[b])]);
  }
  if (rearWing.length >= 2) details.push({ kind: "rearWing", points: rearWing });

  // frontWing: bottom envelope over the nose 16% span.
  const frontWing = [];
  for (let b = 0; b < bins; b += 1) {
    const x = binX(b, bins);
    if (x > 0.16) continue;
    if (!valid(bottoms[b])) continue;
    frontWing.push([round4(x), round4(bottoms[b])]);
  }
  if (frontWing.length >= 2) details.push({ kind: "frontWing", points: frontWing });

  // cockpit/halo: highest body point (headrest) in the mid-front band.
  let cockpitBin = -1;
  let cockpitTop = Infinity;
  for (let b = 0; b < bins; b += 1) {
    const x = binX(b, bins);
    if (x < 0.30 || x > 0.55) continue;
    if (!valid(tops[b])) continue;
    if (tops[b] < cockpitTop) { cockpitTop = tops[b]; cockpitBin = b; }
  }
  if (cockpitBin >= 0) {
    const cx = binX(cockpitBin, bins);
    const halo = [];
    const arcW = 0.10;
    const samples = 16;
    for (let s = 0; s <= samples; s += 1) {
      const t = s / samples;
      const x = cx - arcW + t * (arcW * 2);
      const arc = Math.sin(t * Math.PI); // 0..1..0
      const y = cockpitTop - spanY * 0.06 * arc;
      halo.push([round4(x), round4(y)]);
    }
    details.push({ kind: "halo", points: halo });
  }

  // stripe: a mid-height shoulder line between nose and rear.
  const stripe = [];
  for (let b = 0; b < bins; b += 1) {
    const x = binX(b, bins);
    if (x < 0.18 || x > 0.80) continue;
    if (!valid(tops[b]) || !valid(bottoms[b])) continue;
    const mid = tops[b] * 0.6 + bottoms[b] * 0.4;
    stripe.push([round4(x), round4(mid)]);
  }
  if (stripe.length >= 4) {
    const step = Math.max(1, Math.floor(stripe.length / 24));
    details.push({ kind: "stripe", points: stripe.filter((_, i) => i % step === 0 || i === stripe.length - 1) });
  }

  // sidepod: the body shoulder behind the cockpit.
  const sidepod = [];
  for (let b = 0; b < bins; b += 1) {
    const x = binX(b, bins);
    if (x < 0.42 || x > 0.70) continue;
    if (!valid(tops[b]) || !valid(bottoms[b])) continue;
    const y = tops[b] * 0.35 + bottoms[b] * 0.65;
    sidepod.push([round4(x), round4(y)]);
  }
  if (sidepod.length >= 4) {
    const step = Math.max(1, Math.floor(sidepod.length / 24));
    details.push({ kind: "sidepod", points: sidepod.filter((_, i) => i % step === 0 || i === sidepod.length - 1) });
  }

  return details;
}

// --- Snapshots for verification. ---

function asciiSnapshot(polygon, label) {
  const W = 96;
  const H = 20;
  const grid = Array.from({ length: H }, () => Array(W).fill(" "));
  const set = (gx, gy) => {
    if (gx >= 0 && gy >= 0 && gx < W && gy < H) grid[gy][gx] = "#";
  };
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    const steps = 80;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      set(Math.round((x1 + (x2 - x1) * t) * (W - 1)), Math.round((y1 + (y2 - y1) * t) * (H - 1)));
    }
  }
  const rows = grid.map((r) => r.join(""));
  return `=== ${label} ===\n${rows.join("\n")}\n`;
}

function svgSnapshot(manifest) {
  const w = 768;
  const h = 288;
  const poly = manifest.polygon.map(([x, y]) => `${(x * w).toFixed(1)},${(y * h).toFixed(1)}`).join(" ");
  const wheels = manifest.wheelArches
    .map(({ cx, cy, r }) => `<circle cx="${(cx * w).toFixed(1)}" cy="${(cy * h).toFixed(1)}" r="${(r * h).toFixed(1)}" fill="none" stroke="#ff7a1a" stroke-width="2" stroke-dasharray="5 4" />`)
    .join("");
  const detailColors = {
    floor: "#7CFFB2", rearWing: "#9ad0ff", frontWing: "#c8dcfa",
    halo: "#dce8ff", stripe: "#ff7a1a", sidepod: "#a0c3eb", beamWing: "#dce8ff",
  };
  const detailEls = manifest.details.map((d) => {
    const pts = d.points.map(([x, y]) => `${(x * w).toFixed(1)},${(y * h).toFixed(1)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${detailColors[d.kind] || "#fff"}" stroke-width="1.6" />`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#0b0f18" />
  <polygon points="${poly}" fill="rgba(247,250,255,0.88)" stroke="#ff7a1a" stroke-width="2" />
  ${detailEls}
  ${wheels}
  <text x="14" y="24" fill="#d7deea" font-family="monospace" font-size="14">${manifest.constructorSlug} · ${manifest.pointCount} pts · aspect ${manifest.aspect}</text>
</svg>`;
}

// --- Per-model build. ---

async function buildOne(entry) {
  const glbPath = path.join(root, "apps", "web", "public", entry.file.replace(/^\//, ""));
  const slug = entry.constructorSlug;

  const points = await loadGlbPositions(glbPath);
  if (!points.length) throw new Error(`${slug}: GLB produced zero positions`);
  const ranges = computeRanges(points);
  if (!ranges) throw new Error(`${slug}: no ranges`);
  const axes = pickAxes(points, ranges, entry.axesOverride || null);
  const side2d = projectToSide(points, axes, ranges);
  const grid = buildOccupancyGrid(side2d, ranges, axes);
  const rawContour = traceContour(grid);
  if (rawContour.length < 16) throw new Error(`${slug}: contour too small (${rawContour.length})`);

  // Same simplify/smooth chain as the GLB-hull profile, so the body matches.
  const simplified = simplifyPolygon(rawContour, 2.8);
  const smoothed = smoothPolygon(simplified, 2);
  const polished = simplifyPolygon(smoothed, 1.0);
  const { polygon: normalized, aspect } = normalizePolygonToCanvas(polished);

  // Orient to the curated convention, then resample to a dense even outline.
  const oriented = orientToCuratedConvention(normalized);
  const body = resampleClosedByArcLength(oriented, BODY_TARGET_POINTS);
  if (body.length < MIN_POINTS) throw new Error(`${slug}: resampled to ${body.length} pts (< ${MIN_POINTS})`);
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) {
    throw new Error(`${slug}: aspect ${aspect.toFixed(2)} outside ${MIN_ASPECT}..${MAX_ASPECT}`);
  }

  // Wheel arches from the oriented body; fall back if detection is weak.
  let wheelArches = detectWheelsFromPolygon(body);
  if (wheelArches.length < 2) wheelArches = fallbackWheelArches();
  wheelArches = wheelArches
    .map((w) => ({ cx: round4(w.cx), cy: round4(w.cy), r: round4(w.r) }))
    .sort((a, b) => a.cx - b.cx);

  const details = deriveDetails(body, wheelArches);

  const manifest = {
    constructorSlug: slug,
    source: "glb-trace",
    sourceGlb: path.relative(root, glbPath).replace(/\\/g, "/"),
    curatedAt: new Date().toISOString().slice(0, 10) + "T00:00:00Z",
    polygon: body.map(([x, y]) => [round4(x), round4(y)]),
    wheelArches,
    details,
    aspect: round4(aspect),
    pointCount: body.length,
  };

  for (const dir of OUT_DIRS) {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${slug}.json`), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const label = `${slug} (${manifest.pointCount} pts, aspect ${manifest.aspect}, wheels ${wheelArches.length}, details ${details.length})`;
  await writeFile(path.join(SNAPSHOT_DIR, `${slug}.txt`), asciiSnapshot(body, label) + "\n", "utf8");
  await writeFile(path.join(SNAPSHOT_DIR, `${slug}.svg`), svgSnapshot(manifest), "utf8");

  return { manifest, ascii: asciiSnapshot(body, label) };
}

// --- Entry point. ---

async function main() {
  const slugArgs = process.argv.filter((a) => a.startsWith("--slug=")).map((a) => a.split("=")[1]);
  const catalogPath = path.join(root, "data", "packs", "cars", "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

  let models = catalog.models;
  if (slugArgs.length) models = models.filter((m) => slugArgs.includes(m.constructorSlug));
  if (!models.length) throw new Error(slugArgs.length ? `No catalog models match ${slugArgs.join(", ")}` : "No catalog models");

  let ok = 0;
  let fail = 0;
  for (const entry of models) {
    try {
      const { manifest, ascii } = await buildOne(entry);
      ok += 1;
      process.stdout.write(
        `built ${manifest.constructorSlug}: ${manifest.pointCount} pts, aspect ${manifest.aspect}, ` +
        `${manifest.wheelArches.length} wheels, ${manifest.details.length} details\n`,
      );
      process.stdout.write(ascii + "\n");
    } catch (error) {
      fail += 1;
      process.stderr.write(`FAIL ${entry.constructorSlug}: ${error instanceof Error ? error.message : error}\n`);
    }
  }
  process.stdout.write(`\nDone. ok=${ok} fail=${fail}\n`);
  if (fail) process.exitCode = 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
    process.exit(1);
  });
}
