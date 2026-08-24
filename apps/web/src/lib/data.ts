import { readFile } from "node:fs/promises";
import path from "node:path";
import { ReplayFrameChunkSchema, ReplayMetaSchema } from "@f1-racing/schemas";
import { z } from "zod";

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
  latest: SessionRef | null;
}

const EvidenceBriefIdSchema = z.enum(["monza-braking", "mexico-aero", "zandvoort-strategy-tyres"]);
const EvidenceBriefHandoffSchema = z.object({
  kind: z.enum(["replay", "learn", "modelview"]),
  href: z.string().min(1),
});
const EvidenceBriefClaimSchema = z.object({
  id: z.string().min(1),
  class: z.enum(["Recorded", "Derived", "Unknown"]),
  statement: z.string().min(1),
  coverage: z.string().min(1),
  uncertainty: z.string().min(1),
});
const EvidenceBriefSchema = z.object({
  id: EvidenceBriefIdSchema,
  title: z.string().min(1),
  subsystem: z.array(z.string().min(1)).min(1),
  question: z.string().min(1),
  learningOutcome: z.string().min(1),
  handoffs: z.array(EvidenceBriefHandoffSchema).min(3),
  evidence: z.array(EvidenceBriefClaimSchema).min(3),
  prohibitedConclusions: z.array(z.string().min(1)).min(1),
});
const EvidenceBriefHandoffs = {
  "monza-braking": [
    { kind: "replay", href: "/replay/2025/italian-grand-prix/qualifying?tab=compare&drivers=VER,NOR#analysis" },
    { kind: "learn", href: "/learn/braking" },
    { kind: "modelview", href: "/cars/current-spec?focus=brakes" },
  ],
  "mexico-aero": [
    { kind: "replay", href: "/replay/2025/mexico-city-grand-prix/race?tab=compare&drivers=NOR,LEC#analysis" },
    { kind: "learn", href: "/learn/aero" },
    { kind: "modelview", href: "/cars/current-spec?focus=rear-wing" },
  ],
  "zandvoort-strategy-tyres": [
    { kind: "replay", href: "/replay/2025/dutch-grand-prix/race?tab=racecontrol#analysis" },
    { kind: "learn", href: "/learn/strategy" },
    { kind: "learn", href: "/learn/tyres" },
    { kind: "modelview", href: "/cars/current-spec?focus=tyres" },
  ],
} as const;
const EvidenceBriefIndexSchema = z.object({
  version: z.literal(1),
  templateVersion: z.literal("evidence-brief-v1"),
  briefs: z.array(EvidenceBriefSchema).min(1),
}).superRefine((value, context) => {
  const actual = value.briefs.map(({ id }) => id);
  const expected = EvidenceBriefIdSchema.options.filter((id) => actual.includes(id));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["briefs"], message: "Evidence briefs are not in canonical order." });
  }
  for (const [index, brief] of value.briefs.entries()) {
    if (JSON.stringify(brief.handoffs) !== JSON.stringify(EvidenceBriefHandoffs[brief.id])) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["briefs", index, "handoffs"], message: "Evidence brief handoffs are not approved." });
    }
  }
});

export type EvidenceBriefId = z.infer<typeof EvidenceBriefIdSchema>;
export type EvidenceBriefHandoff = z.infer<typeof EvidenceBriefHandoffSchema>;
export type EvidenceBriefClaim = z.infer<typeof EvidenceBriefClaimSchema>;
export type EvidenceBrief = z.infer<typeof EvidenceBriefSchema>;
export type EvidenceBriefIndex = z.infer<typeof EvidenceBriefIndexSchema>;

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
    airTempC: number | null;
    trackTempC: number | null;
    rainRiskPct: number | null;
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
  /** Final classification status from session_result, when available. */
  status?: "FINISHED" | "DNF" | "DNS" | "DSQ" | "LAPPED";
  /** Final position from session_result. */
  finalPosition?: number | null;
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
    modelScale?: string;
    heroScale?: string;
    heroCamera?: {
      orbit: string;
      target: string;
      fieldOfView?: string;
      minOrbit?: string;
      maxOrbit?: string;
    };
    notes: string;
  }>;
}

