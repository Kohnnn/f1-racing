/**
 * Team art generator (2026-05-23).
 *
 * Generates clean letter-mark SVG logos for every team in
 * data/art/teams.json and writes them to apps/web/public/images/teams/<slug>/.
 *
 * Strategy:
 * - Primary source for production art is formula1.com/en/teams. Per the
 *   project's content policy we do not fetch and bundle copyrighted F1 brand
 *   assets at build time; the upstream URL is recorded in
 *   docs/art-attributions.md so a human can drop the licensed asset over
 *   the generated letter-mark when needed.
 * - This script produces a dependable letter-mark in the team's brand
 *   colour so the app always has a visual identity per team without
 *   hotlinking copyrighted SVG.
 *
 * Output:
 *   apps/web/public/images/teams/<slug>/logo.svg     (square 240x240)
 *   apps/web/public/images/teams/<slug>/mark.svg     (square 64x64 favicon)
 *   apps/web/public/images/teams/<slug>/stripe.svg   (8x40 team-color tab)
 *
 * Flags:
 *   --force      regenerate even when files already exist
 *   --slug=...   only process the matching team slug
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

function tinted(hex, alpha) {
  // Convert #RRGGBB to rgba()
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function logoSvg(team) {
  const letters = team.letterMark || team.shortName.slice(0, 3).toUpperCase();
  const fontSize = letters.length <= 2 ? 110 : letters.length === 3 ? 86 : 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="${escapeXml(team.displayName)} logo">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${escapeXml(team.baseColor)}"/>
      <stop offset="100%" stop-color="${tinted(team.baseColor, 0.62)}"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="228" height="228" rx="34" fill="url(#bg)"/>
  <rect x="6" y="6" width="228" height="228" rx="34" fill="none" stroke="${escapeXml(team.accentColor || "#ffffff")}" stroke-opacity="0.55" stroke-width="3"/>
  <text x="120" y="135" text-anchor="middle" dominant-baseline="middle"
        font-family="Aptos, 'Segoe UI', system-ui, sans-serif"
        font-weight="900" font-size="${fontSize}" fill="#ffffff" letter-spacing="-2">${escapeXml(letters)}</text>
  <text x="120" y="200" text-anchor="middle" dominant-baseline="middle"
        font-family="Aptos, 'Segoe UI', system-ui, sans-serif"
        font-weight="700" font-size="20" fill="rgba(255,255,255,0.78)" letter-spacing="2">${escapeXml(team.shortName.toUpperCase())}</text>
</svg>
`;
}

function markSvg(team) {
  const letters = team.letterMark || team.shortName.slice(0, 3).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escapeXml(team.shortName)} mark">
  <rect x="2" y="2" width="60" height="60" rx="12" fill="${escapeXml(team.baseColor)}"/>
  <text x="32" y="40" text-anchor="middle" font-family="Aptos, system-ui, sans-serif" font-weight="900" font-size="${letters.length <= 2 ? 30 : 22}" fill="#ffffff">${escapeXml(letters)}</text>
</svg>
`;
}

function stripeSvg(team) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 40" role="img" aria-label="${escapeXml(team.shortName)} colour stripe">
  <rect width="8" height="40" fill="${escapeXml(team.baseColor)}"/>
  <rect y="32" width="8" height="8" fill="${escapeXml(team.accentColor || "#ffffff")}" fill-opacity="0.65"/>
</svg>
`;
}

async function processTeam(team, flags, outputs) {
  const dir = path.join(root, "apps", "web", "public", "images", "teams", team.slug);
  await mkdir(dir, { recursive: true });

  const targets = [
    { name: "logo.svg", content: logoSvg(team) },
    { name: "mark.svg", content: markSvg(team) },
    { name: "stripe.svg", content: stripeSvg(team) },
  ];

  for (const target of targets) {
    const filePath = path.join(dir, target.name);
    if (!flags.force && await exists(filePath)) {
      outputs.push({ slug: team.slug, file: target.name, action: "skip" });
      continue;
    }
    await writeFile(filePath, target.content, "utf-8");
    outputs.push({ slug: team.slug, file: target.name, action: "wrote" });
  }
}

async function main() {
  const flags = parseFlags(process.argv);
  const manifestPath = path.join(root, "apps", "web", "src", "data", "art", "teams.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
  const teams = flags.slug
    ? manifest.teams.filter((t) => t.slug === flags.slug)
    : manifest.teams;
  if (!teams.length) {
    process.stderr.write(`No teams matched slug=${flags.slug}\n`);
    process.exit(1);
  }
  const outputs = [];
  for (const team of teams) {
    await processTeam(team, flags, outputs);
  }
  const wrote = outputs.filter((o) => o.action === "wrote").length;
  const skip = outputs.filter((o) => o.action === "skip").length;
  process.stdout.write(`Team art: wrote=${wrote}, skipped=${skip}, force=${flags.force}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
