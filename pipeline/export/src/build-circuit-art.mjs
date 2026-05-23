/**
 * Circuit art generator (2026-05-23).
 *
 * Renders track-outline SVG and PNG-style hero illustrations for every
 * circuit in data/art/circuits.json by reading the matching polyline at
 * data/track-shapes/<slug>.json. No external network calls -- all
 * imagery is derived from the locally owned polyline data.
 *
 * Output:
 *   apps/web/public/images/circuits/<slug>/map.svg   (clean outline)
 *   apps/web/public/images/circuits/<slug>/hero.svg  (heroic outline + GP label + length)
 *
 * The hero file is delivered as SVG instead of a rasterised PNG so we
 * avoid pulling node-canvas into the build chain. Consumers either
 * embed the SVG directly or treat it as `<img src="...svg">`.
 *
 * Flags:
 *   --force      regenerate even when files already exist
 *   --slug=...   only process the matching circuit slug
 */

import { mkdir, readFile, writeFile, access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function parseFlags(argv) {
  const flags = { force: false, slug: null };
  for (const a of argv.slice(2)) {
    if (a === "--force") flags.force = true;
    else if (a.startsWith("--slug=")) flags.slug = a.slice("--slug=".length);
  }
  return flags;
}

async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
}

function rotatePoint(p, rad) {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
}

function fitToBox(points, width, height, padding) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const sx = (width - padding * 2) / dx;
  const sy = (height - padding * 2) / dy;
  const scale = Math.min(sx, sy);
  const usedW = dx * scale;
  const usedH = dy * scale;
  const offsetX = (width - usedW) / 2;
  // Flip Y so polylines (positive y up in source) read upright on canvas.
  return points.map((p) => [
    offsetX + (p[0] - minX) * scale,
    height - (offsetX > 0 ? padding : padding) - (p[1] - minY) * scale + (height - usedH) / 2 - padding / 2,
  ]);
}

function buildPathD(points) {
  if (!points.length) return "";
  const parts = [];
  parts.push(`M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`);
  for (let i = 1; i < points.length; i += 1) {
    parts.push(`L ${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function mapSvg(circuit, points) {
  const w = 480;
  const h = 280;
  const padding = 26;
  const fitted = fitToBox(points, w, h, padding);
  const d = buildPathD(fitted);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(circuit.displayName)} outline">
  <rect width="${w}" height="${h}" fill="#0a0d13"/>
  <path d="${d}" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="rgba(255,122,26,0.6)" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
`;
}

function heroSvg(circuit, points) {
  const w = 1600;
  const h = 900;
  const padding = 96;
  const fitted = fitToBox(points, w, h, padding);
  const d = buildPathD(fitted);
  const lengthLabel = `${circuit.lengthKm.toFixed(3)} km`;
  const cornersLabel = `${circuit.corners} corners`;
  const firstGpLabel = `Since ${circuit.firstGp}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(circuit.displayName)} hero">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0f1a"/>
      <stop offset="100%" stop-color="#181b25"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.4" r="0.7">
      <stop offset="0%" stop-color="rgba(255,122,26,0.18)"/>
      <stop offset="100%" stop-color="rgba(255,122,26,0)"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <path d="${d}" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="rgba(255,122,26,0.85)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
  <g font-family="Aptos, 'Segoe UI', system-ui, sans-serif">
    <text x="80" y="140" font-size="44" font-weight="800" fill="rgba(255,255,255,0.5)" letter-spacing="6">${escapeXml(circuit.country)}</text>
    <text x="80" y="220" font-size="74" font-weight="900" fill="#ffffff">${escapeXml(circuit.grandPrix)}</text>
    <text x="80" y="270" font-size="34" font-weight="600" fill="rgba(255,255,255,0.7)">${escapeXml(circuit.displayName)}</text>
    <text x="80" y="${h - 100}" font-size="28" font-weight="700" fill="rgba(255,232,168,0.92)" letter-spacing="3">${escapeXml(lengthLabel.toUpperCase())}  ·  ${escapeXml(cornersLabel.toUpperCase())}  ·  ${escapeXml(firstGpLabel.toUpperCase())}</text>
  </g>
</svg>
`;
}

async function processCircuit(circuit, flags, outputs) {
  const trackShapePath = path.join(root, "data", "track-shapes", `${circuit.slug}.json`);
  if (!await exists(trackShapePath)) {
    outputs.push({ slug: circuit.slug, file: "(no track-shapes data)", action: "skip" });
    return;
  }
  const shape = JSON.parse(await readFile(trackShapePath, "utf-8"));
  const centerline = Array.isArray(shape.centerline) ? shape.centerline : null;
  if (!centerline || centerline.length < 8) {
    outputs.push({ slug: circuit.slug, file: "(no centerline)", action: "skip" });
    return;
  }
  // Apply circuit's own rotationDeg if present so the outline reads correctly.
  const rotationDeg = typeof shape.rotationDeg === "number" ? shape.rotationDeg : 0;
  const rad = (rotationDeg * Math.PI) / 180;
  const points = centerline.map((p) => rotatePoint([p[0], p[1]], rad));

  const dir = path.join(root, "apps", "web", "public", "images", "circuits", circuit.slug);
  await mkdir(dir, { recursive: true });
  const targets = [
    { name: "map.svg", content: mapSvg(circuit, points) },
    { name: "hero.svg", content: heroSvg(circuit, points) },
  ];
  for (const target of targets) {
    const filePath = path.join(dir, target.name);
    if (!flags.force && await exists(filePath)) {
      outputs.push({ slug: circuit.slug, file: target.name, action: "skip" });
      continue;
    }
    await writeFile(filePath, target.content, "utf-8");
    outputs.push({ slug: circuit.slug, file: target.name, action: "wrote" });
  }
}

async function main() {
  const flags = parseFlags(process.argv);
  const circuitsPath = path.join(root, "apps", "web", "src", "data", "art", "circuits.json");
  const manifest = JSON.parse(await readFile(circuitsPath, "utf-8"));
  const circuits = flags.slug
    ? manifest.circuits.filter((c) => c.slug === flags.slug)
    : manifest.circuits;
  if (!circuits.length) {
    process.stderr.write(`No circuits matched slug=${flags.slug}\n`);
    process.exit(1);
  }
  const outputs = [];
  for (const circuit of circuits) {
    await processCircuit(circuit, flags, outputs);
  }
  const wrote = outputs.filter((o) => o.action === "wrote").length;
  const skip = outputs.filter((o) => o.action === "skip").length;
  process.stdout.write(`Circuit art: wrote=${wrote}, skipped=${skip}, force=${flags.force}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
