import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = path.resolve(import.meta.dirname, "..", "..");
const seasonsManifestPath = path.join(rootDir, "data", "manifests", "seasons.json");
const fastf1BuilderPath = path.join(rootDir, "pipeline", "fastf1", "build-fastf1-replay-pack.py");

const SUPPORTED_SESSION_SLUGS = new Set([
  "race",
  "qualifying",
  "sprint",
  "sprint-qualifying",
  "practice-1",
  "practice-2",
  "practice-3",
]);

function parseArgs(argv) {
  const options = {
    year: 2025,
    includeDemo: false,
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--year") {
      options.year = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--include-demo") {
      options.includeDemo = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
    }
  }

  return options;
}

function runPython(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`FastF1 season rebuild failed with exit code ${code}`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(seasonsManifestPath, "utf-8"));
  const season = manifest.seasons.find((entry) => entry.season === options.year);

  if (!season) {
    throw new Error(`Season ${options.year} not found in ${seasonsManifestPath}`);
  }

  const targets = [];
  for (const grandPrix of season.grandsPrix) {
    if (!options.includeDemo && grandPrix.grandPrixSlug === "demo-weekend") {
      continue;
    }

    for (const session of grandPrix.sessions) {
      if (!SUPPORTED_SESSION_SLUGS.has(session.sessionSlug)) {
        continue;
      }

      const replayPath = path.join(
        rootDir,
        "data",
        "packs",
        "seasons",
        String(options.year),
        grandPrix.grandPrixSlug,
        session.sessionSlug,
        "replay.json",
      );

      let existingSource = null;
      try {
        const replay = JSON.parse(await readFile(replayPath, "utf-8"));
        existingSource = replay.source || null;
      } catch {}

      if (!options.force && existingSource === "fastf1") {
        continue;
      }

      targets.push({
        grandPrixSlug: grandPrix.grandPrixSlug,
        sessionSlug: session.sessionSlug,
        grandPrixName: grandPrix.grandPrixName,
        sessionName: session.sessionName,
        existingSource,
      });
    }
  }

  if (!targets.length) {
    process.stdout.write(`No FastF1-compatible sessions found for ${options.year}.\n`);
    return;
  }

  process.stdout.write(`Rebuilding ${targets.length} GPS replay packs for ${options.year}.\n`);

  for (const target of targets) {
    process.stdout.write(`\n=== ${target.grandPrixName} · ${target.sessionName} ===`);
    if (target.existingSource) {
      process.stdout.write(` [existing: ${target.existingSource}]`);
    }
    process.stdout.write("\n");
    await runPython([
      fastf1BuilderPath,
      "--year",
      String(options.year),
      "--grandPrixSlug",
      target.grandPrixSlug,
      "--sessionSlug",
      target.sessionSlug,
    ]);
  }

  process.stdout.write(`\nFinished rebuilding ${targets.length} GPS replay packs for ${options.year}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
