export function formatLapTime(seconds: number): string;
export function formatDeltaMs(value: number): string;
export function formatPercent(value: number): string;
export function bestSectorLabel(sector1: number, sector2: number, sector3: number): string;
export function personalBestSector(
  laps: Array<{ sector1?: number; sector2?: number; sector3?: number }>,
): { label: string; seconds: number | null };

export interface PitCycleOutcome {
  id: string;
  driverCode: string;
  team: string;
  pitLap: number;
  outLap: number;
  fromCompound: string;
  toCompound: string;
  beforeTime: number;
  afterTime: number;
  beforePosition: number;
  afterPosition: number;
  positionDelta: number;
  beforeReplayGap: number | null;
  afterReplayGap: number | null;
  replayGapDelta: number | null;
  prePace: number | null;
  postPace: number | null;
  paceDelta: number | null;
}

export interface PitCycleResult {
  status: "ready" | "requires_full_race" | "unavailable";
  reason: string;
  outcomes: PitCycleOutcome[];
  omittedCycles: number;
}

export function derivePitCycleOutcomes(input: {
  session: string;
  frames: Array<{
    t: number;
    trackStatus: string;
    drivers: Record<string, {
      lap: number | null;
      position: number;
      interval: number | null;
    }>;
  }>;
  expectedFrameCount?: number | null;
  totalTime?: number | null;
  fullRaceLoaded: boolean;
  stintPack: {
    drivers: Array<{
      driverCode: string;
      team: string;
      stints: Array<{
        compound: string;
        lapStart: number;
      }>;
    }>;
  } | null;
  lapRecords: Array<{
    driverCode: string;
    lapNumber: number;
    lapTime: number;
  }> | null;
  raceControlMessages?: Array<{
    flag?: string | null;
    message?: string | null;
  }>;
}): PitCycleResult;
