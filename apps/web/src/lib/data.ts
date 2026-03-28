import { readFile } from "node:fs/promises";
import path from "node:path";

export interface SessionRef {
  season: number;
  grandPrixSlug: string;
  sessionSlug: string;
  grandPrixName: string;
  sessionName: string;
  sessionKey: number;
  trackId: string;
  path: string;
}

export interface LatestManifest {
  version: number;
  seasons: number[];
  latest: SessionRef;
}

export interface SeasonIndex {
  generatedAt: string;
  seasons: Array<{
    season: number;
    grandsPrix: Array<{
      grandPrixSlug: string;
      grandPrixName: string;
      sessions: SessionRef[];
    }>;
  }>;
}

export interface SessionSummary {
  season: number;
  grandPrix: string;
  session: string;
  sessionKey: number;
  trackId: string;
  generatedAt: string;
  source: "openf1";
  drivers: string[];
  weatherSummary: {
    airTempC: number;
    trackTempC: number;
    rainRiskPct: number;
  };
}

export interface DriverSummary {
  driverCode: string;
  driverNumber: number;
  fullName: string;
  team: string;
  bestLap: number;
  bestLapTime: number;
  tyreCompound: string;
  stintCount: number;
}

export interface LapRecord {
  driverCode: string;
  driverNumber: number;
  lapNumber: number;
  lapTime: number;
  sector1: number;
  sector2: number;
  sector3: number;
  compound: string;
  stint: number;
  isFastest: boolean;
}

export interface ComparePack {
  trackId: string;
  drivers: [string, string];
  laps: [number, number];
  deltaSections: Array<{
    from: number;
    to: number;
    leader: string;
    deltaMs: number;
  }>;
  events: Array<{
    type: string;
    driver: string;
    corner: string | number;
    note?: string;
  }>;
  telemetry?: {
    left: {
      driverCode: string;
      lapNumber: number;
      sampleHz: number;
      points: Array<{
        ratio: number;
        speed: number;
        throttle: number;
        brake: number;
        gear: number | null;
        rpm: number | null;
        drs: number | null;
      }>;
    };
    right: {
      driverCode: string;
      lapNumber: number;
      sampleHz: number;
      points: Array<{
        ratio: number;
        speed: number;
        throttle: number;
        brake: number;
        gear: number | null;
        rpm: number | null;
        drs: number | null;
      }>;
    };
  };
  annotations?: Array<{
    id: string;
    label: string;
    from: number;
    to: number;
    leader: string;
    summary: string;
    metrics: {
      left: {
        brakePointRatio: number | null;
        minSpeed: number;
        throttlePickupRatio: number | null;
      };
      right: {
        brakePointRatio: number | null;
        minSpeed: number;
        throttlePickupRatio: number | null;
      };
    };
  }>;
}

export interface StrategyPack {
  trackId: string;
  pitLossS: number;
  safetyCarPitLossS: number;
  recommendedWindows: Array<{
    lapStart: number;
    lapEnd: number;
    reason: string;
  }>;
  weatherCrossover: {
    toIntermediate: number;
    toWet: number;
  };
}

export interface StintPack {
  trackId: string;
  sessionKey: number;
  drivers: Array<{
    driverCode: string;
    team: string;
    stints: Array<{
      stintNumber: number;
      compound: string;
      lapStart: number;
      lapEnd: number;
      tyreAgeAtStart: number;
      averageLapTime: number;
      trendPerLap: number;
      lapTimes: number[];
    }>;
  }>;
}

export interface SessionManifest {
  sessionKey: number;
  summary: string;
  drivers: string;
  laps: string;
  compare: Record<string, string>;
  strategy: string;
  stints?: string;
}

export interface OpenF1SeasonManifest {
  generatedAt: string;
  source: "openf1";
  year: number;
  latest: (SessionRef & {
    startDate: string;
    endDate: string;
    countryName: string;
    location: string;
    source: "openf1";
    buildReady: boolean;
  }) | null;
  grandsPrix: Array<{
    grandPrixSlug: string;
    grandPrixName: string;
    countryName: string;
    circuitShortName: string;
    meetingKey: number;
    sessions: Array<SessionRef & {
      startDate: string;
      endDate: string;
      countryName: string;
      location: string;
      source: "openf1";
      buildReady: boolean;
    }>;
  }>;
}

