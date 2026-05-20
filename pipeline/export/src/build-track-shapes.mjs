/**
 * Build canonical track-shape JSON files from the MultiViewer circuits API.
 *
 * For each entry below we fetch:
 *   https://api.multiviewer.app/api/v1/circuits/{circuitKey}/2025
 *
 * MultiViewer is the data source FastF1 uses for its `circuit_info` (rotation,
 * corners, marshal sectors). The same endpoint also gives us the full
 * centerline polyline and inner/outer track edges. We normalize the centerline
 * to centered coordinates (mean=0) at native scale and emit it for our own
 * canvas renderer.
 *
 * Output schema:
 *   {
 *     trackId: string,
 *     circuitKey: number,
 *     name: string,
 *     country: string,
 *     rotationDeg: number,
 *     centerline: [number, number][],       // centered, native units
 *     corners: [{ number, letter, angleDeg, distance }],
 *     drsZones: [{ from, to }],             // along-track distance
 *     pitEntryDistance: number | null,
 *     pitExitDistance: number | null,
 *     length: number,                        // along-track length
 *     source: "multiviewer.app"
 *   }
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const CIRCUITS = [
  // Phase A - first 6 priority circuits
  { trackId: "melbourne",            aliases: ["albert-park"],              circuitKey: 10,  year: 2025 },
  { trackId: "yas-marina-circuit",   aliases: ["yas-marina", "abu-dhabi"],  circuitKey: 70,  year: 2025 },
  { trackId: "spa",                  aliases: ["spa-francorchamps"],        circuitKey: 7,   year: 2025 },
  { trackId: "monaco",               aliases: [],                            circuitKey: 22,  year: 2025 },
  { trackId: "silverstone",          aliases: [],                            circuitKey: 2,   year: 2025 },
  { trackId: "suzuka",               aliases: [],                            circuitKey: 46,  year: 2025 },

  // Scaled out: every other circuit covered by current builders
  { trackId: "monza",                aliases: [],                            circuitKey: 39,  year: 2025 },
  { trackId: "interlagos",           aliases: ["sao-paulo"],                circuitKey: 14,  year: 2025 },
  { trackId: "barcelona",            aliases: ["catalunya"],                circuitKey: 15,  year: 2025 },
  { trackId: "spielberg",            aliases: ["red-bull-ring"],            circuitKey: 19,  year: 2025 },
  { trackId: "imola",                aliases: ["emilia-romagna"],           circuitKey: 6,   year: 2025 },
  { trackId: "budapest",             aliases: ["hungaroring"],              circuitKey: 4,   year: 2025 },
  { trackId: "austin",               aliases: ["cota"],                      circuitKey: 9,   year: 2025 },
  { trackId: "shanghai",             aliases: ["china"],                    circuitKey: 49,  year: 2025 },
  { trackId: "zandvoort",            aliases: [],                            circuitKey: 55,  year: 2025 },
  { trackId: "singapore",            aliases: ["marina-bay"],               circuitKey: 61,  year: 2025 },
  { trackId: "sakhir",               aliases: ["bahrain"],                  circuitKey: 63,  year: 2025 },
  { trackId: "mexico",               aliases: ["autodromo"],                circuitKey: 65,  year: 2025 },
  { trackId: "baku",                 aliases: ["azerbaijan"],               circuitKey: 144, year: 2025 },
  { trackId: "jeddah",               aliases: ["saudi-arabian"],            circuitKey: 149, year: 2025 },
  { trackId: "miami",                aliases: [],                            circuitKey: 151, year: 2025 },
  { trackId: "lasvegas",             aliases: ["las-vegas"],                circuitKey: 152, year: 2025 },
  { trackId: "lusail",               aliases: ["qatar"],                    circuitKey: 150, year: 2025 },
  { trackId: "montreal",             aliases: ["canada"],                   circuitKey: 23,  year: 2025 },
];

function centeredAround(points) {
  // Centers the polyline around the bbox midpoint.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map(([x, y]) => [x - cx, y - cy]);
}

function rotated(points, deg) {
  if (!deg) return points;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
}

function alongTrackLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "f1-racing-app/1.0 (track-shapes builder)",
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function normalizePayload(circuit, raw) {
  // MultiViewer returns the canonical centerline polyline as parallel x[] / y[] arrays.
  const xs = raw.x ?? [];
  const ys = raw.y ?? [];
  let centerlinePoints = [];
  if (Array.isArray(xs) && Array.isArray(ys) && xs.length === ys.length && xs.length >= 32) {
    for (let index = 0; index < xs.length; index += 1) {
      centerlinePoints.push([Number(xs[index]), Number(ys[index])]);
    }
  }

  // Some older payloads expose a candidateLap with telemetry instead. Use it as a backup.
  if (!centerlinePoints.length && raw.candidateLap) {
    const cands = raw.candidateLap?.x && raw.candidateLap?.y && raw.candidateLap.x.length === raw.candidateLap.y.length
      ? raw.candidateLap
      : null;
    if (cands) {
      for (let index = 0; index < cands.x.length; index += 1) {
        centerlinePoints.push([Number(cands.x[index]), Number(cands.y[index])]);
      }
    }
  }

  // Rotation lives at top level. We rotate the polyline so the JSON file matches the
  // broadcast orientation; downstream renderers do not need to apply any extra rotation.
  const rotationDeg = Number(raw.rotation ?? 0);

  // Bring to bbox-centered, then apply the negative rotation so the canonical shape
  // already matches broadcast orientation when read by the canvas renderer.
  const centered = centeredAround(centerlinePoints);
  const rotatedPoints = rotated(centered, -rotationDeg);

  // Corner table: distance is offered in MultiViewer's `trackPosition` (cumulative meters).
  const corners = (raw.corners ?? []).map((c) => ({
    number: Number(c.number ?? 0),
    letter: c.letter ?? "",
    angleDeg: Number(c.angle ?? 0),
    trackPosition: c.trackPosition ?? null,
  }));

  return {
    trackId: circuit.trackId,
    aliases: circuit.aliases,
    circuitKey: circuit.circuitKey,
    name: raw.shortName ?? raw.location ?? circuit.trackId,
    country: raw.countryName ?? raw.country ?? "",
    rotationDeg,
    centerline: rotatedPoints,
    corners,
    drsZones: (raw.drsZones ?? []).map((z) => ({ from: Number(z[0]), to: Number(z[1]) })),
    pitEntryDistance: raw.pitEntry ? Number(raw.pitEntry.trackPosition ?? 0) : null,
    pitExitDistance: raw.pitExit ? Number(raw.pitExit.trackPosition ?? 0) : null,
    length: alongTrackLength(rotatedPoints),
    source: "multiviewer.app",
    fetchedAt: new Date().toISOString(),
  };
}

async function main() {
  const targetDir = path.join(root, "data", "track-shapes");
  await mkdir(targetDir, { recursive: true });

  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const circuit of CIRCUITS) {
    const url = `https://api.multiviewer.app/api/v1/circuits/${circuit.circuitKey}/${circuit.year}`;
    process.stdout.write(`Fetching ${circuit.trackId} (${circuit.circuitKey}) ... `);
    try {
      const raw = await fetchJson(url);
      const payload = normalizePayload(circuit, raw);
      if (payload.centerline.length < 32) {
        process.stdout.write(`skip (centerline too short: ${payload.centerline.length})\n`);
        skipCount += 1;
        continue;
      }
      const targetPath = path.join(targetDir, `${circuit.trackId}.json`);
      await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
      process.stdout.write(`ok (${payload.centerline.length} points, ${payload.corners.length} corners)\n`);
      okCount += 1;
    } catch (error) {
      process.stdout.write(`FAIL: ${error instanceof Error ? error.message : error}\n`);
      failCount += 1;
    }
  }

  process.stdout.write(`\nDone. ok=${okCount} skip=${skipCount} fail=${failCount}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
