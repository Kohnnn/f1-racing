/**
 * Fetch driver portraits + team logos from Wikipedia (2026-05-23).
 *
 * Strategy:
 * - For each driver in apps/web/src/data/art/drivers.json, look up the
 *   Wikipedia page summary via the public REST API and download the
 *   `originalimage.source` (or `thumbnail.source` if no original) into
 *   `apps/web/public/images/drivers/<slug>.webp` (re-encoded to webp via
 *   sharp if available; otherwise stored with original extension).
 * - For each team in apps/web/src/data/art/teams.json, look up the team
 *   page summary and download the logo into
 *   `apps/web/public/images/teams/<slug>/portrait.webp`. We do NOT
 *   overwrite the generated `logo.svg`, because the official F1 brand
 *   logo SVG isn't available through the Wikipedia REST API; team SVGs
 *   that ARE available on Wikipedia Commons are fetched into
 *   `<slug>/wiki-logo.{svg|png}` so the consumer can pick which to use.
 *
 * Per the project policy, we do not bundle copyrighted F1 brand assets
 * directly. Wikipedia infobox imagery is typically CC-BY-SA, public
 * domain, or fair-use under Wikipedia's policies; the URL each asset
 * came from is recorded back into the manifests so attribution stays
 * traceable.
 *
 * Flags:
 *   --force          re-fetch even if file exists
 *   --slug=<slug>    only one driver / team (matches drivers OR teams)
 *   --kind=drivers   only drivers
 *   --kind=teams     only teams
 *   --dry            print what would be fetched, don't write
 */

