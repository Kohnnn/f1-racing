import { z } from "zod";

export const SessionRefSchema = z.object({
  season: z.number().int(),
  grandPrixSlug: z.string(),
  sessionSlug: z.string(),
  grandPrixName: z.string(),
  sessionName: z.string(),
  sessionKey: z.number().int(),
  trackId: z.string(),
  path: z.string(),
});

export const LatestManifestSchema = z.object({
  version: z.number().int(),
  seasons: z.array(z.number().int()),
  latest: SessionRefSchema,
});

export const SeasonIndexSchema = z.object({
  generatedAt: z.string(),
  seasons: z.array(
    z.object({
      season: z.number().int(),
      grandsPrix: z.array(
        z.object({
          grandPrixSlug: z.string(),
          grandPrixName: z.string(),
          sessions: z.array(SessionRefSchema),
        })
      ),
    })
  ),
});

export const SessionSummarySchema = z.object({
  season: z.number().int(),
  grandPrix: z.string(),
  session: z.string(),
  sessionKey: z.number().int(),
  trackId: z.string(),
  generatedAt: z.string(),
  source: z.literal("openf1"),
  drivers: z.array(z.string()),
  weatherSummary: z.object({
    airTempC: z.number(),
    trackTempC: z.number(),
    rainRiskPct: z.number(),
  }),
});

export const DriverSummarySchema = z.object({
  driverCode: z.string(),
  driverNumber: z.number().int(),
  fullName: z.string(),
  team: z.string(),
  bestLap: z.number().int(),
  bestLapTime: z.number(),
  tyreCompound: z.string(),
  stintCount: z.number().int(),
});

export const LapRecordSchema = z.object({
  driverCode: z.string(),
  driverNumber: z.number().int(),
  lapNumber: z.number().int(),
  lapTime: z.number(),
  sector1: z.number(),
  sector2: z.number(),
  sector3: z.number(),
  compound: z.string(),
  stint: z.number().int(),
  isFastest: z.boolean(),
});

export const TelemetryPointSchema = z.object({
  ratio: z.number(),
  speed: z.number(),
  throttle: z.number(),
  brake: z.number(),
  gear: z.number().int().nullable(),
  rpm: z.number().nullable(),
  drs: z.number().nullable(),
});

export const TelemetryTraceSchema = z.object({
  driverCode: z.string(),
  lapNumber: z.number().int(),
  sampleHz: z.number(),
  points: z.array(TelemetryPointSchema),
});

export const ComparePackSchema = z.object({
  trackId: z.string(),
  drivers: z.array(z.string()).length(2),
  laps: z.array(z.number().int()).length(2),
  deltaSections: z.array(
    z.object({
      from: z.number(),
      to: z.number(),
      leader: z.string(),
      deltaMs: z.number(),
    })
  ),
  events: z.array(
    z.object({
      type: z.string(),
      driver: z.string(),
      corner: z.union([z.string(), z.number()]),
      note: z.string().optional(),
    })
  ),
  telemetry: z.object({
    left: TelemetryTraceSchema,
    right: TelemetryTraceSchema,
  }).optional(),
  annotations: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      from: z.number(),
      to: z.number(),
      leader: z.string(),
      summary: z.string(),
      metrics: z.object({
        left: z.object({
          brakePointRatio: z.number().nullable(),
          minSpeed: z.number(),
          throttlePickupRatio: z.number().nullable(),
        }),
        right: z.object({
          brakePointRatio: z.number().nullable(),
          minSpeed: z.number(),
          throttlePickupRatio: z.number().nullable(),
        }),
      }),
    })
  ).optional(),
});

export const StintPackSchema = z.object({
  trackId: z.string(),
  sessionKey: z.number().int(),
  drivers: z.array(
    z.object({
      driverCode: z.string(),
      team: z.string(),
      stints: z.array(
        z.object({
          stintNumber: z.number().int(),
          compound: z.string(),
          lapStart: z.number().int(),
          lapEnd: z.number().int(),
          tyreAgeAtStart: z.number().int(),
          averageLapTime: z.number(),
          trendPerLap: z.number(),
          lapTimes: z.array(z.number()),
        })
      ),
    })
  ),
});

