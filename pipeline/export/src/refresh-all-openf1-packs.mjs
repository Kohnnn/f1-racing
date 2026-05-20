import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const manifestPath = path.join(root, "data", "manifests", "openf1-2025-season.json");
const sessionBuilder = path.join(root, "pipeline", "export", "src", "build-openf1-session-pack.mjs");

const args = process.argv.slice(2);
const filter = {
  grandPrix: argValue("--grandPrix"),
  session: argValue("--session"),
  skipExisting: args.includes("--skip-existing"),
  onlyMissing: args.includes("--only-missing"),
  skipPractice: args.includes("--skip-practice"),
  skipPreseason: args.includes("--skip-preseason") || true,
};

function argValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const next = args[index + 1];
  if (!next || next.startsWith("--")) return null;
  return next;
}

async function readManifest() {
  return JSON.parse(await readFile(manifestPath, "utf-8"));
}

function runBuilder({ grandPrixSlug, sessionSlug, season }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      sessionBuilder,
      "--season", String(season),
      "--grandPrixSlug", grandPrixSlug,
      "--sessionSlug", sessionSlug,
    ], {
      cwd: root,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Builder exited with code ${code} for ${grandPrixSlug}/${sessionSlug}`));
    });
  });
}

async function packIsComplete(season, grandPrixSlug, sessionSlug) {
  const dir = path.join(root, "data", "packs", "seasons", String(season), grandPrixSlug, sessionSlug);
  try {
    const manifestRaw = await readFile(path.join(dir, "manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);
    return Boolean(manifest.drivers && manifest.laps && manifest.summary);
  } catch {
    return false;
  }
}

async function main() {
  const seasonManifest = await readManifest();
  const targets = [];

  for (const grandPrix of seasonManifest.grandsPrix) {
    if (filter.grandPrix && grandPrix.grandPrixSlug !== filter.grandPrix) {
      continue;
    }
    for (const session of grandPrix.sessions) {
      if (filter.session && session.sessionSlug !== filter.session) {
        continue;
      }
      if (filter.skipPractice && /^practice-\d+$/.test(session.sessionSlug)) {
        continue;
      }
      if (filter.skipPreseason && grandPrix.grandPrixSlug === "pre-season-testing") {
        continue;
      }
      // The buildReady flag was set at ingest time but is unreliable -- many sessions
      // marked false do have OpenF1 data available now. Trust the manifest entry and
      // let the builder report failure if data is genuinely missing.
      targets.push({
        grandPrixSlug: session.grandPrixSlug,
        sessionSlug: session.sessionSlug,
        season: session.season,
      });
    }
  }

  process.stdout.write(`Refreshing ${targets.length} OpenF1 session packs\n`);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];

  for (const target of targets) {
    if ((filter.skipExisting || filter.onlyMissing) && await packIsComplete(target.season, target.grandPrixSlug, target.sessionSlug)) {
      process.stdout.write(`-> Skip existing ${target.grandPrixSlug}/${target.sessionSlug}\n`);
      skipped += 1;
      continue;
    }

    process.stdout.write(`\n=== ${target.grandPrixSlug}/${target.sessionSlug} ===\n`);
    try {
      await runBuilder(target);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      failures.push({ target, error: error instanceof Error ? error.message : String(error) });
      process.stderr.write(`-> Failed ${target.grandPrixSlug}/${target.sessionSlug}: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  process.stdout.write(`\nRefresh complete. ok=${succeeded} failed=${failed} skipped=${skipped}\n`);
  if (failures.length) {
    process.stdout.write("Failures:\n");
    for (const failure of failures) {
      process.stdout.write(` - ${failure.target.grandPrixSlug}/${failure.target.sessionSlug}: ${failure.error}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
