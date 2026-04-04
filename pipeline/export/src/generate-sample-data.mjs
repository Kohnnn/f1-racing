import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CarModelCatalogSchema,
  CfdOverlaySchemaExampleSchema,
  ComparePackSchema,
  DriverSummarySchema,
  LatestManifestSchema,
  LapRecordSchema,
  OpenFoamStarterCaseSchema,
  ReplayPackSchema,
  SeasonIndexSchema,
  SessionManifestSchema,
  SessionSummarySchema,
  StintPackSchema,
  WindOverlayPackSchema,
} from "../../../packages/schemas/src/index.js";

const root = path.resolve(process.cwd());
const dataRoot = path.join(root, "data");
const publicRoot = path.join(root, "apps", "web", "public", "data");

const sample = {
  ref: {
    season: 2025,
    grandPrixSlug: "demo-weekend",
    sessionSlug: "qualifying",
    grandPrixName: "Demo Weekend",
    sessionName: "Qualifying",
    sessionKey: 9000,
    trackId: "studio-ring",
    path: "/sessions/2025/demo-weekend/qualifying",
  },
  summary: {
    season: 2025,
    grandPrix: "Demo Weekend",
    session: "Qualifying",
    sessionKey: 9000,
    trackId: "studio-ring",
    generatedAt: "2026-03-27T09:00:00Z",
    source: "openf1",
    drivers: ["VER", "NOR", "LEC", "PIA"],
    weatherSummary: {
      airTempC: 24,
      trackTempC: 32,
      rainRiskPct: 18,
    },
  },
  drivers: [
    {
      driverCode: "VER",
      driverNumber: 1,
      fullName: "Max Verstappen",
      team: "Red Bull Racing",
      bestLap: 14,
      bestLapTime: 78.412,
      tyreCompound: "SOFT",
      stintCount: 2,
    },
    {
      driverCode: "NOR",
      driverNumber: 4,
      fullName: "Lando Norris",
      team: "McLaren",
      bestLap: 16,
      bestLapTime: 78.503,
      tyreCompound: "SOFT",
      stintCount: 2,
    },
    {
      driverCode: "LEC",
      driverNumber: 16,
      fullName: "Charles Leclerc",
      team: "Ferrari",
      bestLap: 15,
      bestLapTime: 78.588,
      tyreCompound: "SOFT",
      stintCount: 2,
    },
    {
      driverCode: "PIA",
      driverNumber: 81,
      fullName: "Oscar Piastri",
      team: "McLaren",
      bestLap: 17,
      bestLapTime: 78.640,
      tyreCompound: "SOFT",
      stintCount: 2,
    },
  ],
  laps: [
    { driverCode: "VER", driverNumber: 1, lapNumber: 14, lapTime: 78.412, sector1: 25.101, sector2: 28.203, sector3: 25.108, compound: "SOFT", stint: 2, isFastest: true },
    { driverCode: "NOR", driverNumber: 4, lapNumber: 16, lapTime: 78.503, sector1: 25.139, sector2: 28.231, sector3: 25.133, compound: "SOFT", stint: 2, isFastest: false },
    { driverCode: "LEC", driverNumber: 16, lapNumber: 15, lapTime: 78.588, sector1: 25.180, sector2: 28.254, sector3: 25.154, compound: "SOFT", stint: 2, isFastest: false },
    { driverCode: "PIA", driverNumber: 81, lapNumber: 17, lapTime: 78.640, sector1: 25.210, sector2: 28.248, sector3: 25.182, compound: "SOFT", stint: 2, isFastest: false },
    { driverCode: "VER", driverNumber: 1, lapNumber: 11, lapTime: 78.712, sector1: 25.193, sector2: 28.341, sector3: 25.178, compound: "MEDIUM", stint: 1, isFastest: false },
    { driverCode: "NOR", driverNumber: 4, lapNumber: 12, lapTime: 78.781, sector1: 25.228, sector2: 28.362, sector3: 25.191, compound: "MEDIUM", stint: 1, isFastest: false }
  ],
  compare: {
    trackId: "studio-ring",
    drivers: ["VER", "NOR"],
    laps: [14, 16],
    deltaSections: [
      { from: 0.0, to: 0.18, leader: "VER", deltaMs: 92 },
      { from: 0.18, to: 0.33, leader: "NOR", deltaMs: 41 },
      { from: 0.33, to: 0.62, leader: "VER", deltaMs: 58 },
      { from: 0.62, to: 1.0, leader: "VER", deltaMs: 38 }
    ],
    events: [
      { type: "late_brake", driver: "VER", corner: 3, note: "VER keeps a later brake point into Turn 3 without destabilizing the exit." },
      { type: "better_exit", driver: "NOR", corner: 4, note: "NOR recovers a little time on throttle pick-up out of Turn 4." },
      { type: "high_speed_commitment", driver: "VER", corner: 9, note: "VER carries more confidence through the loaded middle of the lap." }
    ],
    telemetry: {
      left: {
        driverCode: "VER",
        lapNumber: 14,
        sampleHz: 3.7,
        points: [
          { ratio: 0, speed: 112, throttle: 100, brake: 0, gear: 3, rpm: 9500, drs: 0 },
          { ratio: 0.08, speed: 188, throttle: 100, brake: 0, gear: 5, rpm: 11200, drs: 0 },
          { ratio: 0.16, speed: 286, throttle: 100, brake: 0, gear: 8, rpm: 11850, drs: 12 },
          { ratio: 0.24, speed: 322, throttle: 100, brake: 0, gear: 8, rpm: 12100, drs: 12 },
          { ratio: 0.32, speed: 262, throttle: 24, brake: 100, gear: 6, rpm: 10420, drs: 0 },
          { ratio: 0.4, speed: 168, throttle: 42, brake: 46, gear: 4, rpm: 9450, drs: 0 },
          { ratio: 0.48, speed: 204, throttle: 72, brake: 0, gear: 5, rpm: 10180, drs: 0 },
          { ratio: 0.56, speed: 244, throttle: 88, brake: 0, gear: 6, rpm: 10810, drs: 0 },
          { ratio: 0.64, speed: 278, throttle: 96, brake: 0, gear: 7, rpm: 11420, drs: 10 },
          { ratio: 0.72, speed: 314, throttle: 100, brake: 0, gear: 8, rpm: 12020, drs: 12 },
          { ratio: 0.8, speed: 236, throttle: 12, brake: 100, gear: 5, rpm: 9860, drs: 0 },
          { ratio: 0.88, speed: 176, throttle: 56, brake: 0, gear: 4, rpm: 9440, drs: 0 },
          { ratio: 0.96, speed: 232, throttle: 86, brake: 0, gear: 6, rpm: 10890, drs: 0 },
          { ratio: 1, speed: 248, throttle: 100, brake: 0, gear: 7, rpm: 11280, drs: 0 }
        ]
      },
      right: {
        driverCode: "NOR",
        lapNumber: 16,
        sampleHz: 3.7,
        points: [
          { ratio: 0, speed: 110, throttle: 100, brake: 0, gear: 3, rpm: 9400, drs: 0 },
          { ratio: 0.08, speed: 184, throttle: 100, brake: 0, gear: 5, rpm: 11050, drs: 0 },
          { ratio: 0.16, speed: 282, throttle: 100, brake: 0, gear: 8, rpm: 11710, drs: 12 },
          { ratio: 0.24, speed: 318, throttle: 100, brake: 0, gear: 8, rpm: 11980, drs: 12 },
          { ratio: 0.32, speed: 258, throttle: 28, brake: 94, gear: 6, rpm: 10310, drs: 0 },
          { ratio: 0.4, speed: 172, throttle: 48, brake: 40, gear: 4, rpm: 9520, drs: 0 },
          { ratio: 0.48, speed: 208, throttle: 74, brake: 0, gear: 5, rpm: 10340, drs: 0 },
          { ratio: 0.56, speed: 248, throttle: 90, brake: 0, gear: 6, rpm: 10920, drs: 0 },
          { ratio: 0.64, speed: 282, throttle: 100, brake: 0, gear: 7, rpm: 11520, drs: 10 },
          { ratio: 0.72, speed: 317, throttle: 100, brake: 0, gear: 8, rpm: 12080, drs: 12 },
          { ratio: 0.8, speed: 242, throttle: 16, brake: 100, gear: 5, rpm: 9940, drs: 0 },
          { ratio: 0.88, speed: 182, throttle: 60, brake: 0, gear: 4, rpm: 9580, drs: 0 },
          { ratio: 0.96, speed: 238, throttle: 90, brake: 0, gear: 6, rpm: 10980, drs: 0 },
          { ratio: 1, speed: 252, throttle: 100, brake: 0, gear: 7, rpm: 11360, drs: 0 }
        ]
      }
    },
    annotations: [
      {
        id: "corner-window-1",
        label: "S1",
        from: 0,
        to: 0.18,
        leader: "VER",
        summary: "VER owns the first window overall. VER carries the later brake point, while NOR reaches throttle earlier on exit.",
        metrics: {
          left: { brakePointRatio: 0.032, minSpeed: 168, throttlePickupRatio: 0.048 },
          right: { brakePointRatio: 0.031, minSpeed: 172, throttlePickupRatio: 0.05 }
        }
      },
      {
        id: "corner-window-2",
        label: "S2",
        from: 0.18,
        to: 0.33,
        leader: "NOR",
        summary: "NOR wins the middle window by getting back to throttle sooner after the minimum speed event.",
        metrics: {
          left: { brakePointRatio: 0.2, minSpeed: 154, throttlePickupRatio: 0.228 },
          right: { brakePointRatio: 0.196, minSpeed: 158, throttlePickupRatio: 0.221 }
        }
      },
      {
        id: "corner-window-3",
        label: "S3",
        from: 0.33,
        to: 0.62,
        leader: "VER",
        summary: "VER takes back the final major loaded sequence with a lower minimum speed penalty and cleaner throttle pick-up.",
        metrics: {
          left: { brakePointRatio: 0.388, minSpeed: 176, throttlePickupRatio: 0.436 },
          right: { brakePointRatio: 0.39, minSpeed: 182, throttlePickupRatio: 0.448 }
        }
      }
    ]
  },
  strategy: {
    trackId: "studio-ring",
    pitLossS: 20.8,
    safetyCarPitLossS: 11.4,
    recommendedWindows: [
      { lapStart: 17, lapEnd: 21, reason: "medium-to-hard undercut window" },
      { lapStart: 24, lapEnd: 28, reason: "safer one-stop if degradation stays controlled" }
    ],
    weatherCrossover: {
      toIntermediate: 0.61,
      toWet: 0.79
    }
  },
  stints: {
    trackId: "studio-ring",
    sessionKey: 9000,
    drivers: [
      {
        driverCode: "VER",
        team: "Red Bull Racing",
        stints: [
          {
            stintNumber: 1,
            compound: "MEDIUM",
            lapStart: 1,
            lapEnd: 11,
            tyreAgeAtStart: 2,
            averageLapTime: 78.712,
            trendPerLap: 0.081,
            lapTimes: [78.48, 78.55, 78.6, 78.66, 78.71, 78.78, 78.84, 78.89, 78.97, 79.02, 79.11]
          },
          {
            stintNumber: 2,
            compound: "SOFT",
            lapStart: 12,
            lapEnd: 18,
            tyreAgeAtStart: 0,
            averageLapTime: 78.43,
            trendPerLap: 0.056,
            lapTimes: [78.41, 78.39, 78.412, 78.46, 78.5, 78.56, 78.58]
          }
        ]
      },
      {
        driverCode: "NOR",
        team: "McLaren",
        stints: [
          {
            stintNumber: 1,
            compound: "MEDIUM",
            lapStart: 1,
            lapEnd: 12,
            tyreAgeAtStart: 2,
            averageLapTime: 78.781,
            trendPerLap: 0.074,
            lapTimes: [78.57, 78.61, 78.63, 78.69, 78.74, 78.78, 78.82, 78.89, 78.94, 79.0, 79.05, 79.11]
          },
          {
            stintNumber: 2,
            compound: "SOFT",
            lapStart: 13,
            lapEnd: 19,
            tyreAgeAtStart: 0,
            averageLapTime: 78.49,
            trendPerLap: 0.043,
            lapTimes: [78.47, 78.45, 78.44, 78.503, 78.51, 78.56, 78.57]
          }
        ]
      }
    ]
  },
  replay: {
    generatedAt: "2026-03-27T09:00:00Z",
    sessionKey: 9000,
    season: 2025,
    grandPrix: "Demo Weekend",
    session: "Qualifying",
    trackId: "studio-ring",
    source: "openf1",
    note: "Sample replay pack with inline compare and stint signals for the replay-first UI.",
    weatherSummary: {
      airTempC: 24,
      trackTempC: 32,
      rainRiskPct: 18,
    },
    drivers: [
      { driverCode: "VER", driverNumber: 1, fullName: "Max Verstappen", team: "Red Bull Racing", teamColor: "#3671C6" },
      { driverCode: "NOR", driverNumber: 4, fullName: "Lando Norris", team: "McLaren", teamColor: "#FF8000" },
      { driverCode: "LEC", driverNumber: 16, fullName: "Charles Leclerc", team: "Ferrari", teamColor: "#E8002D" },
      { driverCode: "PIA", driverNumber: 81, fullName: "Oscar Piastri", team: "McLaren", teamColor: "#FF8000" },
    ],
    trackPath: [
      [0, -260],
      [220, -240],
      [360, -120],
      [380, 80],
      [220, 220],
      [0, 250],
      [-240, 200],
      [-360, 60],
      [-320, -120],
      [-160, -230],
      [0, -260],
    ],
    laps: [
      { driverCode: "VER", lapNumber: 14, lapTime: 78.412, compound: "SOFT" },
      { driverCode: "NOR", lapNumber: 16, lapTime: 78.503, compound: "SOFT" },
      { driverCode: "LEC", lapNumber: 15, lapTime: 78.588, compound: "SOFT" },
      { driverCode: "PIA", lapNumber: 17, lapTime: 78.64, compound: "SOFT" },
    ],
    raceControlMessages: [
      { t: 0, lapNumber: 13, category: "Flag", flag: "GREEN", scope: "Track", sector: null, message: "GREEN LIGHT - PIT EXIT OPEN" },
      { t: 44, lapNumber: 14, category: "Flag", flag: "YELLOW", scope: "Sector", sector: 2, message: "YELLOW IN TRACK SECTOR 2" },
      { t: 58, lapNumber: 14, category: "Flag", flag: "CLEAR", scope: "Sector", sector: 2, message: "CLEAR IN TRACK SECTOR 2" },
    ],
    frames: [
      {
        t: 0,
        lap: 13,
        trackStatus: "GREEN",
        safetyCar: { phase: "none", x: null, y: null },
        weather: { airTempC: 24, trackTempC: 32, humidityPct: 46, rainfall: false, windSpeedMps: 3.1, windDirectionDeg: 115 },
        drivers: {
          VER: { driverCode: "VER", driverNumber: 1, team: "Red Bull Racing", position: 1, x: -320, y: -120, speed: 286, throttle: 100, brake: 0, gear: 8, rpm: 12100, drs: 12, lap: 13, interval: 0, tyreCompound: "SOFT", tyreAge: 2 },
          NOR: { driverCode: "NOR", driverNumber: 4, team: "McLaren", position: 2, x: -250, y: -170, speed: 281, throttle: 100, brake: 0, gear: 8, rpm: 11940, drs: 12, lap: 13, interval: 0.412, tyreCompound: "SOFT", tyreAge: 1 },
          LEC: { driverCode: "LEC", driverNumber: 16, team: "Ferrari", position: 3, x: -210, y: -195, speed: 276, throttle: 100, brake: 0, gear: 8, rpm: 11820, drs: 10, lap: 13, interval: 0.866, tyreCompound: "SOFT", tyreAge: 1 },
          PIA: { driverCode: "PIA", driverNumber: 81, team: "McLaren", position: 4, x: -160, y: -225, speed: 274, throttle: 98, brake: 0, gear: 8, rpm: 11760, drs: 10, lap: 13, interval: 1.124, tyreCompound: "SOFT", tyreAge: 0 },
        },
      },
      {
        t: 12,
        lap: 14,
        trackStatus: "GREEN",
        safetyCar: { phase: "none", x: null, y: null },
        weather: { airTempC: 24, trackTempC: 31, humidityPct: 47, rainfall: false, windSpeedMps: 2.9, windDirectionDeg: 122 },
        drivers: {
          VER: { driverCode: "VER", driverNumber: 1, team: "Red Bull Racing", position: 1, x: -40, y: -248, speed: 192, throttle: 76, brake: 0, gear: 5, rpm: 10320, drs: 0, lap: 14, interval: 0, tyreCompound: "SOFT", tyreAge: 3 },
          NOR: { driverCode: "NOR", driverNumber: 4, team: "McLaren", position: 2, x: -92, y: -242, speed: 188, throttle: 72, brake: 0, gear: 5, rpm: 10140, drs: 0, lap: 14, interval: 0.367, tyreCompound: "SOFT", tyreAge: 2 },
          LEC: { driverCode: "LEC", driverNumber: 16, team: "Ferrari", position: 3, x: -138, y: -234, speed: 182, throttle: 68, brake: 0, gear: 5, rpm: 9920, drs: 0, lap: 14, interval: 0.812, tyreCompound: "SOFT", tyreAge: 2 },
          PIA: { driverCode: "PIA", driverNumber: 81, team: "McLaren", position: 4, x: -178, y: -224, speed: 180, throttle: 66, brake: 0, gear: 5, rpm: 9860, drs: 0, lap: 14, interval: 1.093, tyreCompound: "SOFT", tyreAge: 1 },
        },
      },
      {
        t: 28,
        lap: 14,
        trackStatus: "YELLOW",
        safetyCar: { phase: "none", x: null, y: null },
        weather: { airTempC: 23, trackTempC: 31, humidityPct: 49, rainfall: false, windSpeedMps: 2.1, windDirectionDeg: 136 },
        drivers: {
          VER: { driverCode: "VER", driverNumber: 1, team: "Red Bull Racing", position: 1, x: 220, y: -240, speed: 142, throttle: 38, brake: 52, gear: 4, rpm: 8420, drs: 0, lap: 14, interval: 0, tyreCompound: "SOFT", tyreAge: 3 },
          NOR: { driverCode: "NOR", driverNumber: 4, team: "McLaren", position: 2, x: 176, y: -230, speed: 147, throttle: 44, brake: 48, gear: 4, rpm: 8560, drs: 0, lap: 14, interval: 0.284, tyreCompound: "SOFT", tyreAge: 2 },
          LEC: { driverCode: "LEC", driverNumber: 16, team: "Ferrari", position: 3, x: 128, y: -215, speed: 138, throttle: 34, brake: 58, gear: 4, rpm: 8240, drs: 0, lap: 14, interval: 0.676, tyreCompound: "SOFT", tyreAge: 2 },
          PIA: { driverCode: "PIA", driverNumber: 81, team: "McLaren", position: 4, x: 94, y: -204, speed: 136, throttle: 32, brake: 62, gear: 4, rpm: 8100, drs: 0, lap: 14, interval: 0.904, tyreCompound: "SOFT", tyreAge: 1 },
        },
      },
      {
        t: 44,
        lap: 14,
        trackStatus: "GREEN",
        safetyCar: { phase: "none", x: null, y: null },
        weather: { airTempC: 23, trackTempC: 30, humidityPct: 50, rainfall: false, windSpeedMps: 1.7, windDirectionDeg: 148 },
        drivers: {
          VER: { driverCode: "VER", driverNumber: 1, team: "Red Bull Racing", position: 1, x: 350, y: 30, speed: 228, throttle: 84, brake: 0, gear: 6, rpm: 10840, drs: 0, lap: 14, interval: 0, tyreCompound: "SOFT", tyreAge: 3 },
          NOR: { driverCode: "NOR", driverNumber: 4, team: "McLaren", position: 2, x: 320, y: 6, speed: 232, throttle: 90, brake: 0, gear: 6, rpm: 11020, drs: 0, lap: 14, interval: 0.198, tyreCompound: "SOFT", tyreAge: 2 },
          LEC: { driverCode: "LEC", driverNumber: 16, team: "Ferrari", position: 3, x: 286, y: -16, speed: 221, throttle: 80, brake: 0, gear: 6, rpm: 10510, drs: 0, lap: 14, interval: 0.612, tyreCompound: "SOFT", tyreAge: 2 },
          PIA: { driverCode: "PIA", driverNumber: 81, team: "McLaren", position: 4, x: 254, y: -34, speed: 218, throttle: 78, brake: 0, gear: 6, rpm: 10380, drs: 0, lap: 14, interval: 0.883, tyreCompound: "SOFT", tyreAge: 1 },
        },
      },
      {
        t: 62,
        lap: 15,
        trackStatus: "GREEN",
        safetyCar: { phase: "none", x: null, y: null },
        weather: { airTempC: 22, trackTempC: 30, humidityPct: 52, rainfall: false, windSpeedMps: 1.2, windDirectionDeg: 159 },
        drivers: {
          VER: { driverCode: "VER", driverNumber: 1, team: "Red Bull Racing", position: 1, x: 150, y: 228, speed: 264, throttle: 100, brake: 0, gear: 7, rpm: 11540, drs: 8, lap: 15, interval: 0, tyreCompound: "SOFT", tyreAge: 4 },
          NOR: { driverCode: "NOR", driverNumber: 4, team: "McLaren", position: 2, x: 110, y: 234, speed: 266, throttle: 100, brake: 0, gear: 7, rpm: 11620, drs: 8, lap: 15, interval: 0.154, tyreCompound: "SOFT", tyreAge: 3 },
          LEC: { driverCode: "LEC", driverNumber: 16, team: "Ferrari", position: 3, x: 68, y: 242, speed: 258, throttle: 98, brake: 0, gear: 7, rpm: 11380, drs: 8, lap: 15, interval: 0.498, tyreCompound: "SOFT", tyreAge: 3 },
          PIA: { driverCode: "PIA", driverNumber: 81, team: "McLaren", position: 4, x: 32, y: 246, speed: 254, throttle: 96, brake: 0, gear: 7, rpm: 11240, drs: 8, lap: 15, interval: 0.744, tyreCompound: "SOFT", tyreAge: 2 },
        },
      },
      {
        t: 78,
        lap: 16,
        trackStatus: "CHEQUERED",
        safetyCar: { phase: "none", x: null, y: null },
        weather: { airTempC: 22, trackTempC: 29, humidityPct: 54, rainfall: false, windSpeedMps: 0.8, windDirectionDeg: 171 },
        drivers: {
          VER: { driverCode: "VER", driverNumber: 1, team: "Red Bull Racing", position: 1, x: -84, y: 234, speed: 248, throttle: 100, brake: 0, gear: 7, rpm: 11260, drs: 0, lap: 16, interval: 0, tyreCompound: "SOFT", tyreAge: 5 },
          NOR: { driverCode: "NOR", driverNumber: 4, team: "McLaren", position: 2, x: -122, y: 224, speed: 246, throttle: 100, brake: 0, gear: 7, rpm: 11180, drs: 0, lap: 16, interval: 0.091, tyreCompound: "SOFT", tyreAge: 4 },
          LEC: { driverCode: "LEC", driverNumber: 16, team: "Ferrari", position: 3, x: -162, y: 210, speed: 242, throttle: 98, brake: 0, gear: 7, rpm: 11060, drs: 0, lap: 16, interval: 0.411, tyreCompound: "SOFT", tyreAge: 4 },
          PIA: { driverCode: "PIA", driverNumber: 81, team: "McLaren", position: 4, x: -204, y: 194, speed: 239, throttle: 96, brake: 0, gear: 7, rpm: 10940, drs: 0, lap: 16, interval: 0.638, tyreCompound: "SOFT", tyreAge: 3 },
        },
      },
    ],
  },
};

