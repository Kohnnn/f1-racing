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
