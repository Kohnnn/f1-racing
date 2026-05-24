/**
 * Art helpers (2026-05-23).
 *
 * Single source of truth for asset paths consumed by UI surfaces. Every
 * lookup returns a guaranteed-non-null path with a sane fallback so the
 * caller never has to branch on `null`.
 *
 * Manifests live in `data/art/*.json` and are mirrored at build time to
 * `apps/web/public/data/art/*.json`. Generated assets live under
 * `apps/web/public/images/{teams,drivers,circuits}/...`.
 */

import teamsManifestRaw from "../data/art/teams.json";
import driversManifestRaw from "../data/art/drivers.json";
import circuitsManifestRaw from "../data/art/circuits.json";
import calendarManifestRaw from "../data/art/calendar.json";

export interface TeamArtEntry {
  slug: string;
  displayName: string;
  shortName: string;
  letterMark: string;
  country: string;
  baseColor: string;
  accentColor: string;
  introducedYear: number;
  seasons: number[];
  logo: string;
  logoFallback?: string;
  carImage?: string;
}

export interface DriverArtEntry {
  slug: string;
  fullName: string;
  code: string;
  racingNumber: number;
  country: string;
  seasons: Array<{ season: number; team: string }>;
  portrait: string;
  numberPlate: string;
}

export interface CircuitArtEntry {
  slug: string;
  displayName: string;
  grandPrix: string;
  country: string;
  city: string;
  lengthKm: number;
  corners: number;
  firstGp: number;
  trackShape: string;
  mapImage: string;
  heroImage: string;
  seasonsRun: number[];
}

const teamsManifest = teamsManifestRaw as { teams: TeamArtEntry[] };
const driversManifest = driversManifestRaw as { drivers: DriverArtEntry[] };
const circuitsManifest = circuitsManifestRaw as { circuits: CircuitArtEntry[] };

const teamBySlug = new Map(teamsManifest.teams.map((team) => [team.slug, team]));
const driverByCode = new Map(driversManifest.drivers.map((driver) => [driver.code, driver]));
const driverBySlug = new Map(driversManifest.drivers.map((driver) => [driver.slug, driver]));

// Common slug aliases that appear in replay packs but differ from the
// canonical team registry slugs.
const TEAM_SLUG_ALIASES: Record<string, string> = {
  "red-bull-racing": "red-bull",
  "redbull": "red-bull",
  "mercedes-amg": "mercedes",
  "mercedes-amg-petronas": "mercedes",
  "scuderia-ferrari": "ferrari",
  "aston-martin-aramco": "aston-martin",
  "alpine-renault": "alpine",
  "williams-racing": "williams",
  "stake-kick-sauber": "kick-sauber",
  "stake-f1-team-kick-sauber": "kick-sauber",
  "sauber": "kick-sauber",
  "rb-honda": "rb",
  "visa-cash-app-rb": "rb",
  "racingbulls": "racing-bulls",
  "visa-cash-app-racing-bulls": "racing-bulls",
  "moneygram-haas": "haas",
  "haas-ferrari": "haas",
  "audi-f1": "audi",
  "cadillac-f1": "cadillac",
};

const CIRCUIT_SLUG_ALIASES: Record<string, string> = {
  "spa-francorchamps": "spa",
  "monte-carlo": "monaco",
  "mexico-city": "mexico",
  "las-vegas": "lasvegas",
  "yas-island": "yas-marina-circuit",
  "yas-marina": "yas-marina-circuit",
  "catalunya": "barcelona",
  "hungaroring": "budapest",
};

function normalizeTeamSlug(slug: string | null | undefined): string {
  if (!slug) return "";
  const lowered = slug.toLowerCase().trim();
  return TEAM_SLUG_ALIASES[lowered] ?? lowered;
}

function normalizeCircuitSlug(slug: string | null | undefined): string {
  if (!slug) return "";
  const lowered = slug.toLowerCase().trim();
  return CIRCUIT_SLUG_ALIASES[lowered] ?? lowered;
}