export interface TeamProfile {
  id: string;
  displayName: string;
  fullTeamName: string;
  base: string;
  teamChief: string;
  technicalChief: string;
  powerUnit: string;
  logo: string;
  carImage: string;
  source: {
    label: string;
    url: string;
  };
  drivers: Array<{
    name: string;
    role: string;
    image: string;
    profileUrl: string;
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
  generatedAt?: string;
  modelId: string;
  scenarioId: string;
  displayName?: string;
  metric: string;
  units: string;
  source?: {
    kind: string;
    caseId: string;
    solver: string;
    turbulenceModel: string;
    referencePath: string;
    notes?: string[];
  };
  inputs?: {
    speedMps: number;
    yawDeg: number;
    rideHeightMm: number;
    drsOpen?: boolean;
    groundMode: string;
    wheelMode: string;
  };
  reference?: {
    airDensityKgM3: number;
    areaM2: number;
    lengthM: number;
    pressureReferencePa?: number;
  };
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
    sourceField?: string;
    transform?: string;
    stats: {
      min: number;
      max: number;
      mean: number;
    };
    storage?: {
      format: string;
      path: string;
      valueColumn: string;
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
  artifacts?: {
    streamlineGuidePath?: string;
    forceCoeffsPath?: string;
  };
  summary?: {
    cd?: number;
    cl?: number;
    downforceBalancePct?: number;
  };
}

export interface OpenFoamStarterCase {
  generatedAt: string;
  caseId: string;
  label: string;
  status: string;
  modelId: string;
  glbSourcePath: string;
  casePath: string;
  overlayConfigExamplePath: string;
  recommendedCommand: string;
  solver: string;
  turbulenceModel: string;
  defaults: {
    speedMps: number;
    yawDeg: number;
    rideHeightMm: number;
    groundMode: string;
    wheelMode: string;
  };
  requiredUserInputs: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  outputs: string[];
  notes: string[];
}

const dataRoot = process.env.F1_DATA_ROOT
  ? path.resolve(process.env.F1_DATA_ROOT)
  : path.join(process.cwd(), "public", "data");
const workspaceRoot = path.join(process.cwd(), "..", "..");

async function readJson<T>(relativePath: string): Promise<T> {
  const filePath = path.join(dataRoot, relativePath);
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as T;
}

async function readWorkspaceJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as T;
}

export function sessionBasePath(season: number | string, grandPrix: string, session: string) {
  return path.join("packs", "seasons", String(season), grandPrix, session);
}

export async function getLatestManifest() {
  return readJson<LatestManifest>(path.join("manifests", "latest.json"));
}

export async function getEvidenceBriefIndex() {
  return EvidenceBriefIndexSchema.parse(await readJson<unknown>(path.join("briefs", "index.json")));
}

export async function getSeasonIndex() {
  const index = await readJson<SeasonIndex>(path.join("manifests", "seasons.json"));

  const filteredSeasons = index.seasons
    .map((season) => ({
      ...season,
      grandsPrix: season.grandsPrix.filter((grandPrix) => grandPrix.grandPrixSlug !== "demo-weekend"),
    }))
    .filter((season) => season.grandsPrix.length > 0);

  return {
    ...index,
    seasons: filteredSeasons,
  };
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

export async function getTeamProfile(id: string) {
  return readJson<TeamProfile>(path.join("teams", `${id}.json`));
}

export async function getWindScenarioCatalog() {
  return readJson<WindScenarioCatalog>(path.join("packs", "sims", "fs-cfd-database-source.json"));
}

export async function getOpenFoamStarterCase() {
  return readJson<OpenFoamStarterCase>(path.join("packs", "sims", "openfoam-starter-case.json"));
}

export interface ReplayFrameDriver {
  driverCode: string;
  driverNumber: number;
  team: string;
  position: number;
  x: number | null;
  y: number | null;
  speed: number | null;
  throttle: number | null;
  brake: number | null;
  gear: number | null;
  rpm: number | null;
  drs: number | null;
  lap: number | null;
  interval: number | null;
  tyreCompound: string | null;
  tyreAge: number | null;
  /** Raw OpenF1 GPS coordinates (untransformed), present when GPS is available. */
  rawX?: number | null;
  rawY?: number | null;
  /** "gps" when coordinates come from projected GPS, "synthetic" for the lap-progress fallback. */
  positionSource?: "gps" | "synthetic";
}

export interface ReplayWeatherSample {
  airTempC: number;
  trackTempC: number;
  humidityPct: number;
  rainfall: boolean;
  windSpeedMps: number;
  windDirectionDeg: number;
}

export interface SafetyCar {
  phase: "none" | "deploying" | "on_track" | "returning";
  x: number | null;
  y: number | null;
}

export interface ReplayFrame {
  t: number;
  lap: number | null;
  drivers: Record<string, ReplayFrameDriver>;
  safetyCar: SafetyCar;
  trackStatus: string;
  weather?: ReplayWeatherSample;
}

export interface ReplayRaceControlMessage {
  t: number;
  lapNumber: number | null;
  category: string;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  message: string;
}

export interface ReplayDriver {
  driverCode: string;
  driverNumber: number;
  fullName: string;
  team: string;
  teamColor: string;
}

export interface ReplayLap {
  driverCode: string;
  lapNumber: number;
  lapTime: number | null;
  compound: string | null;
  sector1?: number | null;
  sector2?: number | null;
  sector3?: number | null;
  stintNumber?: number | null;
}

export interface ReplayPack {
  generatedAt: string;
  sessionKey: number;
  season: number;
  grandPrix: string;
  session: string;
  trackId: string;
  source: "openf1" | "fastf1";
  note?: string;
  weatherSummary?: {
    airTempC: number | null;
    trackTempC: number | null;
    rainRiskPct: number | null;
  };
  drivers: ReplayDriver[];
  trackPath: [number, number][] | null;
  trackMetadata?: {
    trackId: string;
    name: string;
    rotationDeg: number;
    length: number;
    corners: Array<{ number: number; letter: string; angleDeg: number; trackPosition: number | null }>;
    drsZones: Array<{ id?: string; from: number; to: number; fromRatio?: number; toRatio?: number }>;
    marshalSectors?: Array<{ index: number; fromDistance: number; toDistance: number; flag?: string | null }>;
    source: string;
  } | null;
  laps: ReplayLap[];
  raceControlMessages?: ReplayRaceControlMessage[];
  totalTime?: number;
  totalLaps?: number;
  fastestLap?: ReplayLap | null;
  frameCount?: number;
  frameChunkSize?: number;
  frameChunks?: string[];
  frameChunkIndex?: Array<{
    index: number;
    fromTime: number;
    toTime: number;
    path: string;
  }>;
  frames: ReplayFrame[];
}

export type ReplayMetaPack = Omit<
  ReplayPack,
  "frames" | "totalTime" | "totalLaps" | "frameCount" | "frameChunkSize" | "frameChunks" | "frameChunkIndex"
> & {
  totalTime: number;
  totalLaps: number;
  frameCount: number;
  frameChunkSize: number;
  frameChunks: string[];
  frameChunkIndex: Array<{
    index: number;
    fromTime: number;
    toTime: number;
    path: string;
  }>;
  frames?: ReplayFrame[];
};

export interface ReplayFrameChunk {
  index: number;
  fromTime: number;
  toTime: number;
  frames: ReplayFrame[];
}

/**
 * Optional richer track metadata exported per session by the FastF1 pipeline.
 * Existing OpenF1 packs do not provide this; the renderer falls back to the
 * dense polyline already in the replay pack.
 */
export interface TrackMetadata {
  trackId: string;
  rotationDeg?: number;
  centerline?: [number, number][];
  innerEdge?: [number, number][];
  outerEdge?: [number, number][];
  corners?: Array<{ number: number; name?: string; distance: number }>;
  marshalSectors?: Array<{ index: number; fromDistance: number; toDistance: number; flag?: string | null }>;
  sectorBoundaries?: Array<{ sector: number; distance: number }>;
  drsZones?: Array<{ id: string; startDistance: number; endDistance: number }>;
  pitEntryDistance?: number;
  pitExitDistance?: number;
}

export async function getReplayMetaPack(season: number | string, grandPrix: string, session: string) {
  const payload = await readJson<unknown>(path.join(sessionBasePath(season, grandPrix, session), "replay.meta.json"));
  return ReplayMetaSchema.parse(payload) as ReplayMetaPack;
}

export async function getReplayFrameChunk(
  season: number | string,
  grandPrix: string,
  session: string,
  chunkEntry: ReplayMetaPack["frameChunkIndex"][number],
) {
  const payload = await readJson<unknown>(path.join(sessionBasePath(season, grandPrix, session), chunkEntry.path));
  const chunk = ReplayFrameChunkSchema.parse(payload) as ReplayFrameChunk;
  const firstTime = chunk.frames[0]?.t;
  const lastTime = chunk.frames.at(-1)?.t;
  if (
    chunk.index !== chunkEntry.index
    || chunk.fromTime !== chunkEntry.fromTime
    || chunk.toTime !== chunkEntry.toTime
    || firstTime !== chunkEntry.fromTime
    || lastTime !== chunkEntry.toTime
  ) {
    throw new Error(`Replay chunk ${chunkEntry.index} does not match its index metadata`);
  }
  return chunk;
}

export async function getReplayLaps(season: number | string, grandPrix: string, session: string) {
  return readJson<ReplayLap[]>(path.join(sessionBasePath(season, grandPrix, session), "replay.laps.json"));
}

export async function getReplayRaceControl(season: number | string, grandPrix: string, session: string) {
  return readJson<ReplayRaceControlMessage[]>(path.join(sessionBasePath(season, grandPrix, session), "replay.race-control.json"));
}
