/**
 * Wind-tunnel silhouette extractor (rewritten 2026-05-22).
 *
 * Old version hand-parsed GLB accessors. That broke on Draco-compressed
 * exports (e.g. McLaren MCL39) and used naive axis-aligned heuristics, which
 * produced wrong side profiles. This version uses @gltf-transform with Draco
 * decoding, runs a PCA-style axis pass to find true forward / up / lateral,
 * then traces a real silhouette via marching squares on a dilated occupancy
 * grid.
 *
 * Output: data/wind-profiles/<constructor>.json
 *
 *   {
 *     constructor, constructorSlug, source,
 *     polygon: [[x0,y0], [x1,y1], ...],   // closed loop, normalized to [0,1]
 *     wheelArches: [{ cx, cy, r }, ...],  // approx wheel circle markers
 *     bbox: { minX, maxX, minY, maxY },
 *     pointCount, samples, extractedAt
 *   }
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

// PCA over a sample of vertex positions to find principal axes.
function pca(points) {
  const n = points.length;
  if (n === 0) return null;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const p of points) { mx += p[0]; my += p[1]; mz += p[2]; }
  mx /= n; my /= n; mz /= n;
  let cxx = 0, cyy = 0, czz = 0, cxy = 0, cxz = 0, cyz = 0;
  for (const p of points) {
    const dx = p[0] - mx, dy = p[1] - my, dz = p[2] - mz;
    cxx += dx * dx; cyy += dy * dy; czz += dz * dz;
    cxy += dx * dy; cxz += dx * dz; cyz += dy * dz;
  }
  cxx /= n; cyy /= n; czz /= n; cxy /= n; cxz /= n; cyz /= n;
  // Power iteration on a 3x3 symmetric covariance matrix to extract dominant
  // axes. We need the first two principal components; the third we derive by
  // cross product so it's orthonormal.
  function multiply(m, v) {
    return [
      m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
      m[1] * v[0] + m[3] * v[1] + m[4] * v[2],
      m[2] * v[0] + m[4] * v[1] + m[5] * v[2],
    ];
  }
  function norm(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }
  const cov = [cxx, cxy, cxz, cyy, cyz, czz];
  let v1 = norm([1, 0.7, 0.3]);
  for (let i = 0; i < 60; i += 1) v1 = norm(multiply(cov, v1));
  // Deflate.
  function deflate(v) {
    return [
      [cov[0] - v[0] * v[0] * cov[0], cov[1] - v[0] * v[1] * cov[0], cov[2] - v[0] * v[2] * cov[0]],
      [cov[1] - v[1] * v[0] * cov[3], cov[3] - v[1] * v[1] * cov[3], cov[4] - v[1] * v[2] * cov[3]],
      [cov[2] - v[2] * v[0] * cov[5], cov[4] - v[2] * v[1] * cov[5], cov[5] - v[2] * v[2] * cov[5]],
    ];
  }
  const def = deflate(v1);
  function multiplyMat(m, v) {
    return [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
  }
  let v2 = norm([0.3, 1, 0.4]);
  for (let i = 0; i < 60; i += 1) v2 = norm(multiplyMat(def, v2));
  // Re-orthogonalize v2 against v1.
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  v2 = norm([v2[0] - dot * v1[0], v2[1] - dot * v1[1], v2[2] - dot * v1[2]]);
  const v3 = norm([
    v1[1] * v2[2] - v1[2] * v2[1],
    v1[2] * v2[0] - v1[0] * v2[2],
    v1[0] * v2[1] - v1[1] * v2[0],
  ]);
  return { mean: [mx, my, mz], v1, v2, v3 };
}

// Decide which axis is forward / up / lateral. F1 cars are long, low, narrow.
// Forward = longest principal axis. Up = the one with the smallest dot with
// world Y (so the silhouette renders side-on). Lateral = remaining.
function pickAxes(pcaResult, points) {
  const axes = [pcaResult.v1, pcaResult.v2, pcaResult.v3];
  // Project all points onto each axis, find ranges.
  const ranges = axes.map((axis) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of points) {
      const dx = p[0] - pcaResult.mean[0];
      const dy = p[1] - pcaResult.mean[1];
      const dz = p[2] - pcaResult.mean[2];
      const t = dx * axis[0] + dy * axis[1] + dz * axis[2];
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    return { axis, range: hi - lo, lo, hi };
  });
  // Forward = largest range.
  ranges.sort((a, b) => b.range - a.range);
  const forward = ranges[0];
  // Up = of the remaining two, the one most aligned with world +Y (vertical).
  const remain = ranges.slice(1);
  remain.sort((a, b) => Math.abs(b.axis[1]) - Math.abs(a.axis[1]));
  const up = remain[0];
  const lateral = remain[1];
  // Flip up so its world-Y component is positive (cars sit upright).
  if (up.axis[1] < 0) {
    up.axis = up.axis.map((c) => -c);
    const tmp = up.lo; up.lo = -up.hi; up.hi = -tmp;
  }
  // Flip forward so the nose lands on +X. We use a heuristic: nose tip is the
  // narrow end; sample the body width in the lateral direction across forward
  // bins and see which end is narrower.
  const bins = 24;
  const widths = new Array(bins).fill(0);
  for (const p of points) {
    const dx = p[0] - pcaResult.mean[0];
    const dy = p[1] - pcaResult.mean[1];
    const dz = p[2] - pcaResult.mean[2];
    const fwdT = dx * forward.axis[0] + dy * forward.axis[1] + dz * forward.axis[2];
    const latT = dx * lateral.axis[0] + dy * lateral.axis[1] + dz * lateral.axis[2];
    const bin = Math.max(0, Math.min(bins - 1, Math.floor(((fwdT - forward.lo) / (forward.range || 1)) * bins)));
    widths[bin] = Math.max(widths[bin], Math.abs(latT));
  }
  const front3 = (widths[0] + widths[1] + widths[2]) / 3;
  const back3 = (widths[bins - 1] + widths[bins - 2] + widths[bins - 3]) / 3;
  if (front3 > back3) {
    forward.axis = forward.axis.map((c) => -c);
    const tmp = forward.lo; forward.lo = -forward.hi; forward.hi = -tmp;
  }
  return { forward, up, lateral, mean: pcaResult.mean };
}

async function loadGlbPositions(glbPath) {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });
  const document = await io.read(glbPath);
  const points = [];
  // Walk the scene graph collecting world-space vertex positions.
  const root = document.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
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
        // Subsample very dense meshes so we don't blow memory; cap at ~200k pts.
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

function projectToSide(points, axes) {
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const dx = p[0] - axes.mean[0];
    const dy = p[1] - axes.mean[1];
    const dz = p[2] - axes.mean[2];
    const fwd = dx * axes.forward.axis[0] + dy * axes.forward.axis[1] + dz * axes.forward.axis[2];
    const upv = dx * axes.up.axis[0] + dy * axes.up.axis[1] + dz * axes.up.axis[2];
    out[i] = [fwd, upv];
  }
  return out;
}

function buildOccupancyGrid(side2d) {
  const grid = new Uint8Array(GRID_NX * GRID_NY);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of side2d) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const rx = maxX - minX || 1;
  const ry = maxY - minY || 1;
  // Pad a little so the silhouette isn't right at the canvas edge.
  const pad = 0.05;
  for (const p of side2d) {
    const nx = (p[0] - minX) / rx;
    const ny = (p[1] - minY) / ry;
    const gx = Math.max(0, Math.min(GRID_NX - 1, Math.floor((pad + (1 - 2 * pad) * nx) * GRID_NX)));
    const gy = Math.max(0, Math.min(GRID_NY - 1, Math.floor((pad + (1 - 2 * pad) * (1 - ny)) * GRID_NY)));
    grid[gy * GRID_NX + gx] = 1;
  }
  // Two-pass dilation so the silhouette closes up.
  const passes = 2;
  let current = grid;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(current);
    for (let y = 1; y < GRID_NY - 1; y += 1) {
      for (let x = 1; x < GRID_NX - 1; x += 1) {
        if (current[y * GRID_NX + x]) continue;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (current[(y + dy) * GRID_NX + (x + dx)]) neighbors += 1;
          }
        }
        if (neighbors >= 3) next[y * GRID_NX + x] = 1;
      }
    }
    current = next;
  }
  // One pass of erosion so we don't end up with a fat blob.
  const eroded = new Uint8Array(current);
  for (let y = 1; y < GRID_NY - 1; y += 1) {
    for (let x = 1; x < GRID_NX - 1; x += 1) {
      if (!current[y * GRID_NX + x]) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (current[(y + dy) * GRID_NX + (x + dx)]) neighbors += 1;
        }
      }
      if (neighbors < 5) eroded[y * GRID_NX + x] = 0;
    }
  }
  return eroded;
}

// Marching-squares contour extraction. Walks the largest connected boundary.
function traceContour(grid) {
  // Build a binary helper.
  function get(x, y) {
    if (x < 0 || y < 0 || x >= GRID_NX || y >= GRID_NY) return 0;
    return grid[y * GRID_NX + x];
  }
  // Find the largest connected component first; isolated debris from suspension
  // arms or stray polygons would otherwise hijack the trace.
  const visited = new Uint8Array(GRID_NX * GRID_NY);
  const labels = new Int32Array(GRID_NX * GRID_NY);
  const sizes = [0];
  let nextLabel = 1;
  const stack = [];
  for (let y = 0; y < GRID_NY; y += 1) {
    for (let x = 0; x < GRID_NX; x += 1) {
      const idx = y * GRID_NX + x;
      if (visited[idx] || !grid[idx]) continue;
      stack.length = 0;
      stack.push(idx);
      visited[idx] = 1;
      let size = 0;
      while (stack.length) {
        const i = stack.pop();
        labels[i] = nextLabel;
        size += 1;
        const cy = Math.floor(i / GRID_NX);
        const cx = i - cy * GRID_NX;
        const neighbors = [
          [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
          [cx + 1, cy + 1], [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= GRID_NX || ny >= GRID_NY) continue;
          const ni = ny * GRID_NX + nx;
          if (visited[ni] || !grid[ni]) continue;
          visited[ni] = 1;
          stack.push(ni);
        }
      }
      sizes.push(size);
      nextLabel += 1;
    }
  }
  let bestLabel = 0;
  let bestSize = 0;
  for (let i = 1; i < sizes.length; i += 1) {
    if (sizes[i] > bestSize) { bestSize = sizes[i]; bestLabel = i; }
  }
  if (!bestLabel) return [];
  // Build a clean grid containing only the dominant component.
  const filtered = new Uint8Array(GRID_NX * GRID_NY);
  for (let i = 0; i < filtered.length; i += 1) {
    if (labels[i] === bestLabel) filtered[i] = 1;
  }

  function getF(x, y) {
    if (x < 0 || y < 0 || x >= GRID_NX || y >= GRID_NY) return 0;
    return filtered[y * GRID_NX + x];
  }

  // Find a starting cell on the boundary of the dominant component.
  let startX = -1, startY = -1;
  outer:
  for (let y = 0; y < GRID_NY; y += 1) {
    for (let x = 0; x < GRID_NX; x += 1) {
      if (getF(x, y)) { startX = x; startY = y; break outer; }
    }
  }
  if (startX < 0) return [];

  // Moore-neighborhood boundary tracing.
  const dirs = [
    [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1],
  ];
  const polygon = [[startX, startY]];
  let x = startX;
  let y = startY;
  let dir = 6; // start by checking south
  let steps = 0;
  const maxSteps = GRID_NX * GRID_NY * 4;
  while (steps < maxSteps) {
    let found = false;
    for (let i = 0; i < 8; i += 1) {
      const dirIdx = (dir + i) % 8;
      const nx = x + dirs[dirIdx][0];
      const ny = y + dirs[dirIdx][1];
      if (getF(nx, ny)) {
        polygon.push([nx, ny]);
        if (nx === startX && ny === startY && polygon.length > 8) { found = false; break; }
        x = nx; y = ny;
        // Rotate so we start scanning from the "back-left" of the new cell.
        dir = (dirIdx + 6) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (polygon.length > 4 && x === startX && y === startY) break;
    steps += 1;
  }
  return polygon;
}

// Ramer-Douglas-Peucker simplification.
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

// Chaikin corner-cutting smoothing. Each pass produces 2x points, replacing
// every corner with a Q1/Q3 pair. Two passes turns the jagged marching-squares
// outline into a smooth airfoil-style curve.
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

// Best-effort wheel detection: project lateral spread by forward bins and
// flag regions where there's a sharp increase in width. Then place a circle
// at the center of each cluster, sized to the local width.
function detectWheels(points, axes) {
  const fwdLo = axes.forward.lo;
  const fwdHi = axes.forward.hi;
  const upLo = axes.up.lo;
  const upHi = axes.up.hi;
  const fwdRange = fwdHi - fwdLo || 1;
  const upRange = upHi - upLo || 1;
  const bins = 36;
  const widths = new Array(bins).fill(0);
  for (const p of points) {
    const dx = p[0] - axes.mean[0];
    const dy = p[1] - axes.mean[1];
    const dz = p[2] - axes.mean[2];
    const fwd = dx * axes.forward.axis[0] + dy * axes.forward.axis[1] + dz * axes.forward.axis[2];
    const up = dx * axes.up.axis[0] + dy * axes.up.axis[1] + dz * axes.up.axis[2];
    const lat = dx * axes.lateral.axis[0] + dy * axes.lateral.axis[1] + dz * axes.lateral.axis[2];
    // Wheels live near the floor: bottom 35% of upRange.
    const upN = (up - upLo) / upRange;
    if (upN > 0.35) continue;
    const bin = Math.max(0, Math.min(bins - 1, Math.floor(((fwd - fwdLo) / fwdRange) * bins)));
    widths[bin] = Math.max(widths[bin], Math.abs(lat));
  }
  // Find two clusters with peak width.
  const peaks = [];
  for (let i = 1; i < bins - 1; i += 1) {
    if (widths[i] > widths[i - 1] && widths[i] >= widths[i + 1] && widths[i] > 0.4) {
      peaks.push({ bin: i, width: widths[i] });
    }
  }
  peaks.sort((a, b) => b.width - a.width);
  const top = peaks.slice(0, 2);
  return top.map(({ bin }) => {
    const fwdN = bin / bins;
    return { cx: 0.05 + fwdN * 0.9, cy: 0.85, r: 0.055 };
  });
}

function normalizePolygonToCanvas(polygon) {
  // Convert grid cells to normalized [0,1] x [0,1] coordinates.
  return polygon.map(([x, y]) => [x / GRID_NX, y / GRID_NY]);
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
  const axes = pickAxes(pca(points), points);
  const side2d = projectToSide(points, axes);
  const grid = buildOccupancyGrid(side2d);
  const rawContour = traceContour(grid);
  if (rawContour.length < 16) {
    process.stdout.write(`  skip: contour too small (${rawContour.length})\n`);
    return false;
  }
  const simplified = simplifyPolygon(rawContour, 2.2);
  const smoothed = smoothPolygon(simplified, 2);
  const polygon = normalizePolygonToCanvas(smoothed);
  const wheelArches = detectWheels(points, axes);
  const payload = {
    constructor: entry.constructor,
    constructorSlug: entry.constructorSlug,
    source: path.relative(root, glbPath).replace(/\\/g, "/"),
    polygon,
    wheelArches,
    bbox: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    pointCount: polygon.length,
    samples: points.length,
    axesNote: "PCA-derived forward/up/lateral",
    extractedAt: new Date().toISOString(),
  };
  const outPath = path.join(outDir, `${entry.constructorSlug}.json`);
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  process.stdout.write(`  ok: ${polygon.length} pts (${points.length} samples)\n`);
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

  // Mirror to apps/web/public so the client can fetch them at runtime.
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