function ensureValid() {
  LatestManifestSchema.parse({
    version: 1,
    seasons: [sample.ref.season],
    latest: sample.ref,
  });
  SeasonIndexSchema.parse({
    generatedAt: sample.summary.generatedAt,
    seasons: [
      {
        season: sample.ref.season,
        grandsPrix: [
          {
            grandPrixSlug: sample.ref.grandPrixSlug,
            grandPrixName: sample.ref.grandPrixName,
            sessions: [sample.ref],
          },
        ],
      },
    ],
  });
  SessionSummarySchema.parse(sample.summary);
  sample.drivers.forEach((driver) => DriverSummarySchema.parse(driver));
  sample.laps.forEach((lap) => LapRecordSchema.parse(lap));
  ComparePackSchema.parse(sample.compare);
  StintPackSchema.parse(sample.stints);
  ReplayPackSchema.parse(sample.replay);
  SessionManifestSchema.parse({
    sessionKey: sample.ref.sessionKey,
    summary: "summary.json",
    drivers: "drivers.json",
    laps: "laps.json",
    replay: "replay.json",
    compare: {
      "VER-NOR": "compare/ver-nor.json",
    },
    strategy: "strategy.json",
    stints: "stints.json",
  });
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function writeMirrored(relativePath, payload) {
  await writeJson(path.join(dataRoot, relativePath), payload);
  await writeJson(path.join(publicRoot, relativePath), payload);
}

async function readAvailablePackRefs() {
  const seasonsDir = path.join(dataRoot, "packs", "seasons");
  let seasonEntries = [];
  try {
    seasonEntries = await readdir(seasonsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const refs = [];
  for (const seasonEntry of seasonEntries) {
    if (!seasonEntry.isDirectory()) {
      continue;
    }
    const seasonDir = path.join(seasonsDir, seasonEntry.name);
    const grandPrixEntries = await readdir(seasonDir, { withFileTypes: true });
    for (const grandPrixEntry of grandPrixEntries) {
      if (!grandPrixEntry.isDirectory()) {
        continue;
      }
      const grandPrixDir = path.join(seasonDir, grandPrixEntry.name);
      const sessionEntries = await readdir(grandPrixDir, { withFileTypes: true });
      for (const sessionEntry of sessionEntries) {
        if (!sessionEntry.isDirectory()) {
          continue;
        }
        const sessionDir = path.join(grandPrixDir, sessionEntry.name);
        const summaryPath = path.join(sessionDir, "summary.json");
        try {
          const summary = JSON.parse(await readFile(summaryPath, "utf-8"));
          refs.push({
            season: Number(summary.season),
            grandPrixSlug: grandPrixEntry.name,
            sessionSlug: sessionEntry.name,
            grandPrixName: summary.grandPrix,
            sessionName: summary.session,
            sessionKey: Number(summary.sessionKey),
            trackId: summary.trackId,
            path: `/sessions/${summary.season}/${grandPrixEntry.name}/${sessionEntry.name}`,
          });
        } catch {
          // ignore incomplete packs
        }
      }
    }
  }

  return refs.sort((left, right) => {
    if (left.season !== right.season) {
      return left.season - right.season;
    }
    return left.sessionKey - right.sessionKey;
  });
}

function pickShowcaseRef(refs) {
  const showcase = refs.find(
    (ref) => ref.season === 2025 && ref.grandPrixSlug === "abu-dhabi-grand-prix" && ref.sessionSlug === "race",
  );

  if (showcase) {
    return showcase;
  }

  return refs.at(-1) ?? sample.ref;
}

function getIndexedRefs(refs) {
  const visibleRefs = refs.filter((ref) => ref.grandPrixSlug !== "demo-weekend");
  return visibleRefs.length ? visibleRefs : refs;
}

async function syncDirectory(sourceDir, destinationDir) {
  await mkdir(destinationDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = path.join(sourceDir, entry.name);
      const destinationPath = path.join(destinationDir, entry.name);

      if (entry.isDirectory()) {
        await syncDirectory(sourcePath, destinationPath);
        return;
      }

      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);
    })
  );
}