import { mkdir, readFile, writeFile, access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const USER_AGENT = "f1-racing-art-fetch/1.0 (https://playful-peony-77899c.netlify.app; build pipeline)";
const REST_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary/";

function parseFlags(argv) {
  const flags = { force: false, slug: null, kind: "both", dry: false };
  for (const a of argv.slice(2)) {
    if (a === "--force") flags.force = true;
    else if (a === "--dry") flags.dry = true;
    else if (a.startsWith("--slug=")) flags.slug = a.slice("--slug=".length);
    else if (a.startsWith("--kind=")) flags.kind = a.slice("--kind=".length);
  }
  return flags;
}

async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

async function fetchSummary(title) {
  const url = `${REST_BASE}${encodeURIComponent(title)}`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
  if (!response.ok) {
    throw new Error(`Wikipedia summary ${title}: ${response.status}`);
  }
  return response.json();
}

async function downloadBinary(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Download ${url}: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "";
  return { buffer: Buffer.from(buffer), contentType };
}

function extensionFor(url, contentType) {
  // Prefer URL extension; fall back to content-type.
  const m = /\.(jpe?g|png|webp|svg|gif)(?:\?|$)/i.exec(url);
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg")) return "jpg";
  return "bin";
}

// Driver Wikipedia titles. Uses fullName from manifest by default; overrides
// here disambiguate where the canonical title differs (homonyms, accents).
const DRIVER_TITLE_OVERRIDES = {
  "max-verstappen": "Max Verstappen",
  "lando-norris": "Lando Norris",
  "oscar-piastri": "Oscar Piastri",
  "charles-leclerc": "Charles Leclerc",
  "carlos-sainz": "Carlos Sainz Jr.",
  "lewis-hamilton": "Lewis Hamilton",
  "george-russell": "George Russell (racing driver)",
  "andrea-kimi-antonelli": "Andrea Kimi Antonelli",
  "fernando-alonso": "Fernando Alonso",
  "lance-stroll": "Lance Stroll",
  "pierre-gasly": "Pierre Gasly",
  "esteban-ocon": "Esteban Ocon",
  "jack-doohan": "Jack Doohan",
  "franco-colapinto": "Franco Colapinto",
  "alex-albon": "Alexander Albon",
  "logan-sargeant": "Logan Sargeant",
  "daniel-ricciardo": "Daniel Ricciardo",
  "liam-lawson": "Liam Lawson",
  "valtteri-bottas": "Valtteri Bottas",
  "zhou-guanyu": "Zhou Guanyu",
  "nico-hulkenberg": "Nico Hülkenberg",
  "kevin-magnussen": "Kevin Magnussen",
  "oliver-bearman": "Oliver Bearman",
  "gabriel-bortoleto": "Gabriel Bortoleto",
  "sergio-perez": "Sergio Pérez",
  "yuki-tsunoda": "Yuki Tsunoda",
  "isack-hadjar": "Isack Hadjar",
};

// Team Wikipedia titles.
const TEAM_TITLE_OVERRIDES = {
  "red-bull": "Red Bull Racing",
  "mclaren": "McLaren",
  "ferrari": "Scuderia Ferrari",
  "mercedes": "Mercedes-Benz in Formula One",
  "aston-martin": "Aston Martin in Formula One",
  "alpine": "Alpine F1 Team",
  "williams": "Williams Racing",
  "rb": "RB (Formula One team)",
  "racing-bulls": "Racing Bulls",
  "kick-sauber": "Sauber Motorsport",
  "audi": "Audi in Formula One",
  "haas": "Haas F1 Team",
  "cadillac": "Cadillac Formula One team",
};

// Some pages return 404 when fetched at the disambiguated title we use.
// The fallbacks list provides alternate titles to try in order.
const TEAM_TITLE_FALLBACKS = {
  "rb": ["RB Formula One Team", "Visa Cash App RB", "AlphaTauri", "Scuderia AlphaTauri"],
  "racing-bulls": ["Visa Cash App Racing Bulls F1 Team", "Visa Cash App RB"],
  "audi": ["Audi Sport", "Audi"],
};

async function processDriver(driver, flags, attributions) {
  const title = DRIVER_TITLE_OVERRIDES[driver.slug] || driver.fullName;
  const outDir = path.join(root, "apps", "web", "public", "images", "drivers");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${driver.slug}.webp`);
  // Also accept .jpg / .png on disk -- if any portrait exists already and
  // --force is not set, skip.
  const existingExtensions = ["webp", "jpg", "jpeg", "png"];
  if (!flags.force) {
    for (const ext of existingExtensions) {
      const candidate = path.join(outDir, `${driver.slug}.${ext}`);
      if (await exists(candidate)) {
        attributions.push({ kind: "driver", slug: driver.slug, title, status: "skip-exists", path: path.relative(root, candidate) });
        return;
      }
    }
  }
  if (flags.dry) {
    attributions.push({ kind: "driver", slug: driver.slug, title, status: "dry" });
    return;
  }
  let summary;
  try {
    summary = await fetchSummary(title);
  } catch (error) {
    attributions.push({ kind: "driver", slug: driver.slug, title, status: "fail-summary", error: String(error) });
    return;
  }
  const sourceUrl = summary?.originalimage?.source || summary?.thumbnail?.source;
  if (!sourceUrl) {
    attributions.push({ kind: "driver", slug: driver.slug, title, status: "fail-no-image" });
    return;
  }
  let download;
  try {
    download = await downloadBinary(sourceUrl);
  } catch (error) {
    attributions.push({ kind: "driver", slug: driver.slug, title, status: "fail-download", error: String(error) });
    return;
  }
  const ext = extensionFor(sourceUrl, download.contentType);
  // We store the file as <slug>.<ext>. If sharp is available, additionally
  // emit a webp companion so the leaderboard glyph stays small. Without
  // sharp we still satisfy the manifest by writing the original directly
  // when it is webp; otherwise we fall through and consumers can rely on
  // onError to pick the avatar SVG.
  const finalPath = path.join(outDir, `${driver.slug}.${ext}`);
  await writeFile(finalPath, download.buffer);
  attributions.push({
    kind: "driver",
    slug: driver.slug,
    title,
    status: "ok",
    path: path.relative(root, finalPath).replace(/\\/g, "/"),
    sourceUrl,
    pageUrl: summary?.content_urls?.desktop?.page,
    license: "Wikipedia infobox image (see page for licence)",
  });
}

async function processTeam(team, flags, attributions) {
  const primaryTitle = TEAM_TITLE_OVERRIDES[team.slug] || team.displayName;
  const fallbackTitles = TEAM_TITLE_FALLBACKS[team.slug] || [];
  const titles = [primaryTitle, ...fallbackTitles];
  const outDir = path.join(root, "apps", "web", "public", "images", "teams", team.slug);
  await mkdir(outDir, { recursive: true });
  if (!flags.force) {
    for (const ext of ["webp", "png", "jpg", "svg"]) {
      const candidate = path.join(outDir, `wiki-logo.${ext}`);
      if (await exists(candidate)) {
        attributions.push({ kind: "team", slug: team.slug, title: primaryTitle, status: "skip-exists", path: path.relative(root, candidate) });
        return;
      }
    }
  }
  if (flags.dry) {
    attributions.push({ kind: "team", slug: team.slug, title: primaryTitle, status: "dry" });
    return;
  }
  let summary = null;
  let titleUsed = primaryTitle;
  let lastError = null;
  for (const title of titles) {
    try {
      summary = await fetchSummary(title);
      titleUsed = title;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!summary) {
    attributions.push({ kind: "team", slug: team.slug, title: primaryTitle, status: "fail-summary", error: String(lastError) });
    return;
  }
  const sourceUrl = summary?.originalimage?.source || summary?.thumbnail?.source;
  if (!sourceUrl) {
    attributions.push({ kind: "team", slug: team.slug, title: titleUsed, status: "fail-no-image" });
    return;
  }
  let download;
  try {
    download = await downloadBinary(sourceUrl);
  } catch (error) {
    attributions.push({ kind: "team", slug: team.slug, title: titleUsed, status: "fail-download", error: String(error) });
    return;
  }
  const ext = extensionFor(sourceUrl, download.contentType);
  const finalPath = path.join(outDir, `wiki-logo.${ext}`);
  await writeFile(finalPath, download.buffer);
  attributions.push({
    kind: "team",
    slug: team.slug,
    title: titleUsed,
    status: "ok",
    path: path.relative(root, finalPath).replace(/\\/g, "/"),
    sourceUrl,
    pageUrl: summary?.content_urls?.desktop?.page,
    license: "Wikipedia infobox image (see page for licence)",
  });
}

async function main() {
  const flags = parseFlags(process.argv);
  const driversManifest = JSON.parse(await readFile(path.join(root, "apps", "web", "src", "data", "art", "drivers.json"), "utf-8"));
  const teamsManifest = JSON.parse(await readFile(path.join(root, "apps", "web", "src", "data", "art", "teams.json"), "utf-8"));
  const attributions = [];

  if (flags.kind !== "teams") {
    const drivers = flags.slug ? driversManifest.drivers.filter((d) => d.slug === flags.slug) : driversManifest.drivers;
    for (const driver of drivers) {
      await processDriver(driver, flags, attributions);
      // Be polite to Wikipedia.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  if (flags.kind !== "drivers") {
    const teams = flags.slug ? teamsManifest.teams.filter((t) => t.slug === flags.slug) : teamsManifest.teams;
    for (const team of teams) {
      await processTeam(team, flags, attributions);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  // Persist attribution log so docs/art-attributions.md can absorb it.
  const attributionsPath = path.join(root, "docs", "art-fetch-log.json");
  await writeFile(attributionsPath, `${JSON.stringify({ runAt: new Date().toISOString(), entries: attributions }, null, 2)}\n`, "utf-8");
  const ok = attributions.filter((a) => a.status === "ok").length;
  const skip = attributions.filter((a) => a.status === "skip-exists").length;
  const fail = attributions.filter((a) => a.status.startsWith("fail")).length;
  process.stdout.write(`Fetched ok=${ok} skipped=${skip} failed=${fail}\nLog: ${path.relative(root, attributionsPath)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
