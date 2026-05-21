/**
 * Build replay packs for 2026 (every completed Grand Prix weekend, including
 * Practice 1/2/3, Sprint Qualifying, Sprint, Qualifying, Race) plus a curated
 * list of key 2024 / 2025 races for backfill.
 *
 * Usage:
 *   node pipeline/export/src/build-2026-and-key-races.mjs                # default
 *   node pipeline/export/src/build-2026-and-key-races.mjs --skip-practice
 *   node pipeline/export/src/build-2026-and-key-races.mjs --years=2026   # only 2026
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Curated "good races" from previous seasons. We bias toward season finales,
 * championship-deciding races, and high-incident events so the catalogue stays
 * dense without requiring a full backfill.
 */
const KEY_RACES = {
  2025: [
    { gp: "abu-dhabi-grand-prix", reason: "season finale" },
    { gp: "british-grand-prix", reason: "wet/dry classic" },
    { gp: "monaco-grand-prix", reason: "principality" },
  ],
  2024: [
    { gp: "abu-dhabi-grand-prix", reason: "season finale" },
    { gp: "sao-paulo-grand-prix", reason: "wet/changing" },
    { gp: "las-vegas-grand-prix", reason: "showcase" },
    { gp: "british-grand-prix", reason: "Hamilton home win" },
  ],
};

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.includes("=") ? arg.slice(2).split("=", 2) : [arg.slice(2), true];
    out[key] = value;
  }
  return out;
}

function runChild(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Script ${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

async function loadManifest(year) {
  const filePath = path.join(root, "data", "manifests", `openf1-${year}-season.json`);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isSessionPast(session) {
  const end = session.endDate ? Date.parse(session.endDate) : NaN;
  if (!Number.isFinite(end)) return true;
  return end < Date.now();
}

async function planTargets({ years, skipPractice }) {
  const targets = [];
  for (const year of years) {
    const manifest = await loadManifest(year);
    if (!manifest) {
      process.stdout.write(`No manifest for ${year}; skipping.\n`);
      continue;
    }

    if (year === 2026) {
      // Every past Grand Prix weekend, every session.
      for (const gp of manifest.grandsPrix) {
        for (const session of gp.sessions) {
          if (skipPractice && /^practice-/.test(session.sessionSlug)) continue;
          if (!isSessionPast(session)) continue;
          // Skip pre-season testing day-N sessions.
          if (gp.grandPrixSlug.startsWith("pre-season-testing")) continue;
          targets.push({
            year,
            grandPrixSlug: gp.grandPrixSlug,
            sessionSlug: session.sessionSlug,
            reason: "2026 weekend",
          });
        }
      }
      continue;
    }

    // 2024 / 2025: only keep races/qualifying/sprint/etc for curated GPs.
    const keys = (KEY_RACES[year] ?? []).map((entry) => entry.gp);
    if (!keys.length) continue;
    for (const gp of manifest.grandsPrix) {
      if (!keys.includes(gp.grandPrixSlug)) continue;
      for (const session of gp.sessions) {
        if (skipPractice && /^practice-/.test(session.sessionSlug)) continue;
        if (gp.grandPrixSlug.startsWith("pre-season-testing")) continue;
        if (!isSessionPast(session)) continue;
        targets.push({
          year,
          grandPrixSlug: gp.grandPrixSlug,
          sessionSlug: session.sessionSlug,
          reason: "key race",
        });
      }
    }
  }
  return targets;
}

async function main() {
  const args = parseArgs(process.argv);
  const years = args.years
    ? String(args.years).split(",").map((value) => Number(value.trim())).filter(Number.isFinite)
    : [2026, 2025, 2024];
  const skipPractice = args["skip-practice"] === true || args["skip-practice"] === "true";

  const replayBuilder = path.join(root, "pipeline", "export", "src", "build-openf1-replay-pack.mjs");
  const splitter = path.join(root, "pipeline", "export", "src", "split-replay-packs.mjs");

  const targets = await planTargets({ years, skipPractice });
  process.stdout.write(`Planned ${targets.length} session pack target(s) across years ${years.join(", ")}\n`);
  for (const target of targets) {
    process.stdout.write(`  - ${target.year} ${target.grandPrixSlug}/${target.sessionSlug} (${target.reason})\n`);
  }

  let ok = 0;
  let fail = 0;
  const failures = [];

  for (const target of targets) {
    process.stdout.write(`\n=== ${target.year} ${target.grandPrixSlug}/${target.sessionSlug} ===\n`);
    try {
      await runChild(replayBuilder, [
        "--season", String(target.year),
        "--grandPrixSlug", target.grandPrixSlug,
        "--sessionSlug", target.sessionSlug,
      ]);
      ok += 1;
    } catch (error) {
      fail += 1;
      failures.push({ target, error: error instanceof Error ? error.message : String(error) });
      process.stderr.write(`-> failed: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  process.stdout.write("\nSplitting all replay packs...\n");
  try {
    await runChild(splitter);
  } catch (error) {
    process.stderr.write(`Splitter failed: ${error instanceof Error ? error.message : error}\n`);
  }

  process.stdout.write(`\nDone. ok=${ok} fail=${fail}\n`);
  if (failures.length) {
    for (const failure of failures) {
      process.stdout.write(` - ${failure.target.year} ${failure.target.grandPrixSlug}/${failure.target.sessionSlug}: ${failure.error}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