async function generate() {
  ensureValid();

  const sessionManifest = {
    sessionKey: sample.ref.sessionKey,
    summary: "summary.json",
    drivers: "drivers.json",
    laps: "laps.json",
    replay: "replay.json",
    compare: {
      "VER-NOR": "compare/ver-nor.json",
    },
    strategy: "strategy.json",
    stints: "stints.json",
  };

  const base = path.join("packs", "seasons", String(sample.ref.season), sample.ref.grandPrixSlug, sample.ref.sessionSlug);
  await writeMirrored(path.join(base, "manifest.json"), sessionManifest);
  await writeMirrored(path.join(base, "summary.json"), sample.summary);
  await writeMirrored(path.join(base, "drivers.json"), sample.drivers);
  await writeMirrored(path.join(base, "laps.json"), sample.laps);
  await writeMirrored(path.join(base, "replay.json"), sample.replay);
  await writeMirrored(path.join(base, "compare", "ver-nor.json"), sample.compare);
  await writeMirrored(path.join(base, "strategy.json"), sample.strategy);
  await writeMirrored(path.join(base, "stints.json"), sample.stints);

  const refs = await readAvailablePackRefs();
  const indexedRefs = getIndexedRefs(refs);
  const showcaseRef = pickShowcaseRef(indexedRefs);
  const latest = {
    version: 1,
    seasons: Array.from(new Set(indexedRefs.map((ref) => ref.season))),
    latest: showcaseRef,
  };

  const seasons = {
    generatedAt: sample.summary.generatedAt,
    seasons: Array.from(new Set(indexedRefs.map((ref) => ref.season))).map((season) => {
      const seasonRefs = indexedRefs.filter((ref) => ref.season === season);
      const grandsPrix = Array.from(new Set(seasonRefs.map((ref) => ref.grandPrixSlug))).map((grandPrixSlug) => {
        const grandPrixRefs = seasonRefs.filter((ref) => ref.grandPrixSlug === grandPrixSlug);
        return {
          grandPrixSlug,
          grandPrixName: grandPrixRefs[0]?.grandPrixName || grandPrixSlug,
          sessions: grandPrixRefs,
        };
      });
      return {
        season,
        grandsPrix,
      };
    }),
  };

  await writeMirrored(path.join("manifests", "latest.json"), latest);
  await writeMirrored(path.join("manifests", "seasons.json"), seasons);
}