const FALLBACK_TEAM: TeamArtEntry = {
  slug: "unknown",
  displayName: "Unknown team",
  shortName: "Unknown",
  letterMark: "F1",
  country: "",
  baseColor: "#9ca3af",
  accentColor: "#ffffff",
  introducedYear: 0,
  seasons: [],
  logo: "/images/teams/_placeholder/logo.svg",
};

export function resolveTeam(slug: string | null | undefined): TeamArtEntry {
  const normalized = normalizeTeamSlug(slug);
  return teamBySlug.get(normalized) ?? FALLBACK_TEAM;
}

export function getTeamArt(slug: string | null | undefined): {
  team: TeamArtEntry;
  logo: string;
  /** Wikipedia-fetched bitmap logo (PNG/WebP) when available — caller can prefer this over the generated letter-mark. */
  wikiLogo: string;
  mark: string;
  stripe: string;
} {
  const team = resolveTeam(slug);
  const base = team === FALLBACK_TEAM
    ? "/images/teams/red-bull"
    : `/images/teams/${team.slug}`;
  return {
    team,
    logo: `${base}/logo.svg`,
    wikiLogo: `${base}/wiki-logo.webp`,
    mark: `${base}/mark.svg`,
    stripe: `${base}/stripe.svg`,
  };
}

export function getDriverArt(input: string | null | undefined, options?: { season?: number }): {
  driver: DriverArtEntry | null;
  portrait: string;
  avatar: string;
  numberPlate: string;
  team: TeamArtEntry;
} {
  if (!input) {
    return { driver: null, portrait: FALLBACK_TEAM.logo, avatar: FALLBACK_TEAM.logo, numberPlate: FALLBACK_TEAM.logo, team: FALLBACK_TEAM };
  }
  const cleaned = input.toString().trim();
  // Try by 3-letter code first, then by slug.
  const candidate = driverByCode.get(cleaned.toUpperCase()) || driverBySlug.get(cleaned.toLowerCase());
  if (!candidate) {
    return { driver: null, portrait: FALLBACK_TEAM.logo, avatar: FALLBACK_TEAM.logo, numberPlate: FALLBACK_TEAM.logo, team: FALLBACK_TEAM };
  }
  const seasonEntry = options?.season
    ? candidate.seasons.find((entry) => entry.season === options.season)
    : null;
  const teamSlug = seasonEntry?.team ?? candidate.seasons[candidate.seasons.length - 1]?.team;
  const team = resolveTeam(teamSlug);
  return {
    driver: candidate,
    portrait: candidate.portrait,
    avatar: `/images/drivers/avatars/${candidate.slug}.svg`,
    numberPlate: candidate.numberPlate,
    team,
  };
}

const FALLBACK_CIRCUIT: CircuitArtEntry = {
  slug: "unknown",
  displayName: "Unknown circuit",
  grandPrix: "Unknown Grand Prix",
  country: "",
  city: "",
  lengthKm: 0,
  corners: 0,
  firstGp: 0,
  trackShape: "",
  mapImage: "",
  heroImage: "",
  seasonsRun: [],
};

export function resolveCircuit(slug: string | null | undefined): CircuitArtEntry {
  if (!slug) return FALLBACK_CIRCUIT;
  const normalized = normalizeCircuitSlug(slug);
  return circuitsManifest.circuits.find((circuit) => circuit.slug === normalized) ?? FALLBACK_CIRCUIT;
}

export function getCircuitArt(slug: string | null | undefined): {
  circuit: CircuitArtEntry;
  map: string | null;
  hero: string | null;
  trackShape: string | null;
} {
  const circuit = resolveCircuit(slug);
  if (circuit === FALLBACK_CIRCUIT) {
    return { circuit, map: null, hero: null, trackShape: null };
  }
  return {
    circuit,
    map: circuit.mapImage,
    hero: circuit.heroImage,
    trackShape: circuit.trackShape,
  };
}

