export type FlowView = "top";

export type FlowMetricId = "wakeWidth" | "wakeLength" | "wakeArea" | "dragProxy";

export interface FlowGridPreset {
  width: number;
  height: number;
}

export interface FlowSimulationDefaults {
  view: FlowView;
  grid: FlowGridPreset;
  speedPresetsMps: number[];
  metricIds: FlowMetricId[];
}

export interface FlowAssetStatus {
  glbReady: boolean;
  topMaskReady: boolean;
  previewReady: boolean;
}

export interface FlowCarEntry {
  id: string;
  name: string;
  constructorSlug: string;
  era: string;
  year?: number;
  sourceModelPath: string;
  publicModelPath: string;
  topMaskPath: string;
  previewPath?: string;
  scaleLengthMeters: number;
  notes: string[];
  assetStatus: FlowAssetStatus;
}

export interface FlowCarRegistry {
  version: number;
  description: string;
  simulationDefaults: FlowSimulationDefaults;
  cars: FlowCarEntry[];
}