export const CarModelCatalogSchema = z.object({
  generatedAt: z.string(),
  models: z.array(
    z.object({
      id: z.string(),
      constructor: z.string(),
      constructorSlug: z.string(),
      season: z.number().int(),
      displayName: z.string(),
      file: z.string(),
      poster: z.string(),
      sizeLabel: z.string(),
      surfaceReady: z.boolean(),
      notes: z.string(),
    })
  ),
});

export const WindOverlayPackSchema = z.object({
  generatedAt: z.string(),
  source: z.object({
    name: z.string(),
    repository: z.string().url(),
    type: z.string(),
    feasibleForPrototype: z.boolean(),
    directF1OverlayReady: z.boolean(),
    notes: z.array(z.string()),
  }),
  scenarios: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: z.string(),
      status: z.string(),
      meshCells: z.union([z.number(), z.array(z.number())]),
      fields: z.array(z.string()),
      surfaceReady: z.boolean(),
      velocityRangeMps: z.tuple([z.number(), z.number()]).optional(),
    })
  ),
  integrationPlan: z.object({
    recommendedFlow: z.array(z.string()),
    appTargets: z.array(z.string()),
  }),
});

export const CfdOverlaySchemaExampleSchema = z.object({
  schemaVersion: z.number().int(),
  generatedAt: z.string().optional(),
  modelId: z.string(),
  scenarioId: z.string(),
  displayName: z.string().optional(),
  metric: z.string(),
  units: z.string(),
  source: z.object({
    kind: z.string(),
    caseId: z.string(),
    solver: z.string(),
    turbulenceModel: z.string(),
    referencePath: z.string(),
    notes: z.array(z.string()).optional(),
  }).optional(),
  inputs: z.object({
    speedMps: z.number(),
    yawDeg: z.number(),
    rideHeightMm: z.number(),
    drsOpen: z.boolean().optional(),
    groundMode: z.string(),
    wheelMode: z.string(),
  }).optional(),
  reference: z.object({
    airDensityKgM3: z.number(),
    areaM2: z.number(),
    lengthM: z.number(),
    pressureReferencePa: z.number().optional(),
  }).optional(),
  meshBinding: z.object({
    renderMeshId: z.string(),
    mappingMode: z.string(),
    triangleCount: z.number().int(),
  }),
  colorScale: z.object({
    min: z.number(),
    max: z.number(),
    palette: z.array(z.string()),
  }),
  scalarFields: z.array(
    z.object({
      name: z.string(),
      domain: z.string(),
      sourceField: z.string().optional(),
      transform: z.string().optional(),
      stats: z.object({
        min: z.number(),
        max: z.number(),
        mean: z.number(),
      }),
      storage: z.object({
        format: z.string(),
        path: z.string(),
        valueColumn: z.string(),
      }).optional(),
    })
  ),
  overlays: z.object({
    streamlines: z.array(
      z.object({
        id: z.string(),
        color: z.string(),
        count: z.number().int(),
      })
    ),
    hotspots: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        field: z.string(),
        value: z.number(),
      })
    ),
  }),
  artifacts: z.object({
    streamlineGuidePath: z.string().optional(),
    forceCoeffsPath: z.string().optional(),
  }).optional(),
  summary: z.object({
    cd: z.number().optional(),
    cl: z.number().optional(),
    downforceBalancePct: z.number().optional(),
  }).optional(),
});

export const OpenFoamStarterCaseSchema = z.object({
  generatedAt: z.string(),
  caseId: z.string(),
  label: z.string(),
  status: z.string(),
  modelId: z.string(),
  glbSourcePath: z.string(),
  casePath: z.string(),
  overlayConfigExamplePath: z.string(),
  recommendedCommand: z.string(),
  solver: z.string(),
  turbulenceModel: z.string(),
  defaults: z.object({
    speedMps: z.number(),
    yawDeg: z.number(),
    rideHeightMm: z.number(),
    groundMode: z.string(),
    wheelMode: z.string(),
  }),
  requiredUserInputs: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string(),
    })
  ),
  outputs: z.array(z.string()),
  notes: z.array(z.string()),
});

export const SessionManifestSchema = z.object({
  sessionKey: z.number().int(),
  summary: z.string(),
  drivers: z.string(),
  laps: z.string(),
  compare: z.record(z.string()),
  strategy: z.string(),
  stints: z.string().optional(),
});