export interface CarModelCatalog {
  generatedAt: string;
  models: Array<{
    id: string;
    constructor: string;
    constructorSlug: string;
      season: number;
      displayName: string;
      file: string;
      poster: string;
      sizeLabel: string;
      surfaceReady: boolean;
      notes: string;
  }>;
}

export interface WindScenarioCatalog {
  generatedAt: string;
  source: {
    name: string;
    repository: string;
    type: string;
    feasibleForPrototype: boolean;
    directF1OverlayReady: boolean;
    notes: string[];
  };
  scenarios: Array<{
    id: string;
    label: string;
    type: string;
    status: string;
    meshCells: number | number[];
    fields: string[];
    surfaceReady: boolean;
    velocityRangeMps?: [number, number];
  }>;
  integrationPlan: {
    recommendedFlow: string[];
    appTargets: string[];
  };
}

export interface WindOverlaySchemaExample {
  schemaVersion: number;
  modelId: string;
  scenarioId: string;
  metric: string;
  units: string;
  meshBinding: {
    renderMeshId: string;
    mappingMode: string;
    triangleCount: number;
  };
  colorScale: {
    min: number;
    max: number;
    palette: string[];
  };
  scalarFields: Array<{
    name: string;
    domain: string;
    stats: {
      min: number;
      max: number;
      mean: number;
    };
  }>;
  overlays: {
    streamlines: Array<{
      id: string;
      color: string;
      count: number;
    }>;
    hotspots: Array<{
      id: string;
      label: string;
      field: string;
      value: number;
    }>;
  };
}

const dataRoot = path.join(process.cwd(), "public", "data");

async function readJson<T>(relativePath: string): Promise<T> {
  const filePath = path.join(dataRoot, relativePath);
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as T;
}

export function sessionBasePath(season: number | string, grandPrix: string, session: string) {
  return path.join("packs", "seasons", String(season), grandPrix, session);
}

export async function getLatestManifest() {
  return readJson<LatestManifest>(path.join("manifests", "latest.json"));
}

export async function getSeasonIndex() {
  return readJson<SeasonIndex>(path.join("manifests", "seasons.json"));
}

export async function getSessionManifest(season: number | string, grandPrix: string, session: string) {
  return readJson<SessionManifest>(path.join(sessionBasePath(season, grandPrix, session), "manifest.json"));
}

export async function getSessionSummary(season: number | string, grandPrix: string, session: string) {
  return readJson<SessionSummary>(path.join(sessionBasePath(season, grandPrix, session), "summary.json"));
}

export async function getDriverSummaries(season: number | string, grandPrix: string, session: string) {
  return readJson<DriverSummary[]>(path.join(sessionBasePath(season, grandPrix, session), "drivers.json"));
}

export async function getLapRecords(season: number | string, grandPrix: string, session: string) {
  return readJson<LapRecord[]>(path.join(sessionBasePath(season, grandPrix, session), "laps.json"));
}

export async function getComparePack(season: number | string, grandPrix: string, session: string, key: string) {
  return readJson<ComparePack>(path.join(sessionBasePath(season, grandPrix, session), "compare", `${key}.json`));
}

export async function getStrategyPack(season: number | string, grandPrix: string, session: string) {
  return readJson<StrategyPack>(path.join(sessionBasePath(season, grandPrix, session), "strategy.json"));
}

export async function getStintPack(season: number | string, grandPrix: string, session: string) {
  return readJson<StintPack>(path.join(sessionBasePath(season, grandPrix, session), "stints.json"));
}

export async function getOpenF1SeasonManifest() {
  return readJson<OpenF1SeasonManifest>(path.join("manifests", "openf1-2025-season.json"));
}

export async function getCarModelCatalog() {
  return readJson<CarModelCatalog>(path.join("packs", "cars", "catalog.json"));
}

export async function getWindScenarioCatalog() {
  return readJson<WindScenarioCatalog>(path.join("packs", "sims", "fs-cfd-database-source.json"));
}

export async function getWindOverlaySchemaExample() {
  return readJson<WindOverlaySchemaExample>(path.join("packs", "sims", "f1-cfd-overlay.schema.example.json"));
}
