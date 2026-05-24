/**
 * Re-encode driver portraits + team wiki-logo PNG/JPG to compressed WebP.
 *
 * - Driver portrait target: 240px wide center-cropped square, webp Q78.
 *   Output written next to input as <slug>.webp; original removed once
 *   the webp is in place (so leaderboard glyphs always pick up the small
 *   modern asset).
 * - Team wiki-logo target: max 480px on the long axis, transparent webp.
 *
 * Skips files that already have a webp sibling unless --force is passed.
 */

import { readdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function parseFlags(argv) {
  return { force: argv.includes("--force") };
}

async function compressDriver(file, flags) {
  const slug = path.basename(file).replace(/\.[a-z]+$/i, "");
  const dir = path.join(root, "apps", "web", "public", "images", "drivers");
  const inputPath = path.join(dir, file);
  const outputPath = path.join(dir, `${slug}.webp`);

  // If the source IS already the webp output, nothing to do.
  if (inputPath === outputPath) return { slug, action: "skip-already-webp" };

  // If a webp output already exists and we are not forcing, skip.
  try {
    await stat(outputPath);
    if (!flags.force) {
      return { slug, action: "skip-exists" };
    }
  } catch { /* file missing, that's the happy path */ }

  const original = await readFile(inputPath);
  // Center-crop to square at native, then resize to 240x240, encode webp.
  const meta = await sharp(original).metadata();
  const size = Math.min(meta.width || 0, meta.height || 0) || 240;
  const left = Math.floor(((meta.width || size) - size) / 2);
  const top = Math.floor(((meta.height || size) - size) / 2);
  const buffer = await sharp(original)
    .extract({ left, top, width: size, height: size })
    .resize(240, 240, { fit: "cover" })
    .webp({ quality: 78, effort: 4 })
    .toBuffer();
  await writeFile(outputPath, buffer);
  // Remove the heavy original (jpg / png).
  if (path.extname(inputPath).toLowerCase() !== ".webp") {
    await unlink(inputPath);
  }
  return { slug, action: "ok", bytes: buffer.length };
}

async function compressTeamLogo(file, flags) {
  const slug = path.basename(path.dirname(file));
  const inputPath = file;
  const outputPath = path.join(path.dirname(file), "wiki-logo.webp");
  if (inputPath === outputPath) return { slug, action: "skip-already-webp" };
  try {
    await stat(outputPath);
    if (!flags.force) return { slug, action: "skip-exists" };
  } catch { /* missing */ }
  const original = await readFile(inputPath);
  const meta = await sharp(original).metadata();
  const longest = Math.max(meta.width || 0, meta.height || 0);
  const target = Math.min(480, longest);
  const buffer = await sharp(original)
    .resize(target, target, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86, effort: 4 })
    .toBuffer();
  await writeFile(outputPath, buffer);
  if (path.extname(inputPath).toLowerCase() !== ".webp") {
    await unlink(inputPath);
  }
  return { slug, action: "ok", bytes: buffer.length };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  // Drivers.
  const driverDir = path.join(root, "apps", "web", "public", "images", "drivers");
  const driverFiles = (await readdir(driverDir)).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const driverResults = [];
  for (const file of driverFiles) {
    try {
      driverResults.push(await compressDriver(file, flags));
    } catch (error) {
      driverResults.push({ slug: file, action: "fail", error: String(error) });
    }
  }

  // Team wiki logos.
  const teamRoot = path.join(root, "apps", "web", "public", "images", "teams");
  const teamSlugs = await readdir(teamRoot);
  const teamResults = [];
  for (const slug of teamSlugs) {
    const teamDir = path.join(teamRoot, slug);
    const stats = await stat(teamDir).catch(() => null);
    if (!stats?.isDirectory()) continue;
    const candidates = (await readdir(teamDir)).filter((f) => /^wiki-logo\.(png|jpe?g|webp)$/i.test(f));
    for (const file of candidates) {
      const fullPath = path.join(teamDir, file);
      try {
        teamResults.push(await compressTeamLogo(fullPath, flags));
      } catch (error) {
        teamResults.push({ slug, action: "fail", error: String(error) });
      }
    }
  }

  const driverOk = driverResults.filter((r) => r.action === "ok").length;
  const driverSkip = driverResults.filter((r) => r.action.startsWith("skip")).length;
  const driverFail = driverResults.filter((r) => r.action === "fail").length;
  const teamOk = teamResults.filter((r) => r.action === "ok").length;
  const teamSkip = teamResults.filter((r) => r.action.startsWith("skip")).length;
  const teamFail = teamResults.filter((r) => r.action === "fail").length;
  process.stdout.write(`Drivers: ok=${driverOk} skip=${driverSkip} fail=${driverFail}\n`);
  process.stdout.write(`Teams:   ok=${teamOk} skip=${teamSkip} fail=${teamFail}\n`);
  if (driverFail || teamFail) {
    for (const r of [...driverResults, ...teamResults]) {
      if (r.action === "fail") process.stdout.write(`  FAIL ${r.slug}: ${r.error}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
