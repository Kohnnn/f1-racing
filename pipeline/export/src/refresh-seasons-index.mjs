/**
 * Rebuilds `data/manifests/seasons.json` from the on-disk pack inventory under
 * `data/packs/seasons/<year>/<gp>/<session>/manifest.json`.
 *
 * The route shell uses this aggregated manifest to populate the replay library
 * and the static-export `generateStaticParams` lists. After building new
 * packs (e.g. for 2026) run this script to make sure the new GPs/sessions are
 * discoverable from the home page and replay library.
 */
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dataDir = path.join(root, "data");
const packsDir = path.join(dataDir, "packs", "seasons");
const manifestsDir = path.join(dataDir, "manifests");
const webMirror = path.join(root, "apps", "web", "public", "data", "manifests", "seasons.json");

function titleCase(slug) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function listSubDirs(parent) {
  let entries;
  try {
    entries = await readdir(parent, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function readJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const seasonDirs = await listSubDirs(packsDir);
  const seasons = [];

  for (const seasonName of seasonDirs.sort((a, b) => Number(b) - Number(a))) {
    const seasonNumber = Number(seasonName);
    if (!Number.isFinite(seasonNumber)) continue;
    const grandsPrixDirs = await listSubDirs(path.join(packsDir, seasonName));
    const grandsPrix = [];
    for (const gpSlug of grandsPrixDirs.sort()) {
      if (gpSlug === "demo-weekend") continue;
      const sessionDirs = await listSubDirs(path.join(packsDir, seasonName, gpSlug));
      const sessions = [];
      let grandPrixName = titleCase(gpSlug);
      for (const sessionSlug of sessionDirs.sort()) {
        const manifestPath = path.join(packsDir, seasonName, gpSlug, sessionSlug, "manifest.json");
        const summaryPath = path.join(packsDir, seasonName, gpSlug, sessionSlug, "summary.json");
        const replayMetaPath = path.join(packsDir, seasonName, gpSlug, sessionSlug, "replay.meta.json");
        const replayPath = path.join(packsDir, seasonName, gpSlug, sessionSlug, "replay.json");

        const manifest = (await readJson(manifestPath)) ?? {};
        const summary = (await readJson(summaryPath)) ?? {};
        let replayMeta = await readJson(replayMetaPath);
        if (!replayMeta) {
          // Fall back to the un-split replay file when the splitter hasn't run yet.
          replayMeta = await readJson(replayPath);
        }

        try {
          // skip empties so we don't add stub routes
          await stat(manifestPath);
        } catch {
          continue;
        }

        const sessionName = summary.session ?? replayMeta?.session ?? titleCase(sessionSlug);
        const trackId = summary.trackId ?? replayMeta?.trackId ?? gpSlug;
        const sessionKey = manifest.sessionKey ?? summary.sessionKey ?? replayMeta?.sessionKey ?? 0;

        if (summary.grandPrix) grandPrixName = summary.grandPrix;
        else if (replayMeta?.grandPrix) grandPrixName = replayMeta.grandPrix;

        sessions.push({
          season: seasonNumber,
          grandPrixSlug: gpSlug,
          sessionSlug,
          grandPrixName,
          sessionName,
          sessionKey,
          trackId,
          path: `/sessions/${seasonNumber}/${gpSlug}/${sessionSlug}`,
        });
      }
      if (sessions.length) {
        grandsPrix.push({ grandPrixSlug: gpSlug, grandPrixName, sessions });
      }
    }
    if (grandsPrix.length) {
      seasons.push({ season: seasonNumber, grandsPrix });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    seasons,
  };

  await mkdir(manifestsDir, { recursive: true });
  await writeFile(path.join(manifestsDir, "seasons.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await mkdir(path.dirname(webMirror), { recursive: true });
  await writeFile(webMirror, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

  process.stdout.write(`Wrote seasons.json with ${seasons.length} season(s)\n`);
  for (const season of seasons) {
    const totalSessions = season.grandsPrix.reduce((acc, gp) => acc + gp.sessions.length, 0);
    process.stdout.write(`  ${season.season}: ${season.grandsPrix.length} GPs / ${totalSessions} sessions\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
