/**
 * Build the OpenF1 season manifest for a target year (defaults to 2026).
 *
 * Mirrors the structure of `data/manifests/openf1-2025-season.json` so the
 * existing `build-openf1-replay-pack.mjs` resolver works without changes.
 *
 *   node pipeline/export/src/build-openf1-season-manifest.mjs --year 2026
 *
 * The script writes `data/manifests/openf1-<year>-season.json` and produces
 * one session entry per (meeting_key, session) returned by OpenF1, including
 * Practice 1/2/3 and Sprint Qualifying / Sprint where they exist.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u00C0-\u00FF]/g, (ch) => {
      const map = {
        à: "a", á: "a", ã: "a", â: "a", ä: "a", å: "a",
        ç: "c", è: "e", é: "e", ê: "e", ë: "e",
        ì: "i", í: "i", î: "i", ï: "i",
        ñ: "n", ò: "o", ó: "o", ô: "o", õ: "o", ö: "o",
        ù: "u", ú: "u", û: "u", ü: "u", ý: "y", ÿ: "y",
      };
      return map[ch] ?? ch;
    })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const COUNTRY_TO_GP = {
  Australia: "Australian Grand Prix",
  Bahrain: "Bahrain Grand Prix",
  China: "Chinese Grand Prix",
  Japan: "Japanese Grand Prix",
  "Saudi Arabia": "Saudi Arabian Grand Prix",
  "United States": "United States Grand Prix",
  Canada: "Canadian Grand Prix",
  Monaco: "Monaco Grand Prix",
  Spain: "Spanish Grand Prix",
  Austria: "Austrian Grand Prix",
  "United Kingdom": "British Grand Prix",
  Belgium: "Belgian Grand Prix",
  Hungary: "Hungarian Grand Prix",
  Netherlands: "Dutch Grand Prix",
  Italy: "Italian Grand Prix",
  Azerbaijan: "Azerbaijan Grand Prix",
  Singapore: "Singapore Grand Prix",
  Mexico: "Mexico City Grand Prix",
  Brazil: "Sao Paulo Grand Prix",
  Qatar: "Qatar Grand Prix",
  "United Arab Emirates": "Abu Dhabi Grand Prix",
};

const LOCATION_TO_GP_OVERRIDE = {
  "Miami Gardens": "Miami Grand Prix",
  Imola: "Emilia Romagna Grand Prix",
  Madrid: "Madrid Grand Prix",
  "Las Vegas": "Las Vegas Grand Prix",
};

const LOCATION_TO_TRACK = {
  Melbourne: "melbourne",
  Sakhir: "sakhir",
  Shanghai: "shanghai",
  Suzuka: "suzuka",
  Bahrain: "sakhir",
  Jeddah: "jeddah",
  "Miami Gardens": "miami",
  "Monte Carlo": "monaco",
  Barcelona: "barcelona",
  Spielberg: "spielberg",
  Silverstone: "silverstone",
  Imola: "imola",
  "Spa-Francorchamps": "spa",
  Budapest: "budapest",
  Zandvoort: "zandvoort",
  Monza: "monza",
  Madrid: "madrid",
  Baku: "baku",
  "Marina Bay": "singapore",
  Austin: "austin",
  "Mexico City": "mexico",
  "Sao Paulo": "interlagos",
  "S\u00e3o Paulo": "interlagos",
  "Las Vegas": "lasvegas",
  Lusail: "lusail",
  "Yas Marina": "yas-marina-circuit",
  Montreal: "montreal",
  "Montr\u00e9al": "montreal",
};

function inferGrandPrixName(meetingSession) {
  const location = meetingSession.location || "";
  if (LOCATION_TO_GP_OVERRIDE[location]) return LOCATION_TO_GP_OVERRIDE[location];
  const country = meetingSession.country_name || "";
  if (COUNTRY_TO_GP[country]) return COUNTRY_TO_GP[country];
  return `${country || location || "Unknown"} Grand Prix`;
}

function inferTrackId(meetingSession) {
  const location = meetingSession.location || "";
  if (LOCATION_TO_TRACK[location]) return LOCATION_TO_TRACK[location];
  return slugify(location);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "f1-racing-app/1.0 (season manifest builder)",
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.includes("=") ? arg.slice(2).split("=", 2) : [arg.slice(2), argv[++i]];
    out[key] = value;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const year = Number(args.year || 2026);

  process.stdout.write(`Fetching OpenF1 sessions for ${year} ...\n`);
  const allSessions = await fetchJson(`https://api.openf1.org/v1/sessions?year=${year}`);

  const meetings = new Map();
  for (const session of allSessions) {
    const meetingKey = Number(session.meeting_key);
    if (!Number.isFinite(meetingKey)) continue;
    if (!meetings.has(meetingKey)) {
      const isTesting = String(session.session_name || "").startsWith("Day ");
      const grandPrixName = isTesting ? "Pre-Season Testing" : inferGrandPrixName(session);
      const grandPrixSlug = isTesting
        ? `pre-season-testing${meetings.size + 1 > 1 ? `-${meetings.size + 1}` : ""}`
        : slugify(grandPrixName);
      meetings.set(meetingKey, {
        grandPrixSlug,
        grandPrixName,
        countryName: session.country_name || "",
        circuitShortName: session.circuit_short_name || session.location || "",
        meetingKey,
        sessions: [],
      });
    }
    const grandPrix = meetings.get(meetingKey);
    const sessionName = session.session_name || session.session_type || "Session";
    const sessionSlug = slugify(sessionName);
    grandPrix.sessions.push({
      season: year,
      grandPrixSlug: grandPrix.grandPrixSlug,
      sessionSlug,
      grandPrixName: grandPrix.grandPrixName,
      sessionName,
      sessionKey: Number(session.session_key),
      trackId: inferTrackId(session),
      path: `/sessions/${year}/${grandPrix.grandPrixSlug}/${sessionSlug}`,
      startDate: session.date_start,
      endDate: session.date_end,
      countryName: session.country_name || "",
      location: session.location || "",
      source: "openf1",
      buildReady: false,
    });
  }

  // Sort sessions inside each GP by start date, sort GPs by earliest session start.
  const grandsPrix = Array.from(meetings.values())
    .map((gp) => ({
      ...gp,
      sessions: [...gp.sessions].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate)),
    }))
    .sort((a, b) => Date.parse(a.sessions[0]?.startDate ?? "") - Date.parse(b.sessions[0]?.startDate ?? ""));

  // Disambiguate testing slugs (Bahrain has two test meetings in 2026).
  let testingIndex = 0;
  for (const gp of grandsPrix) {
    if (gp.grandPrixName !== "Pre-Season Testing") continue;
    testingIndex += 1;
    const slug = testingIndex === 1 ? "pre-season-testing" : `pre-season-testing-${testingIndex}`;
    gp.grandPrixSlug = slug;
    gp.grandPrixName = testingIndex === 1 ? "Pre-Season Testing" : `Pre-Season Testing #${testingIndex}`;
    for (const session of gp.sessions) {
      session.grandPrixSlug = slug;
      session.grandPrixName = gp.grandPrixName;
      session.path = `/sessions/${year}/${slug}/${session.sessionSlug}`;
    }
  }

  const manifest = {
    schemaVersion: 1,
    season: year,
    source: "openf1",
    generatedAt: new Date().toISOString(),
    grandsPrix,
  };

  const targetDir = path.join(root, "data", "manifests");
  await mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, `openf1-${year}-season.json`);
  await writeFile(targetPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  process.stdout.write(`Wrote ${path.relative(root, targetPath)}\n`);
  process.stdout.write(`Total Grands Prix: ${grandsPrix.length}\n`);
  for (const gp of grandsPrix) {
    process.stdout.write(`  ${gp.grandPrixSlug}: ${gp.sessions.length} session(s)\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
