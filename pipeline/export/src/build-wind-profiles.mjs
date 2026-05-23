/**
 * Wind-tunnel silhouette extractor (rewritten 2026-05-23).
 *
 * The previous PCA-based axis selection was unreliable on F1 GLBs because
 * a chassis is roughly long-thin-low and PCA's second axis flips between
 * "up" and "lateral" depending on tiny differences in the model. The
 * resulting side profile aspect ratio came out around 0.6 - 1.2 instead of
 * the canonical ~3.0 for an F1 car.
 *
 * The new pipeline:
 *
 * 1. Read all world-space vertex positions from the GLB (handles Draco).
 * 2. Try axis-aligned projection planes: XY, XZ, YZ (and lateral folds).
 * 3. Score each candidate by aspect ratio proximity to the F1 side view
 *    target (length / height ~= 3.0). Prefer candidates whose long axis is
 *    > 2x the short axis.
 * 4. Optional per-model `axesOverride` from the catalog locks the choice
 *    when PCA-style scoring is ambiguous (e.g. fia-2026 concept).
 * 5. Reorient so the nose points to +X (right) and the floor sits at +Y
 *    (down on canvas).
 * 6. Marching-squares contour, RDP simplification, Chaikin smoothing.
 *
 * Output: data/wind-profiles/<constructor>.json
 */

import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const GRID_NX = 384;
const GRID_NY = 144;

const TARGET_ASPECT = 3.05; // F1 side view length / height
const MIN_ASPECT = 1.6;     // anything below this can't be a side view

async function loadGlbPositions(glbPath) {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });
  const document = await io.read(glbPath);
  const points = [];
  const docRoot = document.getRoot();
  const scene = docRoot.getDefaultScene() || docRoot.listScenes()[0];
  if (!scene) throw new Error("GLB has no scene");

  function multiplyMat4(a, b) {
    const out = new Float64Array(16);
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
        out[c * 4 + r] = sum;
      }
    }
    return out;
  }
  function transformPoint(m, x, y, z) {
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
  }

  function visit(node, parent) {
    const local = new Float64Array(node.getMatrix());
    const world = parent ? multiplyMat4(parent, local) : local;
    const mesh = node.getMesh();
    if (mesh) {
      for (const primitive of mesh.listPrimitives()) {
        const pos = primitive.getAttribute("POSITION");
        if (!pos) continue;
        const array = pos.getArray();
        if (!array) continue;
        const stride = pos.getElementSize();
        const count = pos.getCount();
        const cap = 200000;
        const step = Math.max(1, Math.floor(count / cap));
        for (let i = 0; i < count; i += step) {
          const o = i * stride;
          const p = transformPoint(world, array[o], array[o + 1], array[o + 2]);
          points.push(p);
        }
      }
    }
    for (const child of node.listChildren()) visit(child, world);
  }
  for (const node of scene.listChildren()) visit(node, null);
  return points;
}

/**
 * Compute axis-aligned bounding box and ranges. F1 chassis is one of the
 * three principal axes -- typically Z = forward, Y = up. We robustly fit by
 * using the 1st and 99th percentile of each axis to ignore stray outlier
 * points (suspension uprights, screws, etc.).
 */
function computeRanges(points) {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]).sort((a, b) => a - b);
  const ys = points.map((p) => p[1]).sort((a, b) => a - b);
  const zs = points.map((p) => p[2]).sort((a, b) => a - b);
  function percentile(arr, p) {
    const idx = Math.max(0, Math.min(arr.length - 1, Math.floor(arr.length * p)));
    return arr[idx];
  }
  return {
    x: { min: percentile(xs, 0.005), max: percentile(xs, 0.995) },
    y: { min: percentile(ys, 0.005), max: percentile(ys, 0.995) },
    z: { min: percentile(zs, 0.005), max: percentile(zs, 0.995) },
  };
}

/**
 * Pick the best axis pair for the side-view projection. Returns
 * { forwardAxis: 0|1|2, upAxis: 0|1|2, forwardSign: +/-1, upSign: +/-1 }.
 *
 * Strategy:
 *   - For each axis ordered by range (longest first), try pairing with each
 *     of the remaining two axes as the up axis. Score = aspect proximity
 *     to TARGET_ASPECT, weighted so the third axis (lateral) is strictly
 *     the smallest.
 *   - If `axesOverride` is provided, use it directly.
 *
 * `axesOverride` shape: { forward: "+x" | "-x" | "+y" | "-y" | "+z" | "-z",
 *                          up: "+x" | "-x" | "+y" | "-y" | "+z" | "-z" }.
 */
