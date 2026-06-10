/**
 * Curated SVG -> wind-tunnel silhouette manifest (2026-06-10).
 *
 * Reads hand-authored side-profile SVGs from assets/silhouettes/<slug>.svg
 * and emits the polyline manifest consumed by the wind tunnel's "svg"
 * silhouette mode (apps/web fetches /data/silhouettes/<slug>.json).
 *
 * SVG authoring contract:
 * - viewBox required on the root <svg>.
 * - <path id="body" d="... Z"> closed outline (required).
 * - Optional detail paths by id: halo, frontWing, frontWingFlap, rearWing,
 *   beamWing, floor, stripe, sidepod.
 * - Optional wheel circles: <circle id="wheel-front" .../> and
 *   <circle id="wheel-rear" .../>.
 *
 * Supported path commands: M/m, L/l, H/h, V/v, C/c, S/s, Q/q, T/t, Z/z.
 * Beziers are flattened at 24 samples per segment, then the body outline is
 * resampled to ~100 evenly spaced points by arc length.
 *
 * Output (2-space JSON) written to BOTH:
 *   data/silhouettes/<slug>.json
 *   apps/web/public/data/silhouettes/<slug>.json
 *
 * Usage:
 *   node pipeline/export/src/build-silhouette-from-svg.mjs           # all svgs
 *   node pipeline/export/src/build-silhouette-from-svg.mjs --slug=mclaren
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ASSETS_DIR = path.join(root, "assets", "silhouettes");
const OUT_DIRS = [
  path.join(root, "data", "silhouettes"),
  path.join(root, "apps", "web", "public", "data", "silhouettes"),
];

const BEZIER_SAMPLES = 24;
const BODY_TARGET_POINTS = 100;
const MIN_POINTS = 16;
const MIN_ASPECT = 2.0;
const MAX_ASPECT = 4.0;
const CLOSE_EPSILON = 0.02;

const DETAIL_IDS = ["halo", "frontWing", "frontWingFlap", "rearWing", "beamWing", "floor", "stripe", "sidepod"];

function fail(message) {
  throw new Error(message);
}

// --- Minimal SVG parsing (regex-based; the authored files are plain). ---

function parseViewBox(svgText) {
  const match = svgText.match(/viewBox\s*=\s*"([^"]+)"/);
  if (!match) fail("SVG is missing a viewBox attribute");
  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    fail(`Unparseable viewBox: "${match[1]}"`);
  }
  const [minX, minY, width, height] = parts;
  if (width <= 0 || height <= 0) fail("viewBox width/height must be positive");
  return { minX, minY, width, height };
}

function extractPathById(svgText, id) {
  const tagMatch = svgText.match(new RegExp(`<path\\b[^>]*\\bid\\s*=\\s*"${id}"[^>]*>`));
  if (!tagMatch) return null;
  const dMatch = tagMatch[0].match(/\bd\s*=\s*"([^"]+)"/);
  if (!dMatch) fail(`<path id="${id}"> has no d attribute`);
  return dMatch[1];
}

function extractCircleById(svgText, id) {
  const tagMatch = svgText.match(new RegExp(`<circle\\b[^>]*\\bid\\s*=\\s*"${id}"[^>]*>`));
  if (!tagMatch) return null;
  const tag = tagMatch[0];
  const read = (name) => {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`));
    return m ? Number(m[1]) : NaN;
  };
  const cx = read("cx");
  const cy = read("cy");
  const r = read("r");
  if (![cx, cy, r].every(Number.isFinite)) fail(`<circle id="${id}"> needs numeric cx/cy/r`);
  return { cx, cy, r };
}

// --- Path data sampling. ---

function tokenizePathData(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens) fail("Empty or unparseable path data");
  return tokens;
}

function samplePathData(d) {
  const tokens = tokenizePathData(d);
  const points = [];
  let command = null;
  let index = 0;
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let prevCtrlX = null;
  let prevCtrlY = null;
  let prevCommand = null;

  const readNumber = () => {
    const token = tokens[index];
    index += 1;
    const value = Number(token);
    if (!Number.isFinite(value)) fail(`Expected number in path data, got "${token}"`);
    return value;
  };

  const push = (x, y) => {
    points.push([x, y]);
  };

  const cubicTo = (c1x, c1y, c2x, c2y, x, y) => {
    for (let i = 1; i <= BEZIER_SAMPLES; i += 1) {
      const t = i / BEZIER_SAMPLES;
      const mt = 1 - t;
      const px = mt * mt * mt * curX + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * x;
      const py = mt * mt * mt * curY + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * y;
      push(px, py);
    }
    prevCtrlX = c2x;
    prevCtrlY = c2y;
    curX = x;
    curY = y;
  };

  const quadTo = (cx, cy, x, y) => {
    for (let i = 1; i <= BEZIER_SAMPLES; i += 1) {
      const t = i / BEZIER_SAMPLES;
      const mt = 1 - t;
      const px = mt * mt * curX + 2 * mt * t * cx + t * t * x;
      const py = mt * mt * curY + 2 * mt * t * cy + t * t * y;
      push(px, py);
    }
    prevCtrlX = cx;
    prevCtrlY = cy;
    curX = x;
    curY = y;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[MmLlHhVvCcSsQqTtZz]$/.test(token)) {
      command = token;
      index += 1;
    } else if (command === null) {
      fail("Path data must start with a command letter");
    }

    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();

    switch (upper) {
      case "M": {
        const x = readNumber();
        const y = readNumber();
        curX = relative ? curX + x : x;
        curY = relative ? curY + y : y;
        startX = curX;
        startY = curY;
        push(curX, curY);
        // Subsequent coordinate pairs after M are implicit lineto.
        command = relative ? "l" : "L";
        break;
      }
      case "L": {
        const x = readNumber();
        const y = readNumber();
        curX = relative ? curX + x : x;
        curY = relative ? curY + y : y;
        push(curX, curY);
        break;
      }
      case "H": {
        const x = readNumber();
        curX = relative ? curX + x : x;
        push(curX, curY);
        break;
      }
      case "V": {
        const y = readNumber();
        curY = relative ? curY + y : y;
        push(curX, curY);
        break;
      }
      case "C": {
        const c1x = relative ? curX + readNumber() : readNumber();
        const c1y = relative ? curY + readNumber() : readNumber();
        const c2x = relative ? curX + readNumber() : readNumber();
        const c2y = relative ? curY + readNumber() : readNumber();
        const x = relative ? curX + readNumber() : readNumber();
        const y = relative ? curY + readNumber() : readNumber();
        cubicTo(c1x, c1y, c2x, c2y, x, y);
        break;
      }
      case "S": {
        const reflect = prevCommand && ["C", "S"].includes(prevCommand.toUpperCase()) && prevCtrlX !== null;
        const c1x = reflect ? 2 * curX - prevCtrlX : curX;
        const c1y = reflect ? 2 * curY - prevCtrlY : curY;
        const c2x = relative ? curX + readNumber() : readNumber();
        const c2y = relative ? curY + readNumber() : readNumber();
        const x = relative ? curX + readNumber() : readNumber();
        const y = relative ? curY + readNumber() : readNumber();
        cubicTo(c1x, c1y, c2x, c2y, x, y);
        break;
      }
      case "Q": {
        const cx = relative ? curX + readNumber() : readNumber();
        const cy = relative ? curY + readNumber() : readNumber();
        const x = relative ? curX + readNumber() : readNumber();
        const y = relative ? curY + readNumber() : readNumber();
        quadTo(cx, cy, x, y);
        break;
      }
      case "T": {
        const reflect = prevCommand && ["Q", "T"].includes(prevCommand.toUpperCase()) && prevCtrlX !== null;
        const cx = reflect ? 2 * curX - prevCtrlX : curX;
        const cy = reflect ? 2 * curY - prevCtrlY : curY;
        const x = relative ? curX + readNumber() : readNumber();
        const y = relative ? curY + readNumber() : readNumber();
        quadTo(cx, cy, x, y);
        break;
      }
      case "Z": {
        curX = startX;
        curY = startY;
        push(curX, curY);
        break;
      }
      default:
        fail(`Unsupported path command "${command}"`);
    }

    if (!["C", "S", "Q", "T"].includes(upper)) {
      prevCtrlX = null;
      prevCtrlY = null;
    }
    prevCommand = command;
  }

  if (points.length < 2) fail("Path produced fewer than 2 points");
  return points;
}

// --- Geometry helpers. ---

function dedupeConsecutive(points, epsilon = 1e-6) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const [px, py] = out[out.length - 1];
    const [x, y] = points[i];
    if (Math.abs(x - px) > epsilon || Math.abs(y - py) > epsilon) out.push(points[i]);
  }
  return out;
}

function resampleClosedByArcLength(points, targetCount) {
  // Treat as a closed loop; drop a duplicated closing point if present.
  let loop = points;
  const first = loop[0];
  const last = loop[loop.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) {
    loop = loop.slice(0, -1);
  }
  const n = loop.length;
  const cumulative = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % n];
    cumulative[i + 1] = cumulative[i] + Math.hypot(x2 - x1, y2 - y1);
  }
  const total = cumulative[n];
  if (total <= 0) fail("Body outline has zero length");
  const out = [];
  let seg = 0;
  for (let i = 0; i < targetCount; i += 1) {
    const target = (i / targetCount) * total;
    while (seg < n - 1 && cumulative[seg + 1] < target) seg += 1;
    const segLen = cumulative[seg + 1] - cumulative[seg] || 1;
    const t = (target - cumulative[seg]) / segLen;
    const [x1, y1] = loop[seg];
    const [x2, y2] = loop[(seg + 1) % n];
    out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
  }
  return out;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

// --- Per-file build. ---

async function buildOne(svgPath, slug) {
  const svgText = await readFile(svgPath, "utf8");
  const viewBox = parseViewBox(svgText);

  const normalize = ([x, y]) => [
    (x - viewBox.minX) / viewBox.width,
    (y - viewBox.minY) / viewBox.height,
  ];

  const bodyData = extractPathById(svgText, "body");
  if (!bodyData) fail(`${slug}.svg has no <path id="body">`);

  let body = dedupeConsecutive(samplePathData(bodyData).map(normalize));

  // Closed-ish check (normalized space), then force closure via resampling.
  const gap = Math.hypot(
    body[0][0] - body[body.length - 1][0],
    body[0][1] - body[body.length - 1][1],
  );
  if (gap > CLOSE_EPSILON) {
    fail(`${slug}.svg body outline is not closed (gap ${gap.toFixed(4)} > ${CLOSE_EPSILON})`);
  }

  body = resampleClosedByArcLength(body, BODY_TARGET_POINTS);
  if (body.length < MIN_POINTS) {
    fail(`${slug}.svg body resampled to ${body.length} points (< ${MIN_POINTS})`);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of body) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX <= 0 || spanY <= 0) fail(`${slug}.svg body bbox is degenerate`);
  const aspect = (spanX * viewBox.width) / (spanY * viewBox.height);
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) {
    fail(`${slug}.svg body aspect ${aspect.toFixed(2)} outside ${MIN_ASPECT}..${MAX_ASPECT}`);
  }

  const details = [];
  for (const id of DETAIL_IDS) {
    const data = extractPathById(svgText, id);
    if (!data) continue;
    const sampled = dedupeConsecutive(samplePathData(data).map(normalize));
    // Detail polylines stay light: resample long bezier chains down.
    const maxDetailPoints = 24;
    const step = Math.max(1, Math.floor(sampled.length / maxDetailPoints));
    const reduced = sampled.filter((_, i) => i % step === 0 || i === sampled.length - 1);
    // frontWingFlap renders with the same style as frontWing.
    const kind = id === "frontWingFlap" ? "frontWing" : id;
    details.push({ kind, points: reduced.map(([x, y]) => [round4(x), round4(y)]) });
  }

  const wheelArches = [];
  for (const id of ["wheel-front", "wheel-rear"]) {
    const circle = extractCircleById(svgText, id);
    if (!circle) continue;
    wheelArches.push({
      cx: round4((circle.cx - viewBox.minX) / viewBox.width),
      cy: round4((circle.cy - viewBox.minY) / viewBox.height),
      r: round4(circle.r / viewBox.height),
    });
  }

  const manifest = {
    constructorSlug: slug,
    source: "curated-side-profile",
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

  return manifest;
}

// --- Entry point. ---

async function main() {
  const slugArg = process.argv.find((arg) => arg.startsWith("--slug="));
  const onlySlug = slugArg ? slugArg.split("=")[1] : null;

  let files;
  try {
    files = (await readdir(ASSETS_DIR)).filter((file) => file.endsWith(".svg"));
  } catch {
    fail(`Assets directory not found: ${ASSETS_DIR}`);
  }
  if (onlySlug) files = files.filter((file) => file === `${onlySlug}.svg`);
  if (!files.length) {
    fail(onlySlug ? `No SVG found for slug "${onlySlug}" in ${ASSETS_DIR}` : `No SVGs in ${ASSETS_DIR}`);
  }

  for (const file of files) {
    const slug = file.replace(/\.svg$/, "");
    const manifest = await buildOne(path.join(ASSETS_DIR, file), slug);
    console.log(
      `built ${slug}: ${manifest.pointCount} pts, aspect ${manifest.aspect}, ` +
      `${manifest.wheelArches.length} wheels, ${manifest.details.length} details`,
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