async function check() {
  const filePath = path.join(dataRoot, "manifests", "latest.json");
  const content = JSON.parse(await readFile(filePath, "utf-8"));
  LatestManifestSchema.parse(content);

  const staticValidations = [
    [path.join("packs", "cars", "catalog.json"), CarModelCatalogSchema],
    [path.join("packs", "sims", "fs-cfd-database-source.json"), WindOverlayPackSchema],
    [path.join("packs", "sims", "f1-cfd-overlay.schema.example.json"), CfdOverlaySchemaExampleSchema],
    [path.join("packs", "sims", "openfoam-starter-case.json"), OpenFoamStarterCaseSchema],
  ];

  for (const [relativePath, schema] of staticValidations) {
    const payload = JSON.parse(await readFile(path.join(dataRoot, relativePath), "utf-8"));
    schema.parse(payload);
  }

  process.stdout.write("Sample data manifests and sim packs validated.\n");
}

async function main() {
  const mode = process.argv.includes("--check") ? "check" : "generate";

  if (mode === "generate") {
    await rm(publicRoot, { recursive: true, force: true });
    await mkdir(publicRoot, { recursive: true });
    await generate();
    await syncDirectory(dataRoot, publicRoot);
    process.stdout.write("Sample OpenF1-style packs generated.\n");
    return;
  }

  await check();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