function pickAxes(points, ranges, axesOverride) {
  const sizes = [
    { axis: 0, len: ranges.x.max - ranges.x.min, name: "x" },
    { axis: 1, len: ranges.y.max - ranges.y.min, name: "y" },
    { axis: 2, len: ranges.z.max - ranges.z.min, name: "z" },
  ];

  function parseAxisRef(ref) {
    const sign = ref.startsWith("-") ? -1 : 1;
    const name = ref.replace(/^[+\-]/, "").toLowerCase();
    const idx = name === "x" ? 0 : name === "y" ? 1 : 2;
    return { axis: idx, sign };
  }

  if (axesOverride && axesOverride.forward && axesOverride.up) {
    const fwd = parseAxisRef(axesOverride.forward);
    const up = parseAxisRef(axesOverride.up);
    if (fwd.axis === up.axis) {
      throw new Error(`axesOverride forward and up cannot use the same axis (${fwd.axis})`);
    }
    return {
      forwardAxis: fwd.axis,
      forwardSign: fwd.sign,
      upAxis: up.axis,
      upSign: up.sign,
      score: 1,
      reason: "override",
    };
  }

  // Sort by length descending. Forward must be the longest.
  sizes.sort((a, b) => b.len - a.len);
  const forward = sizes[0];
  // For up, try the remaining two and score by aspect.
  const candidates = sizes.slice(1).map((upCandidate) => {
    const aspect = forward.len / Math.max(1e-6, upCandidate.len);
    const lateral = sizes.find((s) => s.axis !== forward.axis && s.axis !== upCandidate.axis);
    const lateralAspect = forward.len / Math.max(1e-6, lateral.len);
    // Prefer aspect close to TARGET_ASPECT.
    const aspectScore = -Math.abs(aspect - TARGET_ASPECT);
    // Prefer up shorter than lateral; if up > lateral, this is probably a top-down view.
    const orderScore = upCandidate.len < lateral.len ? 0.5 : -0.5;
    // Penalize aspects that are obviously wrong.
    const validityScore = aspect >= MIN_ASPECT && lateralAspect >= MIN_ASPECT ? 1 : -2;
    return {
      axis: upCandidate.axis,
      score: aspectScore + orderScore + validityScore,
      aspect,
      lateralAspect,
    };
  });
  candidates.sort((a, b) => b.score - a.score);
  const upChoice = candidates[0];
  // Determine sign by checking which end of the forward axis is the nose
  // (narrow end). Sample width along the forward axis; nose is the narrower end.
  const forwardSign = computeForwardSign(points, ranges, forward.axis, sizes.find((s) => s.axis !== forward.axis && s.axis !== upChoice.axis).axis);
  // For up axis, default to +Y is up; flip so most points sit above the floor.
  const upSign = computeUpSign(points, ranges, upChoice.axis);
  return {
    forwardAxis: forward.axis,
    forwardSign,
    upAxis: upChoice.axis,
    upSign,
    score: upChoice.score,
    aspect: upChoice.aspect,
    reason: "auto",
  };
}

function computeForwardSign(points, ranges, forwardAxis, lateralAxis) {
  const fMin = ranges["xyz"[forwardAxis]].min;
  const fMax = ranges["xyz"[forwardAxis]].max;
  const fRange = fMax - fMin || 1;
  const bins = 24;
  const widths = new Array(bins).fill(0);
  for (const p of points) {
    const f = p[forwardAxis];
    const l = p[lateralAxis];
    const bin = Math.max(0, Math.min(bins - 1, Math.floor(((f - fMin) / fRange) * bins)));
    widths[bin] = Math.max(widths[bin], Math.abs(l));
  }
  const front3 = (widths[0] + widths[1] + widths[2]) / 3;
  const back3 = (widths[bins - 1] + widths[bins - 2] + widths[bins - 3]) / 3;
  // Nose = narrower end. We want the nose to land on +forward.
  return front3 < back3 ? 1 : -1;
}

function computeUpSign(points, ranges, upAxis) {
  const uMin = ranges["xyz"[upAxis]].min;
  const uMax = ranges["xyz"[upAxis]].max;
  // Count how much mass sits in lower vs upper half along this axis.
  const mid = (uMin + uMax) * 0.5;
  let lower = 0;
  let upper = 0;
  for (const p of points) {
    if (p[upAxis] < mid) lower += 1; else upper += 1;
  }
  // F1 cars have most mass low (chassis + floor). We want +up to point away
  // from the heavy side, so the body sits in the lower half of the canvas.
  return lower > upper ? 1 : -1;
}

