/**
 * Render each wind profile JSON as a small PNG snapshot for visual review.
 * Output: pipeline/export/wind-profile-snapshots/<slug>.png
 *
 * Pure SVG -> PNG via @resvg/resvg-js if available, else writes SVG only.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const profilesDir = path.join(root, "data", "wind-profiles");
const outDir = path.join(root, "pipeline", "export", "wind-profile-snapshots");

const W = 768;
const H = 288;

function buildSvg(profile) {
  const polygon = profile.polygon
    .map(([x, y]) => `${(x * W).toFixed(1)},${(y * H).toFixed(1)}`)
    .join(" ");
  const wheels = (profile.wheelArches || [])
    .map(({ cx, cy, r }) => `<circle cx="${(cx * W).toFixed(1)}" cy="${(cy * H).toFixed(1)}" r="${(r * H).toFixed(1)}" fill="none" stroke="#ff7a1a" stroke-width="2" stroke-dasharray="4 4" />`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0b0f18" />
  <g>
    <rect x="0" y="${H - 12}" width="${W}" height="12" fill="#222a36" />
    <polygon points="${polygon}" fill="rgba(247,250,255,0.9)" stroke="#ff7a1a" stroke-width="2" />
    ${wheels}
    <text x="14" y="22" fill="#9aa3b2" font-family="monospace" font-size="14">${profile.constructor} (${profile.constructorSlug}) — ${profile.pointCount} pts</text>
  </g>
</svg>`;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  let resvg = null;
  try {
    const mod = await import("@resvg/resvg-js");
    resvg = mod.Resvg;
  } catch {
    resvg = null;
  }
  const entries = await readdir(profilesDir);
  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    const profile = JSON.parse(await readFile(path.join(profilesDir, file), "utf-8"));
    const svg = buildSvg(profile);
    const base = profile.constructorSlug;
    await writeFile(path.join(outDir, `${base}.svg`), svg, "utf-8");
    if (resvg) {
      const r = new resvg(svg, { background: "#0b0f18" });
      const png = r.render().asPng();
      await writeFile(path.join(outDir, `${base}.png`), png);
      process.stdout.write(`  png ${base}\n`);
    } else {
      process.stdout.write(`  svg-only ${base}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
