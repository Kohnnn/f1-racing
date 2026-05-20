/**
 * Rebuilds OpenF1 replay packs for every session in the season manifest using
 * the canonical track shapes. Calls `build-openf1-replay-pack.mjs` once per
 * session and then runs the splitter so the meta + chunk files reflect the
 * fresh canonical centerline.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const seasonManifestPath = path.join(root, "data", "manifests", "openf1-2025-season.json");

function runChildScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Script ${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

async function main() {
  const manifest = JSON.parse(await readFile(seasonManifestPath, "utf-8"));
  const replayBuilder = path.join(root, "pipeline", "export", "src", "build-openf1-replay-pack.mjs");
  const splitter = path.join(root, "pipeline", "export", "src", "split-replay-packs.mjs");

  const targets = [];
  for (const grandPrix of manifest.grandsPrix) {
    if (grandPrix.grandPrixSlug === "pre-season-testing") continue;
    for (const session of grandPrix.sessions) {
      if (/^practice-/.test(session.sessionSlug)) continue;
      targets.push({ grandPrixSlug: grandPrix.grandPrixSlug, sessionSlug: session.sessionSlug, season: session.season });
    }
  }

  process.stdout.write(`Rebuilding ${targets.length} replay packs with canonical track shapes\n`);
  let ok = 0;
  let fail = 0;
  const failures = [];

  for (const target of targets) {
    process.stdout.write(`\n=== ${target.grandPrixSlug}/${target.sessionSlug} ===\n`);
    try {
      await runChildScript(replayBuilder, [
        "--season", String(target.season),
        "--grandPrixSlug", target.grandPrixSlug,
        "--sessionSlug", target.sessionSlug,
      ]);
      ok += 1;
    } catch (error) {
      fail += 1;
      failures.push({ target, error: error instanceof Error ? error.message : String(error) });
      process.stderr.write(`-> failed ${target.grandPrixSlug}/${target.sessionSlug}: ${error}\n`);
    }
  }

  process.stdout.write("\nSplitting all replay packs...\n");
  await runChildScript(splitter);

  process.stdout.write(`\nReplay refresh complete. ok=${ok} fail=${fail}\n`);
  if (failures.length) {
    for (const failure of failures) {
      process.stdout.write(` - ${failure.target.grandPrixSlug}/${failure.target.sessionSlug}: ${failure.error}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