function projectToSide(points, axes, ranges) {
  const fwdMin = ranges["xyz"[axes.forwardAxis]].min;
  const fwdMax = ranges["xyz"[axes.forwardAxis]].max;
  const upMin = ranges["xyz"[axes.upAxis]].min;
  const upMax = ranges["xyz"[axes.upAxis]].max;
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    let fwd = p[axes.forwardAxis];
    let upv = p[axes.upAxis];
    if (axes.forwardSign < 0) fwd = fwdMax + fwdMin - fwd;
    if (axes.upSign < 0) upv = upMax + upMin - upv;
    out[i] = [fwd, upv];
  }
  return out;
}

function buildOccupancyGrid(side2d, ranges, axes) {
  // Density-based silhouette extraction. Single-point occupancy is too noisy
  // because GLB vertex clouds are sparse and scatter beyond the actual body
  // (halo struts, suspension uprights, decals). Instead we count points per
  // cell, then threshold against a robust density estimate so only cells
  // that genuinely sit on the body survive.
  const counts = new Uint32Array(GRID_NX * GRID_NY);
  const fwdRange = ranges["xyz"[axes.forwardAxis]];
  const upRange = ranges["xyz"[axes.upAxis]];
  const minX = fwdRange.min;
  const maxX = fwdRange.max;
  const minY = upRange.min;
  const maxY = upRange.max;
  const rx = maxX - minX || 1;
  const ry = maxY - minY || 1;
  const aspect = rx / ry;
  const padX = 0.04;
  const usableW = GRID_NX * (1 - 2 * padX);
  const usableH = Math.min(GRID_NY * 0.94, usableW / aspect);
  const offsetX = GRID_NX * padX;
  const offsetY = (GRID_NY - usableH) * 0.5;
  for (const p of side2d) {
    if (p[0] < minX || p[0] > maxX) continue;
    if (p[1] < minY || p[1] > maxY) continue;
    const nx = (p[0] - minX) / rx;
    const ny = (p[1] - minY) / ry;
    const gx = Math.max(0, Math.min(GRID_NX - 1, Math.floor(offsetX + nx * usableW)));
    const gy = Math.max(0, Math.min(GRID_NY - 1, Math.floor(offsetY + (1 - ny) * usableH)));
    counts[gy * GRID_NX + gx] += 1;
  }
  // Compute the median count over occupied cells. Cells with at least
  // (median * 0.6) hits are real body; isolated noise scatters at < median.
  const occupied = [];
  for (const c of counts) if (c > 0) occupied.push(c);
  occupied.sort((a, b) => a - b);
  if (!occupied.length) return new Uint8Array(GRID_NX * GRID_NY);
  const median = occupied[Math.floor(occupied.length * 0.5)];
  const threshold = Math.max(2, Math.floor(median * 0.6));
  const grid = new Uint8Array(GRID_NX * GRID_NY);
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] >= threshold) grid[i] = 1;
  }
  // Single dilation pass to close hairline gaps between adjacent body cells.
  // No erosion afterwards; the threshold already filtered noise.
  const dilated = new Uint8Array(grid);
  for (let y = 1; y < GRID_NY - 1; y += 1) {
    for (let x = 1; x < GRID_NX - 1; x += 1) {
      if (grid[y * GRID_NX + x]) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (grid[(y + dy) * GRID_NX + (x + dx)]) neighbors += 1;
        }
      }
      if (neighbors >= 4) dilated[y * GRID_NX + x] = 1;
    }
  }
  return dilated;
}