export function listTeams(): TeamArtEntry[] {
  return teamsManifest.teams;
}

export function listDrivers(season?: number): DriverArtEntry[] {
  if (!season) return driversManifest.drivers;
  return driversManifest.drivers.filter((driver) => driver.seasons.some((entry) => entry.season === season));
}

export function listCircuits(season?: number): CircuitArtEntry[] {
  if (!season) return circuitsManifest.circuits;
  return circuitsManifest.circuits.filter((circuit) => circuit.seasonsRun.includes(season));
}

// ---------------------------------------------------------------------------
// Calendar (per-session race-weekend dates)
// ---------------------------------------------------------------------------

export type CalendarFormat = "standard" | "sprint";

export interface CalendarSessionMap {
  practice1?: string;
  practice2?: string;
  practice3?: string;
  qualifying?: string;
  sprint?: string;
  "sprint-qualifying"?: string;
  race?: string;
}

export interface CalendarWeekendEntry {
  grandPrixSlug: string;
  displayName: string;
  weekendStart: string;
  weekendEnd: string;
  format: CalendarFormat;
  sessions: CalendarSessionMap;
}

export interface CalendarSeasonEntry {
  season: number;
  weekends: CalendarWeekendEntry[];
}

export interface CalendarManifest {
  version: string;
  seasons: CalendarSeasonEntry[];
}

const calendarManifest = calendarManifestRaw as CalendarManifest;

const calendarBySeason = new Map<number, Map<string, CalendarWeekendEntry>>();
for (const season of calendarManifest.seasons) {
  const map = new Map<string, CalendarWeekendEntry>();
  for (const weekend of season.weekends) {
    map.set(weekend.grandPrixSlug, weekend);
  }
  calendarBySeason.set(season.season, map);
}

export function getRaceWeekend(season: number, grandPrixSlug: string): CalendarWeekendEntry | null {
  return calendarBySeason.get(season)?.get(grandPrixSlug) ?? null;
}

export function getSessionDate(season: number, grandPrixSlug: string, sessionSlug: string): string | null {
  const weekend = getRaceWeekend(season, grandPrixSlug);
  if (!weekend) return null;
  const key = sessionSlug as keyof CalendarSessionMap;
  return weekend.sessions[key] ?? null;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseIso(iso: string): Date | null {
  // Force UTC to avoid TZ drift on the server vs. client.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function formatSessionDate(iso: string | null | undefined, options?: { showYear?: boolean }): string | null {
  if (!iso) return null;
  const date = parseIso(iso);
  if (!date) return null;
  const day = date.getUTCDate();
  const month = MONTH_SHORT[date.getUTCMonth()];
  const weekday = DAY_SHORT[date.getUTCDay()];
  const year = date.getUTCFullYear();
  return options?.showYear
    ? `${weekday} ${day} ${month} ${year}`
    : `${weekday} ${day} ${month}`;
}

export function formatWeekendRange(weekend: CalendarWeekendEntry | null | undefined): string | null {
  if (!weekend) return null;
  const start = parseIso(weekend.weekendStart);
  const end = parseIso(weekend.weekendEnd);
  if (!start || !end) return null;
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const startMonth = MONTH_SHORT[start.getUTCMonth()];
  const endMonth = MONTH_SHORT[end.getUTCMonth()];
  const year = end.getUTCFullYear();
  if (sameMonth) {
    return `${start.getUTCDate()} - ${end.getUTCDate()} ${endMonth} ${year}`;
  }
  return `${start.getUTCDate()} ${startMonth} - ${end.getUTCDate()} ${endMonth} ${year}`;
}

/**
 * Best-effort lookup that tolerates the same slug aliases that exist in
 * replay packs (e.g. "spa-francorchamps" vs "spa"). For calendar entries
 * we use the GP slug exclusively because that's what `seasons.json` keys
 * routes off.
 */
export function listWeekends(season: number): CalendarWeekendEntry[] {
  return calendarManifest.seasons.find((entry) => entry.season === season)?.weekends ?? [];
}
