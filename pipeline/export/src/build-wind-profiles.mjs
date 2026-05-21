/**
 * Extract a normalized 2D side-profile silhouette polygon from each GLB in
 * the catalog. We read the GLB binary chunks directly (positions + indices),
 * project all vertices onto the XY plane (assuming +X is forward, +Y is up
 * in the F1 GLB convention), and run a marching-squares pass over a coarse
 * occupancy grid to extract a single closed outline polygon. The polygon is
 * normalized to fit the wind tunnel canvas's [0..1] x [0..1] frame.
 *
 * Output: data/wind-profiles/<constructor>.json
 *
 *   {
 *     constructor, constructorSlug, source: <glb path>,
 *     polygon: [[x0,y0], [x1,y1], ...],     // normalized [0,1]
 *     bbox: { minX, maxX, minY, maxY },
 *   }
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const GRID_NX = 256;
const GRID_NY = 96;

function parseGlb(buffer) {
  const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = dataView.getUint32(0, true);
  if (magic !== 0x46546c67) {
    throw new Error("Not a GLB: missing magic 'glTF'");
  }
  const version = dataView.getUint32(4, true);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version}`);
  }
  const length = dataView.getUint32(8, true);

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < length) {
    const chunkLength = dataView.getUint32(offset, true);
    const chunkType = dataView.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkType === 0x4e4f534a) {
      const jsonBytes = buffer.subarray(chunkStart, chunkEnd);
      json = JSON.parse(new TextDecoder().decode(jsonBytes));
    } else if (chunkType === 0x004e4942) {
      bin = buffer.subarray(chunkStart, chunkEnd);
    }
    offset = chunkEnd;
  }

  if (!json || !bin) {
    throw new Error("GLB missing JSON or BIN chunk");
  }
  return { json, bin };
}

const COMPONENT_BYTES = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const TYPE_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

function readAccessor(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  if (typeof accessor.bufferView !== "number") {
    // Sparse / generated accessor with no buffer view; return zeros.
    const components = TYPE_COMPONENTS[accessor.type] ?? 1;
    return { array: new Array(accessor.count * components).fill(0), components, count: accessor.count };
  }
  const bufferView = json.bufferViews[accessor.bufferView];
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const components = TYPE_COMPONENTS[accessor.type];
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  const count = accessor.count;
  const stride = bufferView.byteStride ?? components * componentBytes;
  const view = bin.buffer.slice(bin.byteOffset + byteOffset, bin.byteOffset + byteOffset + stride * count);
  const dv = new DataView(view);
  const out = new Array(count * components);
  for (let i = 0; i < count; i += 1) {
    for (let c = 0; c < components; c += 1) {
      const o = i * stride + c * componentBytes;
      let value;
      switch (accessor.componentType) {
        case 5126: value = dv.getFloat32(o, true); break;
        case 5125: value = dv.getUint32(o, true); break;
        case 5123: value = dv.getUint16(o, true); break;
        case 5122: value = dv.getInt16(o, true); break;
        case 5121: value = dv.getUint8(o); break;
        case 5120: value = dv.getInt8(o); break;
        default: value = 0;
      }
      out[i * components + c] = value;
    }
  }
  return { array: out, components, count };
}

function multiplyVec3Mat4(v, m, out) {
  const [x, y, z] = v;
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}

function composeFromTRS(node) {
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const xx = r[0] * r[0];
  const yy = r[1] * r[1];
  const zz = r[2] * r[2];
  const xy = r[0] * r[1];
  const zw = r[2] * r[3];
  const zx = r[2] * r[0];
  const yw = r[1] * r[3];
  const yz = r[1] * r[2];
  const xw = r[0] * r[3];
  const m = new Float64Array(16);
  m[0] = (1 - 2 * (yy + zz)) * s[0];
  m[1] = (2 * (xy + zw)) * s[0];
  m[2] = (2 * (zx - yw)) * s[0];
  m[3] = 0;
  m[4] = (2 * (xy - zw)) * s[1];
  m[5] = (1 - 2 * (zz + xx)) * s[1];
  m[6] = (2 * (yz + xw)) * s[1];
  m[7] = 0;
  m[8] = (2 * (zx + yw)) * s[2];
  m[9] = (2 * (yz - xw)) * s[2];
  m[10] = (1 - 2 * (yy + xx)) * s[2];
  m[11] = 0;
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  m[15] = 1;
  return m;
}

function multiplyMat4(a, b) {
  const out = new Float64Array(16);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[k * 4 + r] * b[c * 4 + k];
      }
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return new Float64Array(node.matrix);
  }
  return composeFromTRS(node);
}

function gatherWorldPositions(json, bin) {
  const points = [];
  const scene = json.scenes[json.scene ?? 0];
  const meshes = json.meshes;
  const nodes = json.nodes;
  const stack = [];
  for (const root of scene.nodes) stack.push({ index: root, parent: null });
  const matrixCache = new Map();

  function getWorldMatrix(index, parentMatrix) {
    if (matrixCache.has(index)) return matrixCache.get(index);
    const local = nodeMatrix(nodes[index]);
    const world = parentMatrix ? multiplyMat4(parentMatrix, local) : local;
    matrixCache.set(index, world);
    return world;
  }

  while (stack.length) {
    const { index, parent } = stack.pop();
    const node = nodes[index];
    const world = getWorldMatrix(index, parent);
    if (typeof node.mesh === "number") {
      const mesh = meshes[node.mesh];
      for (const primitive of mesh.primitives) {
        const posAccessor = primitive.attributes?.POSITION;
        if (typeof posAccessor !== "number") continue;
        const accessor = readAccessor(json, bin, posAccessor);
        const xyz = [0, 0, 0];
        const out = [0, 0, 0];
        for (let i = 0; i < accessor.count; i += 1) {
          xyz[0] = accessor.array[i * 3];
          xyz[1] = accessor.array[i * 3 + 1];
          xyz[2] = accessor.array[i * 3 + 2];
          multiplyVec3Mat4(xyz, world, out);
          points.push([out[0], out[1], out[2]]);
        }
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        stack.push({ index: child, parent: world });
      }
    }
  }

  return points;
}

function projectToSideProfile(points) {
  // F1 GLBs in this catalog use +Z = forward, +Y = up in most exports.
  // We'll auto-detect: the longest axis becomes "forward" (X), the next longest
  // perpendicular axis becomes "up" (Y) so the silhouette renders side-on.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
    if (p[2] < minZ) minZ = p[2];
    if (p[2] > maxZ) maxZ = p[2];
  }
  const ranges = [
    { axis: 0, range: maxX - minX, min: minX, max: maxX },
    { axis: 1, range: maxY - minY, min: minY, max: maxY },
    { axis: 2, range: maxZ - minZ, min: minZ, max: maxZ },
  ];
  ranges.sort((a, b) => b.range - a.range);
  const fwdAxis = ranges[0].axis;
  // up axis = the smallest range axis (height is usually shortest)
  ranges.sort((a, b) => a.range - b.range);
  const upAxis = ranges[0].axis;
  // Side projection: use forward as X, up as Y.
  return { fwdAxis, upAxis };
}

function buildOccupancyGrid(points, fwdAxis, upAxis) {
  const grid = new Uint8Array(GRID_NX * GRID_NY);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    const x = p[fwdAxis];
    const y = p[upAxis];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const rx = maxX - minX || 1;
  const ry = maxY - minY || 1;
  for (const p of points) {
    const nx = (p[fwdAxis] - minX) / rx;
    const ny = (p[upAxis] - minY) / ry;
    const gx = Math.max(0, Math.min(GRID_NX - 1, Math.floor(nx * GRID_NX)));
    const gy = Math.max(0, Math.min(GRID_NY - 1, Math.floor((1 - ny) * GRID_NY))); // flip Y so up is +y in canvas
    grid[gy * GRID_NX + gx] = 1;
  }
  // Dilate slightly so the silhouette closes up.
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
      if (neighbors >= 2) dilated[y * GRID_NX + x] = 1;
    }
  }
  return dilated;
}

function traceOutline(grid) {
  // For each x column, find the topmost and bottommost occupied row.
  // Walk top across columns left->right, then bottom right->left, to form a
  // closed silhouette polygon.
  const top = new Array(GRID_NX).fill(-1);
  const bottom = new Array(GRID_NX).fill(-1);
  for (let x = 0; x < GRID_NX; x += 1) {
    for (let y = 0; y < GRID_NY; y += 1) {
      if (grid[y * GRID_NX + x]) {
        if (top[x] === -1) top[x] = y;
        bottom[x] = y;
      }
    }
  }
  const polygon = [];
  for (let x = 0; x < GRID_NX; x += 1) {
    if (top[x] !== -1) polygon.push([x, top[x]]);
  }
  for (let x = GRID_NX - 1; x >= 0; x -= 1) {
    if (bottom[x] !== -1) polygon.push([x, bottom[x]]);
  }
  return polygon;
}

function simplifyPolygon(polygon, tolerance = 1.0) {
  if (polygon.length < 4) return polygon;
  // Ramer-Douglas-Peucker simplification.
  const sqTolerance = tolerance * tolerance;
  function sqSegDist(p, p1, p2) {
    let x = p1[0];
    let y = p1[1];
    let dx = p2[0] - x;
    let dy = p2[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = p2[0];
        y = p2[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  }
  function dpStep(points, first, last, simplified) {
    let maxDist = sqTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const dist = sqSegDist(points[i], points[first], points[last]);
      if (dist > maxDist) {
        index = i;
        maxDist = dist;
      }
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

function normalizePolygon(polygon) {
  return polygon.map(([x, y]) => [x / GRID_NX, y / GRID_NY]);
}

async function processGlb(catalogEntry, glbPath, outDir) {
  const buffer = await readFile(glbPath);
  const { json, bin } = parseGlb(buffer);
  const points = gatherWorldPositions(json, bin);
  if (!points.length) {
    process.stdout.write(`  skip ${catalogEntry.constructorSlug}: no positions\n`);
    return false;
  }
  const { fwdAxis, upAxis } = projectToSideProfile(points);
  const grid = buildOccupancyGrid(points, fwdAxis, upAxis);
  const polygon = simplifyPolygon(traceOutline(grid), 1.5);
  if (polygon.length < 16) {
    process.stdout.write(`  skip ${catalogEntry.constructorSlug}: polygon too small (${polygon.length})\n`);
    return false;
  }
  const normalized = normalizePolygon(polygon);
  const payload = {
    constructor: catalogEntry.constructor,
    constructorSlug: catalogEntry.constructorSlug,
    source: path.relative(root, glbPath).replace(/\\/g, "/"),
    polygon: normalized,
    bbox: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    pointCount: normalized.length,
    samples: points.length,
    extractedAt: new Date().toISOString(),
  };
  const outPath = path.join(outDir, `${catalogEntry.constructorSlug}.json`);
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  process.stdout.write(`  ok ${catalogEntry.constructorSlug}: ${normalized.length} pts (${points.length} samples)\n`);
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
    process.stdout.write(`Processing ${entry.constructor} (${entry.constructorSlug}) ...\n`);
    const glbPath = path.join(root, "apps", "web", "public", entry.file.replace(/^\//, ""));
    try {
      const success = await processGlb(entry, glbPath, outDir);
      if (success) ok += 1;
      else fail += 1;
    } catch (error) {
      fail += 1;
      process.stdout.write(`  FAIL: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  // Mirror to public for client fetch
  const publicDir = path.join(root, "apps", "web", "public", "data", "wind-profiles");
  await mkdir(publicDir, { recursive: true });
  const fs = await import("node:fs/promises");
  const entries = await fs.readdir(outDir);
  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    const src = path.join(outDir, file);
    const dst = path.join(publicDir, file);
    await fs.copyFile(src, dst);
  }

  process.stdout.write(`\nDone. ok=${ok} fail=${fail}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