function traceContour(grid) {
  // Column-envelope silhouette extractor. For each grid column we find the
  // top-most and bottom-most occupied cell. The polygon is then formed by
  // walking along the top envelope from left to right, then back along the
  // bottom envelope from right to left. This is robust for side-view
  // silhouettes where each forward bin has a single body span (F1 cars).
  const tops = new Array(GRID_NX).fill(-1);
  const bottoms = new Array(GRID_NX).fill(-1);
  for (let x = 0; x < GRID_NX; x += 1) {
    for (let y = 0; y < GRID_NY; y += 1) {
      if (grid[y * GRID_NX + x]) {
        if (tops[x] === -1) tops[x] = y;
        bottoms[x] = y;
      }
    }
  }
  // Find the contiguous range of occupied columns. This isolates the main
  // body and ignores stray columns at the far edges.
  let xStart = -1;
  let xEnd = -1;
  for (let x = 0; x < GRID_NX; x += 1) {
    if (tops[x] !== -1) {
      if (xStart === -1) xStart = x;
      xEnd = x;
    }
  }
  if (xStart === -1) return [];
  // Fill any single-column gaps inside the body range so the envelope is
  // continuous.
  for (let x = xStart + 1; x < xEnd; x += 1) {
    if (tops[x] === -1) {
      // Look at neighbours; interpolate.
      let lo = x - 1;
      while (lo >= xStart && tops[lo] === -1) lo -= 1;
      let hi = x + 1;
      while (hi <= xEnd && tops[hi] === -1) hi += 1;
      if (lo >= xStart && hi <= xEnd) {
        const t = (x - lo) / (hi - lo);
        tops[x] = Math.round(tops[lo] + (tops[hi] - tops[lo]) * t);
        bottoms[x] = Math.round(bottoms[lo] + (bottoms[hi] - bottoms[lo]) * t);
      }
    }
  }
  // Build the polygon: top envelope left to right, bottom envelope right to
  // left.
  const polygon = [];
  for (let x = xStart; x <= xEnd; x += 1) {
    if (tops[x] !== -1) polygon.push([x, tops[x]]);
  }
  for (let x = xEnd; x >= xStart; x -= 1) {
    if (bottoms[x] !== -1 && bottoms[x] !== tops[x]) polygon.push([x, bottoms[x]]);
  }
  return polygon;
}

function simplifyPolygon(polygon, tolerance = 1.4) {
  if (polygon.length < 4) return polygon;
  const sqTolerance = tolerance * tolerance;
  function sqSegDist(p, p1, p2) {
    let x = p1[0]; let y = p1[1];
    let dx = p2[0] - x; let dy = p2[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = p2[0]; y = p2[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  }
  function dpStep(points, first, last, simplified) {
    let maxDist = sqTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const dist = sqSegDist(points[i], points[first], points[last]);
      if (dist > maxDist) { index = i; maxDist = dist; }
    }
    if (index !== -1) {
      if (index - first > 1) dpStep(points, first, index, simplified);
      simplified.push(points[index]);
      if (last - index > 1) dpStep(points, index, last, simplified);
    }
  }
  const last = polygon.length - 1;
  const simplified = [polygon[0]];
  dpStep(polygon, 0, last, simplified);
  simplified.push(polygon[last]);
  return simplified;
}

function smoothPolygon(polygon, passes = 2) {
  let current = polygon;
  for (let p = 0; p < passes; p += 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 1) {
      const [x1, y1] = current[i];
      const [x2, y2] = current[(i + 1) % current.length];
      next.push([x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25]);
      next.push([x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75]);
    }
    current = next;
  }
  return current;
}

/**
 * Detect wheel arch positions from the silhouette polygon. Wheels show up
 * as the lower bumps in the side profile. We slice the polygon vertically
 * into bins and look for cells where the silhouette extends close to the
 * floor; circular arches sit roughly at those positions.
 */
function detectWheelsFromPolygon(polygon) {
  if (!polygon.length) return [];
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  // Find lower envelope (max-y per column).
  const bins = 64;
  const lowerY = new Array(bins).fill(0);
  for (const [x, y] of polygon) {
    const bin = Math.max(0, Math.min(bins - 1, Math.floor(((x - minX) / rangeX) * bins)));
    if (y > lowerY[bin]) lowerY[bin] = y;
  }
  // Floor height = max value of lowerY across bins.
  const floorY = Math.max(...lowerY);
  // Wheels: bins where lowerY is within 5% of floorY and there's a local
  // peak of curvature (lowerY rises above neighbours). Simpler: find the
  // continuous regions near floorY, take the centre of the front and rear.
  const isLow = lowerY.map((y) => y > floorY - rangeY * 0.04);
  const regions = [];
  let start = -1;
  for (let i = 0; i < bins; i += 1) {
    if (isLow[i] && start === -1) start = i;
    if (!isLow[i] && start !== -1) {
      regions.push({ start, end: i - 1 });
      start = -1;
    }
  }
  if (start !== -1) regions.push({ start, end: bins - 1 });
  // Filter to regions of width >= 4 bins (real wheels).
  const wide = regions.filter((r) => r.end - r.start >= 3);
  // Pick the leftmost and rightmost regions.
  if (wide.length === 0) return [];
  wide.sort((a, b) => a.start - b.start);
  const picked = wide.length === 1 ? wide : [wide[0], wide[wide.length - 1]];
  return picked.map((r) => {
    const cBin = (r.start + r.end) * 0.5;
    const cX = minX + ((cBin + 0.5) / bins) * rangeX;
    return {
      cx: cX,
      cy: floorY - rangeY * 0.04,
      r: 0.045,
    };
  });
}

function normalizePolygonToCanvas(polygon) {
  // Bbox-normalize each axis independently to [0,1]. The aspect ratio is
  // recorded separately in the JSON so consumers can preserve the real
  // silhouette aspect when laying it out.
  if (!polygon.length) return { polygon: [], aspect: 1 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const aspect = dx / dy;
  const points = polygon.map(([x, y]) => [(x - minX) / dx, (y - minY) / dy]);
  return { polygon: points, aspect };
}

async function processModel(entry, glbPath, outDir) {
  process.stdout.write(`Processing ${entry.constructor} (${entry.constructorSlug}) ...\n`);
  let points;
  try {
    points = await loadGlbPositions(glbPath);
  } catch (error) {
    process.stdout.write(`  FAIL load: ${error instanceof Error ? error.message : error}\n`);
    return false;
  }
  if (!points.length) {
    process.stdout.write(`  skip: zero positions\n`);
    return false;
  }
  const ranges = computeRanges(points);
  if (!ranges) {
    process.stdout.write(`  skip: no ranges\n`);
    return false;
  }
  let axes;
  try {
    axes = pickAxes(points, ranges, entry.axesOverride || null);
  } catch (error) {
    process.stdout.write(`  FAIL axes: ${error instanceof Error ? error.message : error}\n`);
    return false;
  }
  process.stdout.write(`  axes: forward=${"xyz"[axes.forwardAxis]}${axes.forwardSign > 0 ? "+" : "-"}, up=${"xyz"[axes.upAxis]}${axes.upSign > 0 ? "+" : "-"} (${axes.reason})\n`);
  const side2d = projectToSide(points, axes, ranges);
  const grid = buildOccupancyGrid(side2d, ranges, axes);
  const rawContour = traceContour(grid);
  if (rawContour.length < 16) {
    process.stdout.write(`  skip: contour too small (${rawContour.length})\n`);
    return false;
  }
  const simplified = simplifyPolygon(rawContour, 2.0);
  const smoothed = smoothPolygon(simplified, 2);
  const { polygon, aspect: polyAspect } = normalizePolygonToCanvas(smoothed);
  const wheelArches = detectWheelsFromPolygon(polygon);
  const payload = {
    constructor: entry.constructor,
    constructorSlug: entry.constructorSlug,
    source: path.relative(root, glbPath).replace(/\\/g, "/"),
    polygon,
    wheelArches,
    aspect: Number(polyAspect.toFixed(3)),
    bbox: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    pointCount: polygon.length,
    samples: points.length,
    axesNote: `forward=${"xyz"[axes.forwardAxis]}${axes.forwardSign > 0 ? "+" : "-"}, up=${"xyz"[axes.upAxis]}${axes.upSign > 0 ? "+" : "-"} (${axes.reason})`,
    extractedAt: new Date().toISOString(),
  };
  const outPath = path.join(outDir, `${entry.constructorSlug}.json`);
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  process.stdout.write(`  ok: ${polygon.length} pts, aspect=${polyAspect.toFixed(2)} (${points.length} samples)\n`);
  return true;
}

async function main() {
  const catalogPath = path.join(root, "data", "packs", "cars", "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf-8"));
  const outDir = path.join(root, "data", "wind-profiles");
  await mkdir(outDir, { recursive: true });

  let ok = 0;
  let fail = 0;
  for (const entry of catalog.models) {
    const glbPath = path.join(root, "apps", "web", "public", entry.file.replace(/^\//, ""));
    try {
      const success = await processModel(entry, glbPath, outDir);
      if (success) ok += 1; else fail += 1;
    } catch (error) {
      fail += 1;
      process.stdout.write(`  FAIL: ${error instanceof Error ? error.stack || error.message : error}\n`);
    }
  }

  const publicDir = path.join(root, "apps", "web", "public", "data", "wind-profiles");
  await mkdir(publicDir, { recursive: true });
  const entries = await readdir(outDir);
  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    await copyFile(path.join(outDir, file), path.join(publicDir, file));
  }
  process.stdout.write(`\nDone. ok=${ok} fail=${fail}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
