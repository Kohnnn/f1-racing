"use client";

import { derivePitCycleOutcomes, formatLapTime } from "@f1-racing/telemetry-utils";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComparePack, DriverSummary, LapRecord, ReplayPack, SessionManifest, SessionSummary, StintPack, StrategyPack } from "@/lib/data";
import { getFocusPoint } from "@/components/model-viewer/focus-points";
import { Leaderboard, type ReplayLeaderboardRow } from "./Leaderboard";
import { PlaybackControls } from "./PlaybackControls";
import { ReplayDebugPanel } from "./replay-debug-panel";
import { ReplayComparePanel, ReplayLapWaterfall, ReplayPitCyclePanel, ReplayStintPanel, ReplayStrategyPanel, ReplayTrackInfoPanel, ReplayBattleGraph, ReplayCornerSpeeds, ReplaySectorDominance } from "./replay-insights";
import { ReplayTelemetryStrip } from "./replay-telemetry-strip";
import { TrackCanvas, type PitPulse } from "./TrackCanvas";
import { buildTrackGeometry } from "./track-geometry";

const ReplayScene3D = dynamic(() => import("./three/ReplayScene3D"), { ssr: false });

const UI_SYNC_INTERVAL_MS = 180;

type AnalysisTab = "telemetry" | "compare" | "stints" | "strategy" | "pitcycles" | "track" | "racecontrol" | "waterfall" | "battle" | "corners" | "sectors";

type StoryStep = {
  id: string;
  label: "Observed" | "Derived";
  title: string;
  detail: string;
  time?: number;
  tab?: AnalysisTab;
  drivers?: string[];
};

const ANALYSIS_TAB_LABELS: Record<AnalysisTab, string> = {
  telemetry: "Telemetry",
  compare: "Compare",
  stints: "Stints",
  strategy: "Strategy",
  pitcycles: "Pit cycles",
  track: "Track",
  racecontrol: "Race control",
  waterfall: "Lap times",
  battle: "Battle map",
  corners: "Corner speeds",
  sectors: "Sectors",
};

function isAnalysisTab(value: string | null): value is AnalysisTab {
  return value !== null && value in ANALYSIS_TAB_LABELS;
}

interface ReplayViewProps {
  replay: ReplayPack;
  manifest: SessionManifest;
  summary: SessionSummary;
  compare: ComparePack | null;
  insightsReady: boolean;
  insightsStatus?: "loading" | "ready" | "unavailable";
  route: {
    season: string;
    grandPrix: string;
    session: string;
  };
  stintPack: StintPack | null;
  driverSummaries?: DriverSummary[] | null;
  lapRecords?: LapRecord[] | null;
  strategy?: StrategyPack | null;
  fullLoadProgress?: number;
  fullRaceLoaded?: boolean;
  onEnsureTimeLoaded?: (time: number) => void;
  onLoadFullRace?: () => void;
}

function hasMovingTrackCoordinates(frames: ReplayPack["frames"]) {
  if (frames.length < 4) {
    return false;
  }

  const sampleCodes = Object.keys(frames[0].drivers).slice(0, 6);
  if (!sampleCodes.length) {
    return false;
  }

  const sampleIndexes = Array.from(new Set([
    Math.floor(frames.length * 0.2),
    Math.floor(frames.length * 0.45),
    Math.floor(frames.length * 0.7),
    frames.length - 1,
  ].filter((index) => index > 0 && index < frames.length)));

  if (!sampleIndexes.length) {
    return false;
  }

  return sampleCodes.some((driverCode) => {
    const baseline = frames[0].drivers[driverCode];
    if (!baseline || baseline.x === null || baseline.y === null) {
      return false;
    }
    const baselineX = baseline.x;
    const baselineY = baseline.y;
    return sampleIndexes.some((index) => {
      const sample = frames[index].drivers[driverCode];
      if (!sample || sample.x === null || sample.y === null) {
        return false;
      }
      return Math.hypot(sample.x - baselineX, sample.y - baselineY) > 0.5;
    });
  });
}

function hasStaticTrackCoordinates(frames: ReplayPack["frames"]) {
  return !hasMovingTrackCoordinates(frames);
}

function getTrackPointAndNormal(trackPath: ReplayPack["trackPath"], ratio: number) {
  if (!trackPath || trackPath.length < 2) {
    return { x: 0, y: 0, nx: 0, ny: -1 };
  }

  const normalizedRatio = ((ratio % 1) + 1) % 1;
  const segmentCount = trackPath.length - 1;
  const segmentFloat = normalizedRatio * segmentCount;
  const segmentIndex = Math.floor(segmentFloat);
  const segmentRatio = segmentFloat - segmentIndex;
  const currentPoint = trackPath[segmentIndex];
  const nextPoint = trackPath[Math.min(segmentIndex + 1, trackPath.length - 1)];

  const dx = nextPoint[0] - currentPoint[0];
  const dy = nextPoint[1] - currentPoint[1];
  const length = Math.hypot(dx, dy) || 1;

  return {
    x: currentPoint[0] + dx * segmentRatio,
    y: currentPoint[1] + dy * segmentRatio,
    nx: -dy / length,
    ny: dx / length,
  };
}

function buildSyntheticFrame(
  frame: ReplayPack["frames"][number] | null,
  trackPath: ReplayPack["trackPath"],
  currentTime: number,
  estimatedLapDuration: number,
) {
  if (!frame) {
    return null;
  }

  const baseLap = currentTime / estimatedLapDuration;
  const baseRatio = ((baseLap % 1) + 1) % 1;
  const lapNumber = Math.max(1, Math.floor(baseLap) + 1);
  const drivers = Object.fromEntries(
    Object.values(frame.drivers).map((driver) => {
      const intervalRatio = Math.max(0, (driver.interval ?? (driver.position - 1) * 0.45) / estimatedLapDuration);
      const positionSpacing = Math.max(0, driver.position - 1) * 0.004;
      const driverRatio = (baseRatio - intervalRatio - positionSpacing + 1) % 1;
      const laneOffset = ((driver.driverNumber % 5) - 2) * 2.6;
      const { x, y, nx, ny } = getTrackPointAndNormal(trackPath, driverRatio);

      return [
        driver.driverCode,
        {
          ...driver,
          x: x + nx * laneOffset,
          y: y + ny * laneOffset,
          lap: lapNumber,
        },
      ];
    }),
  ) as typeof frame.drivers;

  return {
    ...frame,
    lap: lapNumber,
    drivers,
  };
}

function getProjectedProgress(
  driver: ReplayPack["frames"][number]["drivers"][string],
  frame: ReplayPack["frames"][number],
  trackGeometry: ReturnType<typeof buildTrackGeometry>,
  estimatedLapDuration: number,
  forceIntervalProjection: boolean,
) {
  if (!trackGeometry || driver.x === null || driver.y === null) {
    return null;
  }

  const lapOffset = Math.max(0, (driver.lap ?? frame.lap ?? 1) - 1) * trackGeometry.totalLength;

  if (!forceIntervalProjection || driver.position <= 1) {
    return lapOffset + trackGeometry.project({ x: driver.x, y: driver.y }).distance;
  }

  const leader = Object.values(frame.drivers)
    .filter((candidate) => candidate.x !== null && candidate.y !== null)
    .sort((left, right) => left.position - right.position)[0];

  if (!leader || leader.x === null || leader.y === null) {
    return lapOffset + trackGeometry.project({ x: driver.x, y: driver.y }).distance;
  }

  const leaderProjection = trackGeometry.project({ x: leader.x, y: leader.y });
  const intervalDistance = driver.interval !== null
    ? (driver.interval / Math.max(55, estimatedLapDuration)) * trackGeometry.totalLength
    : Math.max(0, driver.position - 1) * trackGeometry.totalLength * 0.012;

  return lapOffset + leaderProjection.distance - intervalDistance;
}

function formatSeconds(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function intervalLabel(interval: number | null | undefined, position?: number | null) {
  if (position === 1) {
    return "Leader";
  }
  if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0) {
    return "Unavailable";
  }
  return `+${interval.toFixed(3)}`;
}

function gapProvenanceLabel(interval: number | null | undefined, position?: number | null) {
  if (position === 1) {
    return "Race order";
  }
  return typeof interval === "number" && Number.isFinite(interval) && interval > 0
    ? "Published gap"
    : "Timing unavailable";
}

function normalizeTrackStatus(status: string) {
  switch (String(status).toUpperCase()) {
    case "2": return "YELLOW";
    case "4": return "SC";
    case "5": return "RED";
    case "6":
    case "7": return "VSC";
    default: return String(status || "GREEN").toUpperCase();
  }
}

function formatSlugLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sanitizeReplayNote(note: string | undefined | null) {
  if (!note) {
    return null;
  }
  const lower = note.toLowerCase();
  if (lower.includes("fastf1 python") || lower.includes("python pipeline")) {
    return null;
  }
  return note;
}

function formatReplaySource(source: ReplayPack["source"]) {
  switch (source) {
    case "fastf1":
      return "FastF1 feed";
    case "openf1":
      return "OpenF1 feed";
    default:
      return source;
  }
}

type RaceControlCategoryId = "all" | "flag" | "drs" | "safety-car" | "penalty" | "investigation" | "other";

const RACE_CONTROL_FILTERS: Array<{ id: RaceControlCategoryId; label: string }> = [
  { id: "all", label: "All" },
  { id: "flag", label: "Flags" },
  { id: "drs", label: "DRS" },
  { id: "safety-car", label: "SC / VSC" },
  { id: "penalty", label: "Penalties" },
  { id: "investigation", label: "Investigations" },
  { id: "other", label: "Other" },
];

const RACE_CONTROL_BADGE_LABEL: Record<RaceControlCategoryId, string> = {
  all: "Message",
  flag: "Flag",
  drs: "DRS",
  "safety-car": "Safety car",
  penalty: "Penalty",
  investigation: "Investigation",
  other: "Message",
};

function categorizeRaceControlMessage(message: { category?: string | null; flag?: string | null; message?: string | null }): RaceControlCategoryId {
  const text = `${message.category ?? ""} ${message.flag ?? ""} ${message.message ?? ""}`.toLowerCase();
  if (text.includes("safety car") || text.includes("vsc") || text.includes("virtual safety")) return "safety-car";
  if (text.includes("drs")) return "drs";
  if (text.includes("penalty") || text.includes("penalties") || text.includes("time penalty") || text.includes("stop/go")) return "penalty";
  if (text.includes("investigat") || text.includes("noted") || text.includes("under review")) return "investigation";
  if (text.includes("flag") || text.includes("yellow") || text.includes("red") || text.includes("green") || text.includes("chequered") || text.includes("checkered") || text.includes("white")) return "flag";
  return "other";
}

function findLastIndexBeforeOrAt(time: number, values: number[]) {
  let left = 0;
  let right = values.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (values[mid] <= time) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

export function ReplayView({ replay, manifest, summary, compare, insightsReady, insightsStatus = insightsReady ? "ready" : "loading", route, stintPack, driverSummaries, lapRecords, strategy, fullLoadProgress = 0, fullRaceLoaded = false, onEnsureTimeLoaded, onLoadFullRace }: ReplayViewProps) {
  const initialTime = replay.frames[0]?.t || 0;
  const defaultAnalysisTab = Object.keys(manifest.compare ?? {}).length ? "compare" as const : manifest.stints ? "stints" as const : "telemetry" as const;
  const [playbackState, setPlaybackState] = useState(() => ({
    currentTime: initialTime,
    frameIndex: 0,
  }));
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>(defaultAnalysisTab);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showDriverLabels, setShowDriverLabels] = useState(false);
  const [showDrsZones, setShowDrsZones] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [heatmapChannel, setHeatmapChannel] = useState<"off" | "speed" | "throttle" | "brake">("off");
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const playheadTimeRef = useRef(initialTime);
  const frameIndexRef = useRef(0);
  const lastUiSyncRef = useRef(initialTime);
  const lastPositionsRef = useRef<Map<string, number>>(new Map());
  const [showMarshalSectors, setShowMarshalSectors] = useState(true);
  const [loopBounds, setLoopBounds] = useState<{ from: number | null; to: number | null }>({ from: null, to: null });
  const [loopActive, setLoopActive] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [focusedDriver, setFocusedDriver] = useState<string | null>(null);
  const [fastestLapToast, setFastestLapToast] = useState<{ driver: string; time: number; key: number } | null>(null);
  const lastFastestRef = useRef<number | null>(null);
  const [leaderboardLayout, setLeaderboardLayout] = useState<"vertical" | "horizontal">("vertical");
  const [hoverFields, setHoverFields] = useState<{
    position: boolean;
    team: boolean;
    gap: boolean;
    lastLap: boolean;
    bestLap: boolean;
    tyre: boolean;
    speed: boolean;
    drs: boolean;
  }>({ position: true, team: true, gap: true, lastLap: true, bestLap: false, tyre: true, speed: true, drs: true });
  const [showHoverFieldsMenu, setShowHoverFieldsMenu] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [trackViewMode, setTrackViewMode] = useState<"2d" | "3d">("2d");
  const [trackViewNotice, setTrackViewNotice] = useState<string | null>(null);
  const [seekToken, setSeekToken] = useState(0);
  const [viewMode, setViewMode] = useState<"story" | "workspace">("story");
  const [queryReady, setQueryReady] = useState(false);
  const [syncWorkspaceUrl, setSyncWorkspaceUrl] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    const requestedTimeParam = params.get("t");
    const requestedTimeValue = Number(requestedTimeParam);
    const requestedTime = requestedTimeParam !== null
      && requestedTimeParam.trim() !== ""
      && Number.isFinite(requestedTimeValue)
      && requestedTimeValue >= 0
      ? Math.min(requestedTimeValue, replay.totalTime ?? replay.frames.at(-1)?.t ?? 0)
      : null;
    const validDriverCodes = new Set(replay.drivers.map((driver) => driver.driverCode));
    const requestedDrivers = Array.from(new Set(
      (params.get("drivers") ?? "")
        .split(",")
        .map((driverCode) => driverCode.trim().toUpperCase())
        .filter((driverCode) => validDriverCodes.has(driverCode)),
    )).slice(0, 4);

    const workspaceRequested = Boolean(
      requestedTime !== null
      || requestedTab
      || params.get("drivers")
      || params.get("focus")
      || window.location.hash === "#analysis",
    );
    setFocusId(params.get("focus"));
    setSelectedDrivers(requestedDrivers);
    if (isAnalysisTab(requestedTab)) {
      setAnalysisTab(requestedTab);
    }
    if (requestedTime !== null) {
      onEnsureTimeLoaded?.(requestedTime);
      playheadTimeRef.current = requestedTime;
      lastUiSyncRef.current = requestedTime;
      setPlaybackState({ currentTime: requestedTime, frameIndex: 0 });
    } else if (requestedTimeParam !== null) {
      const url = new URL(window.location.href);
      url.searchParams.delete("t");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setViewMode(workspaceRequested ? "workspace" : "story");
    setSyncWorkspaceUrl(workspaceRequested);
    if (params.get("debug") === "1") {
      setShowDebug(true);
    }
    setQueryReady(true);
  }, [onEnsureTimeLoaded, replay.drivers, replay.totalTime]);

  useEffect(() => {
    if (!queryReady || !syncWorkspaceUrl) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("tab", analysisTab);
    if (selectedDrivers.length) {
      url.searchParams.set("drivers", selectedDrivers.join(","));
    } else {
      url.searchParams.delete("drivers");
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [analysisTab, queryReady, selectedDrivers, syncWorkspaceUrl]);

  const totalTime = replay.totalTime ?? (replay.frames.at(-1)?.t || 0);
  const loadedEndTime = replay.frames.at(-1)?.t || 0;
  const computedTotalLaps = useMemo(() => Math.max(...replay.laps.map((lap) => lap.lapNumber), 0), [replay.laps]);
  const totalLaps = replay.totalLaps ?? computedTotalLaps;
  const useSyntheticTrackMotion = useMemo(() => hasStaticTrackCoordinates(replay.frames), [replay.frames]);
  const trackGeometry = useMemo(() => buildTrackGeometry(replay.trackPath, 920, 610), [replay.trackPath]);
  // Projection is always-on whenever we have a dense polyline. This keeps marker placement,
  // leaderboard order, and progress aligned regardless of upstream coordinate quality.
  const projectMarkers = useMemo(() => Boolean(trackGeometry && replay.trackPath && replay.trackPath.length >= 16), [replay.trackPath, trackGeometry]);
  const estimatedLapDuration = useMemo(() => {
    if (totalLaps > 0 && totalTime > 0) {
      return Math.max(55, totalTime / totalLaps);
    }
    return 95;
  }, [totalLaps, totalTime]);
  const raceControlTimes = useMemo(() => replay.raceControlMessages?.map((message) => message.t) ?? [], [replay.raceControlMessages]);
  const findFrameIndexForTime = useCallback((time: number) => {
    let left = 0;
    let right = replay.frames.length - 1;
    let result = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (replay.frames[mid].t <= time) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result;
  }, [replay.frames]);

  const currentFrameIndex = playbackState.frameIndex;
  const rawCurrentFrame = replay.frames[currentFrameIndex] || null;
  const rawNextFrame = replay.frames[currentFrameIndex + 1] || null;
  const currentTime = playbackState.currentTime;
  const currentFrame = useMemo(() => {
    const frame = useSyntheticTrackMotion
      ? buildSyntheticFrame(rawCurrentFrame, replay.trackPath, currentTime, estimatedLapDuration)
      : rawCurrentFrame;
    if (!frame) {
      return null;
    }

    if (frame.safetyCar?.phase !== "none" || !["SC", "VSC"].includes(normalizeTrackStatus(frame.trackStatus)) || !trackGeometry) {
      return {
        ...frame,
        trackStatus: normalizeTrackStatus(frame.trackStatus),
      };
    }

    const leader = Object.values(frame.drivers).sort((left, right) => left.position - right.position)[0];
    if (!leader || leader.x === null || leader.y === null) {
      return {
        ...frame,
        trackStatus: normalizeTrackStatus(frame.trackStatus),
      };
    }

    const projected = trackGeometry.project({ x: leader.x, y: leader.y });
    const point = trackGeometry.pointAtDistance(projected.distance + trackGeometry.totalLength * 0.035);
    return {
      ...frame,
      trackStatus: normalizeTrackStatus(frame.trackStatus),
      safetyCar: {
        phase: "on_track" as const,
        x: point.x,
        y: point.y,
      },
    };
  }, [currentTime, estimatedLapDuration, rawCurrentFrame, replay.trackPath, trackGeometry, useSyntheticTrackMotion]);
  const nextFrame = useMemo(
    () => useSyntheticTrackMotion
      ? buildSyntheticFrame(rawNextFrame, replay.trackPath, rawNextFrame?.t ?? currentTime + 4, estimatedLapDuration)
      : rawNextFrame,
    [currentTime, estimatedLapDuration, rawNextFrame, replay.trackPath, useSyntheticTrackMotion],
  );
  const trackStatus = normalizeTrackStatus(currentFrame?.trackStatus || "GREEN");
  const currentLap = currentFrame?.lap || null;
  const replayFocus = getFocusPoint(focusId);
  const trackLabel = formatSlugLabel(replay.trackId);
  const replaySourceLabel = formatReplaySource(replay.source);
  const cleanReplayNote = useMemo(() => sanitizeReplayNote(replay.note), [replay.note]);
  const positionCoverage = useMemo(() => {
    let gpsSamples = 0;
    let syntheticSamples = 0;
    for (const frame of replay.frames) {
      for (const driver of Object.values(frame.drivers)) {
        if (driver.positionSource === "gps") gpsSamples += 1;
        if (driver.positionSource === "synthetic") syntheticSamples += 1;
      }
    }
    if (gpsSamples && syntheticSamples) return "GPS + projected positions";
    if (gpsSamples) return "GPS-projected positions";
    if (syntheticSamples || useSyntheticTrackMotion) return "Projected timing positions";
    return "Published track positions";
  }, [replay.frames, useSyntheticTrackMotion]);
  const replayPackLabel = replay.frameCount
    ? `${replay.frameCount.toLocaleString()} frames · ${replay.frameChunkIndex?.length ?? replay.frameChunks?.length ?? 1} file${(replay.frameChunkIndex?.length ?? replay.frameChunks?.length ?? 1) === 1 ? "" : "s"}`
    : `${replay.frames.length.toLocaleString()} loaded frames`;
  const [showMessageList, setShowMessageList] = useState(false);
  const [raceControlFilter, setRaceControlFilter] = useState<RaceControlCategoryId>("all");
  const replayBannerNote = [
    cleanReplayNote || `${replaySourceLabel} replay data.`,
    useSyntheticTrackMotion ? "The current loaded window uses lap-progress projection until moving coordinates are available." : null,
  ].filter(Boolean).join(" ");
  const lapLabel = currentLap
    ? `${currentLap}${totalLaps ? ` / ${totalLaps}` : ""}`
    : totalLaps
      ? `- / ${totalLaps}`
      : "Not yet exported";

  const driverInfoByCode = useMemo(
    () => new Map(replay.drivers.map((driver) => [driver.driverCode, driver])),
    [replay.drivers],
  );

  const driverStatusByCode = useMemo(() => {
    const map = new Map<string, NonNullable<DriverSummary["status"]>>();
    if (driverSummaries) {
      for (const summary of driverSummaries) {
        if (summary.status) {
          map.set(summary.driverCode, summary.status);
        }
      }
    }
    return map;
  }, [driverSummaries]);

  const lapHistoryByDriver = useMemo(() => {
    const history = new Map<string, typeof replay.laps>();
    for (const lap of replay.laps) {
      const entry = history.get(lap.driverCode) || [];
      entry.push(lap);
      history.set(lap.driverCode, entry);
    }
    for (const laps of history.values()) {
      laps.sort((left, right) => left.lapNumber - right.lapNumber);
    }
    return history;
  }, [replay.laps]);

  const previousLapLabelByDriverLap = useMemo(() => {
    const lookup = new Map<string, string | null>();

    for (const [driverCode, laps] of lapHistoryByDriver.entries()) {
      let previousLabel: string | null = null;
      for (const lap of laps) {
        lookup.set(`${driverCode}:${lap.lapNumber}`, previousLabel);
        if (lap.lapTime !== null) {
          previousLabel = formatLapTime(lap.lapTime);
        }
      }
    }

    return lookup;
  }, [lapHistoryByDriver]);

  // Track which lap numbers are out-laps (first lap of a stint or an "in/out" lap that
  // came right after a pit). We mark a lap as out-lap when its time is significantly slower
  // than the driver's stint baseline (>15% off median), which is the same heuristic Motec uses.
  const outLapByDriverLap = useMemo(() => {
    const lookup = new Set<string>();
    for (const [driverCode, laps] of lapHistoryByDriver.entries()) {
      const completedTimes = laps
        .map((lap) => lap.lapTime)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      if (completedTimes.length < 4) continue;
      const sorted = [...completedTimes].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const previousCompounds = new Map<number, string | null>();
      let previousCompound: string | null = null;
      for (const lap of laps) {
        previousCompounds.set(lap.lapNumber, previousCompound);
        if (lap.compound) previousCompound = lap.compound;
      }
      for (const lap of laps) {
        if (lap.lapTime === null) continue;
        const compoundChanged = lap.compound && previousCompounds.get(lap.lapNumber) && previousCompounds.get(lap.lapNumber) !== lap.compound;
        const slowOutlier = lap.lapTime > median * 1.18;
        if (compoundChanged || slowOutlier) {
          lookup.add(`${driverCode}:${lap.lapNumber}`);
        }
      }
    }
    return lookup;
  }, [lapHistoryByDriver]);

  const sessionFastestLapTime = useMemo(() => {
    const completed = replay.laps
      .map((lap) => lap.lapTime)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    if (!completed.length) return null;
    return Math.min(...completed);
  }, [replay.laps]);

  const fastestLap = useMemo(() => {
    if (replay.fastestLap) {
      return replay.fastestLap;
    }

    const completedLaps = replay.laps.filter((lap) => lap.lapTime !== null);
    if (!completedLaps.length) {
      return null;
    }

    return completedLaps
      .slice()
      .sort((left, right) => (left.lapTime ?? Infinity) - (right.lapTime ?? Infinity))[0];
  }, [replay.fastestLap, replay.laps]);

  const displayedDrivers = useMemo<ReplayLeaderboardRow[]>(() => {
    if (!currentFrame) {
      return [];
    }

    const fastestDriverCode = fastestLap?.driverCode ?? null;

    return Object.values(currentFrame.drivers)
      .filter((driver) => driver.position > 0)
      .map((driver) => {
        const progress = getProjectedProgress(
          driver,
          currentFrame,
          trackGeometry,
          estimatedLapDuration,
          projectMarkers,
        );
        return { driver, progress };
      })
      .sort((left, right) => {
        // Always trust the published `position` field for ordering. The
        // projected-distance heuristic was previously flipping rows when
        // the projection was within a metre, putting P17 between P3 and P4.
        return left.driver.position - right.driver.position;
      })
      .map((driver) => {
        const info = driverInfoByCode.get(driver.driver.driverCode);
        const lapKey = `${driver.driver.driverCode}:${driver.driver.lap || 0}`;
        const lastLapLabel = previousLapLabelByDriverLap.get(lapKey) ?? null;
        const isOutLap = outLapByDriverLap.has(lapKey);
        const status = driverStatusByCode.get(driver.driver.driverCode);
        // Compute delta against the absolute fastest lap of the session, when both
        // are known. We compare lapTime numbers (seconds) rather than parsing the
        // formatted string back out.
        const lastLapNumeric = (() => {
          const driverLaps = lapHistoryByDriver.get(driver.driver.driverCode);
          if (!driverLaps) return null;
          for (let i = driverLaps.length - 1; i >= 0; i -= 1) {
            const lap = driverLaps[i];
            if (lap.lapNumber < (driver.driver.lap || 0) && typeof lap.lapTime === "number") {
              return lap.lapTime;
            }
          }
          return null;
        })();
        const fastest = sessionFastestLapTime;
        const lastLapDeltaLabel = lastLapNumeric !== null && fastest !== null
          ? `${lastLapNumeric >= fastest ? "+" : ""}${(lastLapNumeric - fastest).toFixed(3)}`
          : null;

        // Position delta vs. the previous render. Negative = gained places.
        const previousPosition = lastPositionsRef.current.get(driver.driver.driverCode) ?? driver.driver.position;
        const positionDelta = driver.driver.position - previousPosition;
        lastPositionsRef.current.set(driver.driver.driverCode, driver.driver.position);

        return {
          abbr: driver.driver.driverCode,
          fullName: info?.fullName || driver.driver.driverCode,
          team: info?.team || driver.driver.team,
          color: info?.teamColor || "#9ca3af",
          position: driver.driver.position,
          intervalLabel: intervalLabel(driver.driver.interval, driver.driver.position),
          compound: driver.driver.tyreCompound,
          tyreAge: driver.driver.tyreAge,
          lap: driver.driver.lap,
          speed: driver.driver.speed,
          throttle: driver.driver.throttle,
          brake: driver.driver.brake,
          gear: driver.driver.gear,
          rpm: driver.driver.rpm,
          drs: driver.driver.drs,
          lastLapLabel,
          lastLapDeltaLabel,
          isOutLap,
          isFastestLap: fastestDriverCode === driver.driver.driverCode,
          positionDelta,
          status,
        };
      });
  }, [currentFrame, driverInfoByCode, driverStatusByCode, estimatedLapDuration, fastestLap, lapHistoryByDriver, outLapByDriverLap, previousLapLabelByDriverLap, projectMarkers, sessionFastestLapTime, trackGeometry]);

  const replayEvents = useMemo(() => {
    const events = (replay.raceControlMessages ?? []).map((message) => ({
      t: message.t,
      label: message.flag || message.category || message.message,
      type: normalizeTrackStatus(message.flag || message.category || "event"),
    }));
    const statusEvents: Array<{ t: number; label: string; type: string }> = [];
    let lastStatus = "";
    for (const frame of replay.frames) {
      const status = normalizeTrackStatus(frame.trackStatus);
      if (status !== lastStatus && status !== "GREEN") {
        statusEvents.push({ t: frame.t, label: status, type: status });
      }
      lastStatus = status;
    }
    return [...events, ...statusEvents].sort((left, right) => left.t - right.t);
  }, [replay.frames, replay.raceControlMessages]);

  // Build colored segment ribbons for the scrubber: SC/VSC/Yellow/Red zones from
  // the frame trackStatus stream (real durations) plus pit pulses for visual
  // continuity with the track map.
  const replaySegments = useMemo(() => {
    if (!replay.frames.length) return [] as Array<{ fromTime: number; toTime: number; type: "sc" | "vsc" | "yellow" | "red" | "pit" | "drs"; label?: string }>;
    const segments: Array<{ fromTime: number; toTime: number; type: "sc" | "vsc" | "yellow" | "red" | "pit" | "drs"; label?: string }> = [];
    let openType: string | null = null;
    let openFrom = 0;
    const flush = (closeAt: number) => {
      if (!openType) return;
      const t = openType;
      const variant = t === "SC" ? "sc" : t === "VSC" ? "vsc" : t === "RED" ? "red" : t === "YELLOW" || t === "DOUBLE YELLOW" ? "yellow" : null;
      if (variant) {
        segments.push({ fromTime: openFrom, toTime: closeAt, type: variant, label: t });
      }
      openType = null;
    };
    for (const frame of replay.frames) {
      const status = normalizeTrackStatus(frame.trackStatus);
      if (status === openType) continue;
      flush(frame.t);
      if (status !== "GREEN" && status !== "CHEQUERED") {
        openType = status;
        openFrom = frame.t;
      }
    }
    flush(replay.frames.at(-1)?.t ?? totalTime);
    return segments;
  }, [replay.frames, totalTime]);

  // Derive a list of pit-out pulses by scanning the loaded frames for tyre
  // compound transitions per driver. Each pulse is anchored to the frame's
  // wall-clock time `t` so the renderer can age it against the replay clock.
  const pitPulses = useMemo<PitPulse[]>(() => {
    if (!replay.frames?.length) return [];
    const previousCompoundByDriver = new Map<string, string | null>();
    const previousAgeByDriver = new Map<string, number | null>();
    const seen = new Set<string>();
    const pulses: PitPulse[] = [];
    const driverColor = (code: string) => driverInfoByCode.get(code)?.teamColor ?? "#38bdf8";
    for (const frame of replay.frames) {
      for (const driver of Object.values(frame.drivers)) {
        if (!driver) continue;
        const previous = previousCompoundByDriver.get(driver.driverCode) ?? null;
        const previousAge = previousAgeByDriver.get(driver.driverCode) ?? null;
        const compoundChanged = !!previous && !!driver.tyreCompound && previous !== driver.tyreCompound;
        // A reset of tyre age to 0 with a known previous age is a strong pit signal.
        const ageReset = previousAge !== null && previousAge > 0 && (driver.tyreAge ?? -1) === 0;
        if (compoundChanged || ageReset) {
          const id = `${driver.driverCode}-pit-${Math.round(frame.t)}`;
          if (!seen.has(id)) {
            seen.add(id);
            pulses.push({
              id,
              ratio: 0.02, // near start/finish line; close to most pit-outs
              startedAt: frame.t,
              color: driverColor(driver.driverCode),
              label: `${driver.driverCode} PIT`,
            });
          }
        }
        if (driver.tyreCompound) previousCompoundByDriver.set(driver.driverCode, driver.tyreCompound);
        if (typeof driver.tyreAge === "number") previousAgeByDriver.set(driver.driverCode, driver.tyreAge);
      }
    }
    return pulses;
  }, [driverInfoByCode, replay.frames]);

  // Aggregate the primary selected driver's frames into racing-line heatmap
  // samples (x, y, normalised value) for the chosen telemetry channel. Uses the
  // GPS-projected coordinates already in each frame; only runs when a channel
  // is active and a driver is selected.
  const heatmapSamples = useMemo(() => {
    if (heatmapChannel === "off") return [];
    const code = selectedDrivers[0] ?? focusId;
    if (!code || !replay.frames?.length) return [];
    const out: Array<{ x: number; y: number; value: number }> = [];
    for (const frame of replay.frames) {
      const d = frame.drivers[code];
      if (!d || d.x === null || d.y === null) continue;
      let raw: number | null = null;
      if (heatmapChannel === "speed") raw = d.speed;
      else if (heatmapChannel === "throttle") raw = d.throttle;
      else if (heatmapChannel === "brake") raw = d.brake;
      if (raw === null || !Number.isFinite(raw)) continue;
      // Normalise: speed by ~360km/h ceiling, throttle/brake are already 0..100.
      const value = heatmapChannel === "speed" ? Math.min(1, raw / 340) : Math.min(1, raw / 100);
      out.push({ x: d.x, y: d.y, value });
    }
    return out;
  }, [heatmapChannel, selectedDrivers, focusId, replay.frames]);

  // Derive real DRS activation zones from the GPS-positioned frames. OpenF1 DRS
  // codes 10/12/14 mean "DRS open"; we project those samples onto the track and
  // histogram by track ratio, then merge dense bins into contiguous zones. Falls
  // back to the pack's published zones when GPS/DRS data is insufficient.
  const derivedDrsZones = useMemo(() => {
    const path = replay.trackPath;
    if (!path || path.length < 16 || !replay.frames?.length) return null;
    const BINS = 100;
    const hits = new Array(BINS).fill(0);
    const totalByBin = new Array(BINS).fill(0);
    const project = (x: number, y: number) => {
      let best = Infinity;
      let bestI = 0;
      for (let i = 0; i < path.length; i += 1) {
        const dx = path[i][0] - x;
        const dy = path[i][1] - y;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; bestI = i; }
      }
      return bestI / (path.length - 1);
    };
    let drsSamples = 0;
    const step = Math.max(1, Math.floor(replay.frames.length / 200));
    for (let f = 0; f < replay.frames.length; f += step) {
      for (const d of Object.values(replay.frames[f].drivers)) {
        if (!d || d.x === null || d.y === null || d.drs === null) continue;
        const ratio = project(d.x, d.y);
        const bin = Math.max(0, Math.min(BINS - 1, Math.floor(ratio * BINS)));
        totalByBin[bin] += 1;
        if (d.drs >= 10) { hits[bin] += 1; drsSamples += 1; }
      }
    }
    if (drsSamples < 20) return null;
    // A bin is a DRS zone if DRS was open in a non-trivial share of its samples.
    // The threshold is deliberately low: in races DRS only opens when within ~1s
    // of the car ahead, so most passes through a real zone have DRS closed — but
    // DRS is physically impossible outside zones, so any consistent activation
    // marks the zone. Require both a fraction and a minimum absolute hit count.
    const active = hits.map((h, i) => {
      const frac = totalByBin[i] > 0 ? h / totalByBin[i] : 0;
      return frac > 0.06 && h >= 3;
    });
    // Bridge single-bin gaps so a zone isn't split by one quiet bin.
    for (let i = 1; i < BINS - 1; i += 1) {
      if (!active[i] && active[i - 1] && active[i + 1]) active[i] = true;
    }
    const zones: Array<{ from: number; to: number; fromRatio: number; toRatio: number }> = [];
    let start = -1;
    for (let i = 0; i < BINS; i += 1) {
      if (active[i] && start === -1) start = i;
      if ((!active[i] || i === BINS - 1) && start !== -1) {
        const end = active[i] ? i : i - 1;
        if (end - start >= 1) {
          zones.push({ from: 0, to: 0, fromRatio: start / BINS, toRatio: (end + 1) / BINS });
        }
        start = -1;
      }
    }
    return zones.length ? zones : null;
  }, [replay.trackPath, replay.frames]);

  const effectiveDrsZones = derivedDrsZones ?? replay.trackMetadata?.drsZones ?? [];

  // Pulse window: only show pulses whose age is under ~3.5s of the replay clock.
  const activePitPulses = useMemo<PitPulse[]>(() => {
    if (!pitPulses.length) return [];
    const lifetime = 3.5;
    return pitPulses.filter((pulse) => {
      const age = currentTime - pulse.startedAt;
      return age >= 0 && age <= lifetime;
    });
  }, [currentTime, pitPulses]);

  // Resolve which marshal sectors are currently flagged based on the active
  // race-control messages within a small look-back window. Sector indexes are
  // 1-based to align with FIA terminology (S1/S2/S3 etc.).
  const activeMarshalFlagBySector = useMemo<Map<number, string>>(() => {
    const map = new Map<number, string>();
    if (!replay.raceControlMessages?.length) return map;
    const window = 12; // seconds: keep flag tints alive for ~12s after the message
    const messages = replay.raceControlMessages.filter(
      (message) => message.t <= currentTime && currentTime - message.t <= window,
    );
    for (const message of messages) {
      const text = `${message.flag ?? ""} ${message.message ?? ""}`.toLowerCase();
      const sectorMatch = /sector\s+(\d+)/i.exec(message.message || "");
      const sector = sectorMatch ? Number(sectorMatch[1]) : null;
      if (!sector) continue;
      let flag: string | null = null;
      if (text.includes("double yellow")) flag = "DOUBLE YELLOW";
      else if (text.includes("yellow")) flag = "YELLOW";
      else if (text.includes("red")) flag = "RED";
      else if (text.includes("green")) flag = null; // clears
      if (flag) {
        map.set(sector, flag);
      } else {
        map.delete(sector);
      }
    }
    return map;
  }, [currentTime, replay.raceControlMessages]);

  const suggestedDriver = useMemo(() => {
    return fastestLap?.driverCode ?? displayedDrivers[0]?.abbr ?? null;
  }, [displayedDrivers, fastestLap]);

  const fastestLapLabel = fastestLap?.lapTime
    ? `${fastestLap.driverCode} · ${formatLapTime(fastestLap.lapTime)}`
    : "Not yet exported";

  useEffect(() => {
    if (selectedDrivers.length) {
      return;
    }
    if (replayFocus && suggestedDriver) {
      setSelectedDrivers([suggestedDriver]);
    }
  }, [replayFocus, selectedDrivers.length, suggestedDriver]);

  const selectedTelemetryDrivers = displayedDrivers.filter((driver) => selectedDrivers.includes(driver.abbr));

  // Recent message strip: shows the last few messages whose time has elapsed.
  const activeRaceControlMessages = useMemo(() => {
    if (!replay.raceControlMessages?.length) {
      return [];
    }

    const lastIndex = findLastIndexBeforeOrAt(currentTime, raceControlTimes);
    if (lastIndex < 0) {
      return [];
    }

    return replay.raceControlMessages.slice(Math.max(0, lastIndex - 3), lastIndex + 1).reverse();
  }, [currentTime, raceControlTimes, replay.raceControlMessages]);

  // Total race-control messages (for the popover button counter).
  const totalRaceControlMessages = replay.raceControlMessages?.length ?? 0;
  const lastElapsedRcIndex = useMemo(
    () => findLastIndexBeforeOrAt(currentTime, raceControlTimes),
    [currentTime, raceControlTimes],
  );

  // Filtered, ordered list for the expanded panel (newest first).
  const filteredRaceControlMessages = useMemo(() => {
    if (!replay.raceControlMessages?.length) return [];
    const filtered = replay.raceControlMessages
      .map((message, index) => ({ message, index, category: categorizeRaceControlMessage(message) }))
      .filter((entry) => raceControlFilter === "all" || entry.category === raceControlFilter)
      .sort((left, right) => right.index - left.index);
    return filtered;
  }, [raceControlFilter, replay.raceControlMessages]);
  const currentWeather = currentFrame?.weather || null;
  const weatherLabel = currentWeather
    ? `${currentWeather.airTempC}C air · ${currentWeather.trackTempC}C track`
    : summary.weatherSummary.airTempC !== null && summary.weatherSummary.trackTempC !== null
      ? `${summary.weatherSummary.airTempC}C air · ${summary.weatherSummary.trackTempC}C track`
      : "Unavailable";
  const windLabel = currentWeather
    ? `${currentWeather.windSpeedMps.toFixed(1)} m/s · ${Math.round(currentWeather.windDirectionDeg)}°`
    : summary.weatherSummary.rainRiskPct !== null
      ? `Rain risk ${summary.weatherSummary.rainRiskPct}%`
      : "Unavailable";
  const selectedDriverLabel = selectedTelemetryDrivers.length
    ? selectedTelemetryDrivers.map((driver) => driver.abbr).join(" · ")
    : "No drivers selected";
  const leadDriver = displayedDrivers[0] || null;
  const stageDrivers = displayedDrivers.slice(0, 3);

  // Build per-driver hover metadata for the track tooltip.
  const hoverMetaByCode = useMemo(() => {
    const map = new Map<string, {
      team?: string;
      tyreCompound?: string | null;
      tyreAge?: number | null;
      lastLapMs?: number | null;
      bestLapMs?: number | null;
        gap?: string | null;
        gapProvenance?: string | null;
        interval?: string | null;
    }>();
    for (const driver of displayedDrivers) {
      const driverLaps = lapHistoryByDriver.get(driver.abbr) ?? [];
      let bestLapMs: number | null = null;
      let lastLapMs: number | null = null;
      for (const lap of driverLaps) {
        if (typeof lap.lapTime !== "number") continue;
        const ms = lap.lapTime * 1000;
        if (bestLapMs === null || ms < bestLapMs) bestLapMs = ms;
        if (lap.lapNumber < (driver.lap ?? 0) || lastLapMs === null) lastLapMs = ms;
      }
      map.set(driver.abbr, {
        team: driver.team,
        tyreCompound: driver.compound,
        tyreAge: driver.tyreAge,
        gap: driver.intervalLabel,
        gapProvenance: gapProvenanceLabel(currentFrame?.drivers[driver.abbr]?.interval, driver.position),
        interval: driver.intervalLabel,
        lastLapMs,
        bestLapMs,
      });
    }
    return map;
  }, [displayedDrivers, lapHistoryByDriver]);

  const featuredCompareKey = Object.keys(manifest.compare ?? {})[0] ?? null;
  const featuredCompareHref = featuredCompareKey
    ? `/compare/${route.season}/${route.grandPrix}/${route.session}/${featuredCompareKey.split("-")[0]}/${featuredCompareKey.split("-")[1]}`
    : null;
  const featuredStintHref = manifest.stints ? `/stints/${route.season}/${route.grandPrix}/${route.session}` : null;

  // When two or more drivers are pinned, build a live compare pack from their fastest laps in
  // the loaded laps list. When no pair is pinned but laps exist, fall back to the current
  // leader vs P2 so the panel always reflects who is actually on track right now.
  const dynamicCompare = useMemo<ComparePack | null>(() => {
    if (!lapRecords?.length) return null;

    let pair: [string, string] | null = null;
    if (selectedDrivers.length >= 2) {
      pair = [selectedDrivers[0], selectedDrivers[1]];
    } else if (displayedDrivers.length >= 2) {
      // Fallback: leader vs second on track. Avoids the hardcoded NOR vs VER from the
      // static manifest pack when nothing is shift-selected.
      pair = [displayedDrivers[0].abbr, displayedDrivers[1].abbr];
    }
    if (!pair) return null;
    const [leftCode, rightCode] = pair;

    const fastestFor = (code: string) =>
      lapRecords
        .filter((lap) => lap.driverCode === code && Number.isFinite(lap.lapTime) && lap.lapTime > 0)
        .sort((a, b) => a.lapTime - b.lapTime)[0] ?? null;
    const leftLap = fastestFor(leftCode);
    const rightLap = fastestFor(rightCode);
    if (!leftLap || !rightLap) return null;

    const leftSectors = [leftLap.sector1, leftLap.sector2, leftLap.sector3];
    const rightSectors = [rightLap.sector1, rightLap.sector2, rightLap.sector3];
    const sectorEnds = [
      leftLap.sector1 / leftLap.lapTime,
      (leftLap.sector1 + leftLap.sector2) / leftLap.lapTime,
      1,
    ];
    const deltaSections = leftSectors.map((sector, index) => {
      const rival = rightSectors[index];
      return {
        from: index === 0 ? 0 : sectorEnds[index - 1],
        to: sectorEnds[index],
        leader: sector <= rival ? leftCode : rightCode,
        deltaMs: Math.round(Math.abs(sector - rival) * 1000),
      };
    });
    const events = deltaSections.map((section, index) => {
      const note = section.leader === leftCode
        ? `${section.leader} faster through sector ${index + 1} by ${section.deltaMs} ms.`
        : `${section.leader} responds in sector ${index + 1} by ${section.deltaMs} ms.`;
      return {
        type: section.leader === leftCode ? "sector_gain" : "sector_response",
        driver: section.leader,
        corner: `S${index + 1}`,
        note,
      };
    });
    return {
      trackId: replay.trackId,
      drivers: [leftCode, rightCode] as [string, string],
      laps: [leftLap.lapNumber, rightLap.lapNumber] as [number, number],
      deltaSections,
      events,
    };
  }, [displayedDrivers, lapRecords, replay.trackId, selectedDrivers]);

  const activeCompare = dynamicCompare ?? compare;
  const pitCycleResult = useMemo(() => derivePitCycleOutcomes({
    session: route.session,
    frames: replay.frames,
    expectedFrameCount: replay.frameCount,
    totalTime: replay.totalTime,
    fullRaceLoaded,
    stintPack,
    lapRecords: lapRecords ?? null,
    raceControlMessages: replay.raceControlMessages,
  }), [fullRaceLoaded, lapRecords, replay.frameCount, replay.frames, replay.raceControlMessages, replay.totalTime, route.session, stintPack]);
  const availableAnalysisTabs: AnalysisTab[] = [
    "telemetry",
    ...(activeCompare || (!insightsReady && Object.keys(manifest.compare ?? {}).length) ? ["compare" as const] : []),
    ...(stintPack || (!insightsReady && manifest.stints) ? ["stints" as const] : []),
    ...(strategy || stintPack || (!insightsReady && (manifest.strategy || manifest.stints)) ? ["strategy" as const] : []),
    ...(stintPack || (!insightsReady && manifest.stints) ? ["pitcycles" as const] : []),
    "track",
    "waterfall",
    "battle",
    "corners",
    "sectors",
    ...(totalRaceControlMessages ? ["racecontrol" as const] : []),
  ];
  const decidingTab: AnalysisTab = strategy || stintPack
    ? "strategy"
    : totalRaceControlMessages
      ? "racecontrol"
      : "battle";
  const paceTab: AnalysisTab = activeCompare ? "compare" : "sectors";
  const analysisTitle = analysisTab === "telemetry"
    ? selectedTelemetryDrivers.length
      ? "Selected telemetry strips"
      : "Select drivers from the leaderboard"
    : analysisTab === "compare" && activeCompare
      ? `${activeCompare.drivers[0]} vs ${activeCompare.drivers[1]}`
      : analysisTab === "stints"
        ? "Tyre window snapshot"
        : ANALYSIS_TAB_LABELS[analysisTab];
  const storySteps = useMemo<StoryStep[]>(() => {
    const steps: StoryStep[] = [{
      id: "provenance",
      label: "Observed",
      title: "Start with the recorded evidence",
      detail: `${replaySourceLabel} · ${positionCoverage}.`,
      tab: "track",
    }];
    const raceControl = (replay.raceControlMessages ?? []).find((message) => {
      const category = categorizeRaceControlMessage(message);
      return category !== "other" && category !== "drs";
    });
    if (raceControl) {
      steps.push({
        id: "race-control",
        label: "Observed",
        title: raceControl.flag || RACE_CONTROL_BADGE_LABEL[categorizeRaceControlMessage(raceControl)],
        detail: raceControl.message,
        time: raceControl.t,
        tab: "racecontrol",
      });
    }
    if (activeCompare) {
      steps.push({
        id: "pace",
        label: "Derived",
        title: `${activeCompare.drivers[0]} vs ${activeCompare.drivers[1]} pace read`,
        detail: `${activeCompare.deltaSections.length} sector comparison${activeCompare.deltaSections.length === 1 ? "" : "s"} from recorded laps.`,
        tab: "compare",
        drivers: [...activeCompare.drivers],
      });
    } else if (replay.laps.some((lap) => typeof lap.sector1 === "number" || typeof lap.sector2 === "number" || typeof lap.sector3 === "number")) {
      steps.push({
        id: "sectors",
        label: "Derived",
        title: "Sector pace is available",
        detail: "Compare recorded sector times to locate the pace difference.",
        tab: "sectors",
      });
    }
    const stints = stintPack?.drivers.find((driver) => driver.stints.length);
    if (stints) {
      steps.push({
        id: "strategy",
        label: "Derived",
        title: `${stints.driverCode} tyre sequence`,
        detail: `${stints.stints.length} recorded stint${stints.stints.length === 1 ? "" : "s"} available for strategy context.`,
        tab: strategy ? "strategy" : "stints",
        drivers: [stints.driverCode],
      });
    } else if (strategy?.recommendedWindows.length) {
      const window = strategy.recommendedWindows[0];
      steps.push({
        id: "strategy-window",
        label: "Derived",
        title: `Strategy window: laps ${window.lapStart}–${window.lapEnd}`,
        detail: window.reason,
        tab: "strategy",
      });
    }
    if (suggestedDriver) {
      steps.push({
        id: "driver",
        label: "Derived",
        title: `Inspect ${suggestedDriver}`,
        detail: fastestLap?.driverCode === suggestedDriver && fastestLap.lapTime
          ? `Fastest recorded lap: ${formatLapTime(fastestLap.lapTime)}.`
          : "Suggested from the current recorded order.",
        tab: "telemetry",
        drivers: [suggestedDriver],
      });
    }
    return steps;
  }, [activeCompare, fastestLap, positionCoverage, replay.laps, replay.raceControlMessages, replaySourceLabel, strategy, stintPack, suggestedDriver]);

  const openAnalysis = useCallback((tab: AnalysisTab, drivers?: string[]) => {
    if (drivers?.length) {
      setSelectedDrivers(drivers.slice(0, 4));
    }
    setAnalysisTab(tab);
    window.requestAnimationFrame(() => {
      document.getElementById("analysis")?.scrollIntoView({ block: "start" });
    });
  }, []);

  useEffect(() => {
    if (!insightsReady) {
      return;
    }
    if (analysisTab === "compare" && !activeCompare) {
      setAnalysisTab(stintPack ? "stints" : "telemetry");
      return;
    }
    if (analysisTab === "stints" && !stintPack) {
      setAnalysisTab(activeCompare ? "compare" : "telemetry");
      return;
    }
    if (analysisTab === "strategy" && !strategy && !stintPack) {
      setAnalysisTab(activeCompare ? "compare" : "telemetry");
      return;
    }
    if (analysisTab === "pitcycles" && !stintPack) {
      setAnalysisTab(activeCompare ? "compare" : "telemetry");
    }
  }, [activeCompare, analysisTab, insightsReady, stintPack, strategy]);

  const syncPlaybackState = useCallback((time: number, frameIndex: number) => {
    playheadTimeRef.current = time;
    frameIndexRef.current = frameIndex;
    lastUiSyncRef.current = time;
    setPlaybackState({ currentTime: time, frameIndex });
  }, []);

  const handleSeek = useCallback((time: number) => {
    const nextTime = Math.max(0, Math.min(totalTime, time));
    onEnsureTimeLoaded?.(nextTime);
    const nextFrameIndex = findFrameIndexForTime(nextTime);
    syncPlaybackState(nextTime, nextFrameIndex);
    setSeekToken((value) => value + 1);
    setIsPlaying(false);
  }, [findFrameIndexForTime, onEnsureTimeLoaded, syncPlaybackState, totalTime]);

  const handleShareReplay = useCallback(async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("t", String(Math.round(playheadTimeRef.current * 10) / 10));
    url.searchParams.set("tab", analysisTab);
    if (selectedDrivers.length) {
      url.searchParams.set("drivers", selectedDrivers.join(","));
    } else {
      url.searchParams.delete("drivers");
    }
    url.hash = "analysis";
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setViewMode("workspace");
    setSyncWorkspaceUrl(true);
    try {
      await navigator.clipboard.writeText(url.href);
      setShareStatus("copied");
    } catch {
      setShareStatus("failed");
    }
  }, [analysisTab, selectedDrivers]);

  useEffect(() => {
    if (shareStatus === "idle") return;
    const timeout = window.setTimeout(() => setShareStatus("idle"), 2400);
    return () => window.clearTimeout(timeout);
  }, [shareStatus]);

  const handleSkipTime = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(totalTime, playheadTimeRef.current + delta));
    handleSeek(next);
  }, [handleSeek, totalTime]);

  const handleSkipLap = useCallback((delta: number) => {
    const targetLap = Math.max(1, (currentLap || 1) + delta);
    const targetFrame = replay.frames.findIndex((frame) => (frame.lap || 0) >= targetLap);
    const frame = replay.frames[targetFrame === -1 ? replay.frames.length - 1 : targetFrame];
    syncPlaybackState(frame?.t || 0, targetFrame === -1 ? replay.frames.length - 1 : targetFrame);
    setIsPlaying(false);
  }, [currentLap, replay.frames, syncPlaybackState]);

  const handleDriverSelect = useCallback((driverCode: string | null, append: boolean) => {
    if (!driverCode) {
      setSelectedDrivers([]);
      return;
    }

    setSelectedDrivers((previous) => {
      if (append) {
        return previous.includes(driverCode)
          ? previous.filter((entry) => entry !== driverCode)
          : [...previous, driverCode].slice(-4);
      }

      if (previous.length === 1 && previous[0] === driverCode) {
        return [];
      }

      return [driverCode];
    });
  }, []);

  const handleDriverPickerSelect = useCallback((driverCode: string) => {
    handleDriverSelect(driverCode, false);
  }, [handleDriverSelect]);

  const activateStoryStep = useCallback((step: StoryStep) => {
    setIsPlaying(false);
    if (typeof step.time === "number") {
      handleSeek(step.time);
    }
    setViewMode("workspace");
    setSyncWorkspaceUrl(true);
    if (step.tab) {
      openAnalysis(step.tab, step.drivers);
    }
  }, [handleSeek, openAnalysis]);

  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) {
      lastTimeRef.current = timestamp;
    }

    const deltaMs = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    let nextTime = playheadTimeRef.current + (deltaMs / 1000) * playbackSpeed;

    // Loop region wrap: when looping, never advance past `to`; jump back to `from`.
    if (loopActive && loopBounds.from !== null && loopBounds.to !== null && loopBounds.to > loopBounds.from) {
      if (nextTime >= loopBounds.to) {
        nextTime = loopBounds.from;
      } else if (nextTime < loopBounds.from) {
        nextTime = loopBounds.from;
      }
    }

    if (nextTime >= totalTime) {
      syncPlaybackState(totalTime, replay.frames.length - 1);
      setIsPlaying(false);
      return;
    }

    if (nextTime > loadedEndTime && loadedEndTime < totalTime) {
      onEnsureTimeLoaded?.(nextTime);
      playheadTimeRef.current = loadedEndTime;
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    playheadTimeRef.current = nextTime;
    onEnsureTimeLoaded?.(Math.min(totalTime, nextTime + Math.max(24, playbackSpeed * 28)));
    const nextFrameIndex = findFrameIndexForTime(nextTime);
    const frameChanged = nextFrameIndex !== frameIndexRef.current;
    const uiDue = (nextTime - lastUiSyncRef.current) * 1000 >= UI_SYNC_INTERVAL_MS;

    if (frameChanged || uiDue) {
      frameIndexRef.current = nextFrameIndex;
      lastUiSyncRef.current = nextTime;
      setPlaybackState({ currentTime: nextTime, frameIndex: nextFrameIndex });
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [findFrameIndexForTime, loadedEndTime, loopActive, loopBounds.from, loopBounds.to, onEnsureTimeLoaded, playbackSpeed, replay.frames.length, syncPlaybackState, totalTime]);

  // Fire a "purple sector" banner whenever a new fastest lap is set.
  useEffect(() => {
    if (!fastestLap || typeof fastestLap.lapTime !== "number") return;
    const time = fastestLap.lapTime;
    const last = lastFastestRef.current;
    if (last === null) {
      lastFastestRef.current = time;
      return;
    }
    if (time < last - 0.01) {
      lastFastestRef.current = time;
      setFastestLapToast({ driver: fastestLap.driverCode, time, key: Date.now() });
      const handle = window.setTimeout(() => setFastestLapToast(null), 3500);
      return () => window.clearTimeout(handle);
    }
  }, [fastestLap]);

  useEffect(() => {
    onEnsureTimeLoaded?.(Math.min(totalTime, currentTime + Math.max(24, playbackSpeed * 28)));
  }, [currentTime, onEnsureTimeLoaded, playbackSpeed, totalTime]);

  useEffect(() => {
    const nextFrameIndex = findFrameIndexForTime(playheadTimeRef.current);
    frameIndexRef.current = nextFrameIndex;
    setPlaybackState((previous) => {
      if (previous.frameIndex === nextFrameIndex && previous.currentTime === playheadTimeRef.current) {
        return previous;
      }
      return {
        currentTime: playheadTimeRef.current,
        frameIndex: nextFrameIndex,
      };
    });
  }, [findFrameIndexForTime, replay.frames]);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = 0;
      animationRef.current = requestAnimationFrame(animate);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate, isPlaying]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "CANVAS"].includes(tagName)) {
        return;
      }

      if (event.code === "Backquote") {
        event.preventDefault();
        setShowDebug((value) => !value);
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setIsPlaying((playing) => !playing);
        return;
      }

      if (event.code === "ArrowLeft") {
        event.preventDefault();
        handleSkipTime(event.shiftKey ? -30 : -5);
        return;
      }

      if (event.code === "ArrowRight") {
        event.preventDefault();
        handleSkipTime(event.shiftKey ? 30 : 5);
        return;
      }

      if (event.code === "BracketLeft") {
        event.preventDefault();
        handleSkipLap(-1);
        return;
      }

      if (event.code === "BracketRight") {
        event.preventDefault();
        handleSkipLap(1);
        return;
      }

      if (event.code === "Digit1") setPlaybackSpeed(0.5);
      if (event.code === "Digit2") setPlaybackSpeed(1);
      if (event.code === "Digit3") setPlaybackSpeed(2);
      if (event.code === "Digit4") setPlaybackSpeed(4);
      if (event.code === "Digit5") setPlaybackSpeed(8);
      if (event.code === "KeyR") {
        event.preventDefault();
        handleSeek(0);
      }
      if (event.code === "KeyD") setShowDrsZones((value) => !value);
      if (event.code === "KeyL") setShowDriverLabels((value) => !value);
      if (event.code === "KeyB") setShowEvents((value) => !value);
      if (event.code === "KeyM") setShowMarshalSectors((value) => !value);
      if (event.code === "KeyI") {
        event.preventDefault();
        setLoopBounds((previous) => ({ ...previous, from: playheadTimeRef.current }));
      }
      if (event.code === "KeyO") {
        event.preventDefault();
        setLoopBounds((previous) => ({ ...previous, to: playheadTimeRef.current }));
      }
      if (event.code === "KeyP") {
        event.preventDefault();
        setLoopActive((value) => !value);
      }
      if (event.code === "Slash" && event.shiftKey) {
        event.preventDefault();
        setShowShortcuts((value) => !value);
      }
      if (event.code === "Escape" && showShortcuts) {
        event.preventDefault();
        setShowShortcuts(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSeek, handleSkipLap, handleSkipTime, showShortcuts]);

  return (
    <div className={`replay-view replay-view--workspace replay-view--${viewMode}`}>
      {showDebug ? (
        <ReplayDebugPanel
          currentTime={currentTime}
          frameIndex={currentFrameIndex}
          loadedFrames={replay.frames.length}
          totalFrameCount={replay.frameCount ?? null}
          playbackSpeed={playbackSpeed}
          loadedEndTime={loadedEndTime}
          chunkIndex={replay.frameChunkIndex ?? null}
          frame={rawCurrentFrame}
          nextFrameT={rawNextFrame?.t ?? null}
          selectedDrivers={selectedDrivers}
        />
      ) : null}
      <section className="replay-session-banner">
        <div className="replay-session-banner__identity">
          <p className="eyebrow">Replay {viewMode}</p>
          <div className="replay-mode-toggle" role="group" aria-label="Replay mode">
            {(["story", "workspace"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={viewMode === mode ? "replay-mode-toggle__button replay-mode-toggle__button--active" : "replay-mode-toggle__button"}
                aria-pressed={viewMode === mode}
                onClick={() => {
                  setViewMode(mode);
                  if (mode === "workspace") {
                    setSyncWorkspaceUrl(true);
                    return;
                  }
                  const url = new URL(window.location.href);
                   url.searchParams.delete("t");
                   url.searchParams.delete("tab");
                   url.searchParams.delete("drivers");
                   url.searchParams.delete("focus");
                   url.hash = "";
                   window.history.replaceState({}, "", `${url.pathname}${url.search}`);

                  setSyncWorkspaceUrl(false);
                }}
              >
                {mode === "story" ? "Story" : "Workspace"}
              </button>
            ))}
          </div>
          <h1>{replay.grandPrix}</h1>
          <p>
            {replay.session} replay at {trackLabel}. One dense control surface for order, track state, telemetry, and comparison work.
          </p>
        </div>
        <div className="replay-session-banner__facts">
          <article className="replay-session-banner__fact">
            <span>Status</span>
            <strong>{trackStatus}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Replay clock</span>
            <strong>{formatSeconds(currentTime)} / {formatSeconds(totalTime)}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Lap</span>
            <strong>{lapLabel}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Track</span>
            <strong>{trackLabel}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Weather</span>
            <strong>{weatherLabel}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>{currentWeather ? "Wind" : "Forecast"}</span>
            <strong>{windLabel}</strong>
          </article>
        </div>
        <div className="replay-session-banner__footer">
          <p className="replay-session-banner__note">
            {replayBannerNote}
          </p>
          <div className="replay-session-banner__trust" aria-label="Replay data provenance">
            <span>{replaySourceLabel}</span>
            <span>{positionCoverage}</span>
            <span>{replayPackLabel}</span>
            <span>Generated {replay.generatedAt.slice(0, 10)}</span>
          </div>
          <div className="replay-session-banner__actions">
            <button className="replay-session-banner__action replay-session-banner__action--primary" type="button" onClick={() => void handleShareReplay()}>
              {shareStatus === "copied" ? "Link copied" : shareStatus === "failed" ? "Copy failed" : "Copy evidence link"}
            </button>
            <a className="replay-session-banner__action" href="/replay">Replay library</a>
            <a className="replay-session-banner__action" href="/cars/current-spec">Modelview</a>
            <a className="replay-session-banner__action" href="/learn">Learn</a>
            <a className="replay-session-banner__action" href={`/sessions/${route.season}/${route.grandPrix}/${route.session}`}>Session summary</a>
          </div>
        </div>
      </section>

      {replayFocus ? (
        <section className="replay-focus-callout">
          <div>
            <p className="eyebrow">Engineering lens</p>
            <h2>{replayFocus.replayTitle}</h2>
            <p>{replayFocus.replaySummary}</p>
          </div>
          <div className="replay-focus-callout__actions">
            <a className="button button--ghost" href={replayFocus.learnHref}>{replayFocus.learnLabel}</a>
            <a className="button button--secondary" href={`/cars/current-spec?focus=${replayFocus.id}`}>Return to modelview</a>
            {suggestedDriver ? (
              <button type="button" className="button" onClick={() => handleDriverSelect(suggestedDriver, false)}>
                Inspect {suggestedDriver}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {viewMode === "story" ? (
        <section className="replay-story" aria-labelledby="replay-story-title">
          <div className="replay-story__header">
            <p className="eyebrow">Guided story</p>
            <h2 id="replay-story-title">Follow the evidence.</h2>
            <p>Each step pauses the replay and opens the existing evidence behind the read.</p>
          </div>
          <ol className="replay-story__steps">
            {storySteps.map((step, index) => (
              <li key={step.id}>
                <button type="button" onClick={() => activateStoryStep(step)}>
                  <span className="replay-story__index">{String(index + 1).padStart(2, "0")}</span>
                  <span className={`replay-story__label replay-story__label--${step.label.toLowerCase()}`}>{step.label}</span>
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                  <small>{step.time === undefined ? "Open analysis" : `Pause at T+${Math.floor(step.time)}s`}</small>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {viewMode === "workspace" ? (
        <>
          <div className="replay-workspace-grid replay-workspace-grid--stacked">
        <section className="replay-track-panel">
          <div className="replay-track-panel__header">
            <div className="replay-track-panel__title">
              <p className="eyebrow">Track stage</p>
              <h2>{trackLabel}</h2>
              <p>
                {trackViewMode === "3d"
                  ? "Choose a broadcast camera, or use Orbit to rotate and zoom. Select a car to inspect its telemetry."
                  : "Drag to pan · Shift+wheel to zoom · Right-drag (or Alt+drag) to rotate · Double-click or 0 to reset · Arrow keys pan · +/- zoom · Click a marker to inspect."}
              </p>
            </div>
            <div className="replay-track-panel__stats">
              <div>
                <span>Track status</span>
                <strong>{trackStatus}</strong>
              </div>
              <div>
                <span>Selected</span>
                <strong>{selectedDrivers.length || 0}</strong>
              </div>
              <button
                type="button"
                className={`replay-track-panel__messages-button${showHoverFieldsMenu ? " replay-track-panel__messages-button--open" : ""}`}
                onClick={() => setShowHoverFieldsMenu((value) => !value)}
                aria-expanded={showHoverFieldsMenu}
                aria-label="Configure hover tooltip fields"
              >
                <span>Tooltip</span>
                <strong>{Object.values(hoverFields).filter(Boolean).length}</strong>
              </button>
              <button
                type="button"
                className={`replay-track-panel__messages-button${showMessageList ? " replay-track-panel__messages-button--open" : ""}`}
                onClick={() => setShowMessageList((value) => !value)}
                aria-expanded={showMessageList}
                aria-label="Toggle race control messages"
                disabled={totalRaceControlMessages === 0}
              >
                <span>Messages</span>
                <strong>{totalRaceControlMessages}</strong>
              </button>
            </div>
          </div>

          {showHoverFieldsMenu ? (
            <div className="replay-track-panel__hover-menu" role="group" aria-label="Track tooltip fields">
              {([
                ["position", "Position"],
                ["team", "Team"],
                ["gap", "Gap"],
                ["lastLap", "Last lap"],
                ["bestLap", "Best lap"],
                ["tyre", "Tyre"],
                ["speed", "Speed"],
                ["drs", "DRS"],
              ] as const).map(([key, label]) => (
                <label key={key} className={`replay-track-panel__hover-toggle${hoverFields[key] ? " replay-track-panel__hover-toggle--active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={hoverFields[key]}
                    onChange={(event) => setHoverFields((prev) => ({ ...prev, [key]: event.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          ) : null}

          <div className="replay-track-panel__chips">
            <span className="replay-track-chip replay-track-chip--accent">{replaySourceLabel}</span>
            {leadDriver ? <span className="replay-track-chip">Leader {leadDriver.abbr}</span> : null}
            {fastestLap?.lapTime ? <span className="replay-track-chip">Fastest {fastestLap.driverCode} · {formatLapTime(fastestLap.lapTime)}</span> : null}
            <span className="replay-track-chip">Selected {selectedDrivers.length || 0}</span>
            {replayFocus ? <span className="replay-track-chip">Focus {replayFocus.title}</span> : null}
          </div>

          <div className="replay-heatmap-control" role="group" aria-label="Racing-line telemetry heatmap">
            <span className="replay-heatmap-control__label">View</span>
            {([
              ["2d", "2D"],
              ["3d", "3D"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`replay-heatmap-button${trackViewMode === key ? " replay-heatmap-button--active" : ""}`}
                aria-pressed={trackViewMode === key}
                onClick={() => {
                  setTrackViewNotice(null);
                  setTrackViewMode(key);
                }}
              >
                {label}
              </button>
            ))}
            <span className="replay-heatmap-control__label">Racing line</span>
            {([
              ["off", "Off"],
              ["speed", "Speed"],
              ["throttle", "Throttle"],
              ["brake", "Brake"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`replay-heatmap-button${heatmapChannel === key ? " replay-heatmap-button--active" : ""}`}
                aria-pressed={heatmapChannel === key}
                onClick={() => setHeatmapChannel(key)}
              >
                {label}
              </button>
            ))}
            {heatmapChannel !== "off" && !selectedDrivers.length && !focusId ? (
              <span className="replay-heatmap-control__hint">Select a driver to colour their lap</span>
            ) : null}
           </div>
           <div className="replay-driver-picker" role="group" aria-labelledby="replay-driver-picker-label">
             <div>
               <span className="replay-driver-picker__label" id="replay-driver-picker-label">Driver picker</span>
               <p id="replay-driver-picker-help">Keyboard equivalent for track-marker selection. Choose any available driver; selection updates the leaderboard, telemetry, and evidence link.</p>
             </div>
             <select
               aria-describedby="replay-driver-picker-help replay-driver-picker-status"
               aria-label="Select a replay driver"
               value={selectedDrivers.length === 1 ? selectedDrivers[0] : ""}
               onChange={(event) => {
                 setFocusedDriver(event.target.value || null);
                 if (event.target.value) {
                   handleDriverPickerSelect(event.target.value);
                 } else {
                   handleDriverSelect(null, false);
                 }
               }}
               onFocus={(event) => setFocusedDriver(event.currentTarget.value || null)}
               onBlur={() => setFocusedDriver(null)}
             >
               <option value="">{selectedDrivers.length > 1 ? `${selectedDrivers.length} drivers selected` : "No driver selected"}</option>
               {replay.drivers.map((driver) => {
                 const currentDriver = displayedDrivers.find((entry) => entry.abbr === driver.driverCode);
                 return (
                   <option key={driver.driverCode} value={driver.driverCode}>
                     P{currentDriver?.position ?? "-"} · {driver.driverCode} · {driver.fullName}
                   </option>
                 );
               })}
             </select>
             <p className="replay-driver-picker__status" id="replay-driver-picker-status" role="status">
               {focusedDriver ? `Focused ${focusedDriver}. ` : ""}{selectedDrivers.length ? `Selected ${selectedDriverLabel}.` : "No driver selected."}
             </p>
           </div>
           {trackViewNotice ? <p className="replay-track-panel__notice" role="status">{trackViewNotice}</p> : null}
           <div className="replay-track-panel__canvas">
            {fastestLapToast ? (
              <div key={fastestLapToast.key} className="fastest-lap-banner">
                ⚡ Fastest lap · {fastestLapToast.driver} · {formatLapTime(fastestLapToast.time)}
              </div>
            ) : null}
            {trackViewMode === "3d" ? (
              <ReplayScene3D
                trackPath={replay.trackPath}
                trackMetadata={replay.trackMetadata ?? null}
                drivers={replay.drivers}
                currentFrame={currentFrame}
                nextFrame={nextFrame}
                playheadTimeRef={playheadTimeRef}
                clockSeconds={currentTime}
                isPlaying={isPlaying}
                seekToken={seekToken}
                estimatedLapDuration={estimatedLapDuration}
                selectedDrivers={selectedDrivers}
                showDrsZones={showDrsZones}
                showEvents={showEvents}
                showMarshalSectors={showMarshalSectors}
                drsZones={effectiveDrsZones}
                marshalSectors={replay.trackMetadata?.marshalSectors ?? []}
                activeMarshalFlagBySector={activeMarshalFlagBySector}
                pitPulses={activePitPulses}
                heatmapChannel={heatmapChannel}
                heatmapSamples={heatmapSamples}
                onDriverSelect={handleDriverSelect}
                onUnavailable={(message) => {
                  setTrackViewNotice(message);
                  setTrackViewMode("2d");
                }}
              />
            ) : (
            <TrackCanvas
              trackPath={replay.trackPath}
              drivers={replay.drivers}
              currentFrame={currentFrame}
              nextFrame={nextFrame}
              selectedDrivers={selectedDrivers}
              showDriverLabels={showDriverLabels}
              showDrsZones={showDrsZones}
              showCorners={showEvents}
              showMarshalSectors={showMarshalSectors}
              corners={replay.trackMetadata?.corners ?? []}
              drsZones={effectiveDrsZones}
              marshalSectors={replay.trackMetadata?.marshalSectors ?? []}
              activeMarshalFlagBySector={activeMarshalFlagBySector}
              pitPulses={activePitPulses}
              clockSeconds={currentTime}
              playheadTimeRef={playheadTimeRef}
              trackTotalLength={replay.trackMetadata?.length}
              projectMarkersToTrack={projectMarkers}
              estimatedLapDuration={estimatedLapDuration}
              hoverMetaByCode={hoverMetaByCode}
              hoverFields={hoverFields}
              heatmapChannel={heatmapChannel}
              heatmapSamples={heatmapSamples}
              onDriverClick={handleDriverSelect}
            />
            )}

            {(showMessageList && totalRaceControlMessages > 0) ? (
              <div className="replay-race-control replay-race-control--expanded">
                <div className="replay-race-control__header">
                  <p>Race control · {totalRaceControlMessages}</p>
                  <button
                    type="button"
                    className="replay-race-control__close"
                    onClick={() => setShowMessageList(false)}
                    aria-label="Close race control feed"
                  >
                    Close
                  </button>
                </div>
                <div className="replay-race-control__filters" role="tablist" aria-label="Filter race control messages">
                  {RACE_CONTROL_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      role="tab"
                      aria-selected={raceControlFilter === filter.id}
                      className={`replay-race-control__filter${raceControlFilter === filter.id ? " replay-race-control__filter--active" : ""}`}
                      onClick={() => setRaceControlFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <ul>
                  {filteredRaceControlMessages.length ? filteredRaceControlMessages.map((entry) => {
                    const elapsed = entry.index <= lastElapsedRcIndex;
                    return (
                      <li key={`${entry.message.t}-${entry.index}`}>
                        <button
                          type="button"
                          className={`replay-race-control__row${elapsed ? "" : " replay-race-control__row--upcoming"}`}
                          onClick={() => handleSeek(entry.message.t)}
                          title={`Seek to T+${Math.floor(entry.message.t)}s`}
                        >
                          <strong>{entry.message.flag || RACE_CONTROL_BADGE_LABEL[entry.category] || entry.message.category || "MSG"}</strong>
                          <span>
                            T+{Math.floor(entry.message.t)}s{entry.message.lapNumber ? ` · Lap ${entry.message.lapNumber}` : ""} · {entry.message.message}
                          </span>
                        </button>
                      </li>
                    );
                  }) : (
                    <li className="replay-race-control__empty">No messages match this filter.</li>
                  )}
                </ul>
              </div>
            ) : activeRaceControlMessages.length ? (
              <div className="replay-race-control">
                <p>Race control</p>
                <ul>
                  {activeRaceControlMessages.map((message) => (
                    <li key={`${message.t}-${message.message}`}>
                      <button
                        type="button"
                        className="replay-race-control__row"
                        onClick={() => handleSeek(message.t)}
                        title={`Seek to T+${Math.floor(message.t)}s`}
                      >
                        <strong>{message.flag || message.category}</strong>
                        <span>
                          T+{Math.floor(message.t)}s{message.lapNumber ? ` · Lap ${message.lapNumber}` : ""} · {message.message}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {stageDrivers.length ? (
              <div className="replay-stage-order">
                {stageDrivers.map((driver) => (
                  <button
                    key={driver.abbr}
                    type="button"
                    className={`replay-stage-order__chip${selectedDrivers.includes(driver.abbr) ? " replay-stage-order__chip--selected" : ""}`}
                    onClick={() => handleDriverSelect(driver.abbr, false)}
                  >
                    <span className="replay-stage-order__position">{driver.position}</span>
                    <span className="replay-stage-order__driver">{driver.abbr}</span>
                    <span className="replay-stage-order__gap">{driver.intervalLabel}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <PlaybackControls
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            currentTime={currentTime}
            totalTime={totalTime}
            loadedTime={loadedEndTime}
            currentLap={currentLap}
            totalLaps={totalLaps}
            trackStatus={trackStatus}
            events={replayEvents}
            segments={replaySegments}
            showDriverLabels={showDriverLabels}
            showDrsZones={showDrsZones}
            showEvents={showEvents}
            showMarshalSectors={showMarshalSectors}
            estimatedLapDuration={estimatedLapDuration}
            loopActive={loopActive}
            loopFromTime={loopBounds.from}
            loopToTime={loopBounds.to}
            loadProgress={fullLoadProgress}
            onToggleLabels={() => setShowDriverLabels((value) => !value)}
            onToggleDrsZones={() => setShowDrsZones((value) => !value)}
            onToggleEvents={() => setShowEvents((value) => !value)}
            onToggleMarshalSectors={() => setShowMarshalSectors((value) => !value)}
            onToggleLoop={() => setLoopActive((value) => !value)}
            onMarkLoopIn={() => setLoopBounds((previous) => ({ ...previous, from: playheadTimeRef.current }))}
            onMarkLoopOut={() => setLoopBounds((previous) => ({ ...previous, to: playheadTimeRef.current }))}
            onClearLoop={() => { setLoopBounds({ from: null, to: null }); setLoopActive(false); }}
            onShowShortcuts={() => setShowShortcuts(true)}
            onRestart={() => handleSeek(0)}
            onSpeedChange={setPlaybackSpeed}
            onSeek={handleSeek}
            onSkipLap={handleSkipLap}
            onSkipTime={handleSkipTime}
            onLoadFullRace={onLoadFullRace}
            onPlay={() => {
              if (playheadTimeRef.current >= totalTime) {
                syncPlaybackState(0, 0);
              }
              setIsPlaying(true);
            }}
            onPause={() => setIsPlaying(false)}
          />
        </section>

        <aside className="replay-side-column replay-side-column--stacked">
          <section className="replay-side-card">
            <p className="eyebrow">Current read</p>
            <h3>{selectedTelemetryDrivers.length ? `Telemetry on ${selectedDriverLabel}` : leadDriver ? `${leadDriver.abbr} anchors the replay` : "Pick a driver to inspect"}</h3>
            <p>
              Use the stage and order rail as the fast layer. The deck below is for telemetry, compare, and tyre-window reads.
            </p>
            <dl className="replay-side-card__stats">
              <div>
                <dt>Leader</dt>
                <dd>{leadDriver ? `${leadDriver.abbr} · ${leadDriver.team}` : "-"}</dd>
              </div>
              <div>
                <dt>Fastest lap</dt>
                <dd>{fastestLapLabel}</dd>
              </div>
              <div>
                <dt>Selected</dt>
                <dd>{selectedDriverLabel}</dd>
              </div>
              <div>
                <dt>Hotkeys</dt>
                <dd>Space · [ ] · 1-4x</dd>
              </div>
            </dl>
          </section>

          <Leaderboard
            drivers={displayedDrivers}
            selectedDrivers={selectedDrivers}
            onDriverSelect={handleDriverSelect}
            layout={leaderboardLayout}
            onLayoutChange={setLeaderboardLayout}
          />
        </aside>
      </div>

      <section id="analysis" className="replay-support-panel" aria-labelledby="analysis-title">
        <div className="section-header replay-support-panel__header">
          <div>
            <p className="eyebrow">Analysis deck</p>
            <h2 id="analysis-title">{analysisTitle}</h2>
          </div>
          <label className="replay-support-panel__select">
            <span>Analysis view</span>
            <select value={analysisTab} onChange={(event) => setAnalysisTab(event.target.value as AnalysisTab)}>
              {availableAnalysisTabs.map((tab) => (
                <option key={tab} value={tab}>{ANALYSIS_TAB_LABELS[tab]}</option>
              ))}
            </select>
          </label>
          <div className="replay-support-panel__tabs" role="tablist" aria-label="Replay analysis views">
            {availableAnalysisTabs.map((tab) => (
              <button
                key={tab}
                id={`analysis-tab-${tab}`}
                type="button"
                role="tab"
                aria-selected={analysisTab === tab}
                aria-controls="analysis-panel"
                className={`replay-support-panel__tab${analysisTab === tab ? " replay-support-panel__tab--active" : ""}`}
                onClick={() => setAnalysisTab(tab)}
              >
                {ANALYSIS_TAB_LABELS[tab]}
                {tab === "telemetry" && selectedTelemetryDrivers.length ? ` · ${selectedTelemetryDrivers.length}` : ""}
                {tab === "compare" && dynamicCompare ? " · live" : ""}
                {tab === "racecontrol" ? ` · ${totalRaceControlMessages}` : ""}
              </button>
            ))}
          </div>
        </div>
        <div id="analysis-panel" role="tabpanel" aria-labelledby={`analysis-tab-${analysisTab}`} tabIndex={0}>
        {!insightsReady && ["compare", "stints", "strategy", "pitcycles"].includes(analysisTab) ? (
          <p className="replay-empty-copy" role="status">Loading this analysis pack...</p>
        ) : null}
        {insightsStatus === "unavailable" ? (
          <p className="replay-empty-copy" role="status">Some optional analysis packs are unavailable. Playback, driver selection, and loaded telemetry remain available.</p>
        ) : null}

        {analysisTab === "telemetry" ? (
          <>
            {selectedTelemetryDrivers.length ? (
              <div className="replay-telemetry-panel__selection">
                {selectedTelemetryDrivers.map((driver) => (
                  <span className="replay-telemetry-panel__selection-chip" key={driver.abbr}>
                    <span className="replay-telemetry-panel__selection-dot" style={{ backgroundColor: driver.color }} />
                    <strong>{driver.abbr}</strong>
                  </span>
                ))}
              </div>
            ) : (
              <p className="replay-telemetry-panel__hint">Use the track map or leaderboard to load telemetry cards.</p>
            )}

            {selectedTelemetryDrivers.length ? (
              <div className="replay-telemetry-stack">
                {selectedTelemetryDrivers.map((driver) => (
                  <ReplayTelemetryStrip key={driver.abbr} driver={driver} />
                ))}
              </div>
            ) : (
              <p className="replay-empty-copy">
                Choose one driver for a focused lap read, or shift-click several drivers to compare telemetry strips side by side.
              </p>
            )}
          </>
        ) : null}

        {analysisTab === "compare" && activeCompare ? (
          <ReplayComparePanel
            compare={activeCompare}
            legacyHref={activeCompare.drivers.join("-") === featuredCompareKey ? featuredCompareHref : null}
            embedded
          />
        ) : null}

        {analysisTab === "stints" && stintPack ? (
          <ReplayStintPanel stintPack={stintPack} legacyHref={featuredStintHref} embedded />
        ) : null}

        {analysisTab === "strategy" ? (
          <ReplayStrategyPanel strategy={strategy ?? null} stintPack={stintPack} selectedDrivers={selectedDrivers} />
        ) : null}

        {analysisTab === "pitcycles" ? (
          <ReplayPitCyclePanel
            result={pitCycleResult}
            selectedDrivers={selectedDrivers}
            strategy={strategy ?? null}
            loadProgress={fullLoadProgress}
            onLoadFullRace={onLoadFullRace}
            onSeek={handleSeek}
          />
        ) : null}

        {analysisTab === "track" ? (
          <ReplayTrackInfoPanel replay={replay} trackId={replay.trackId} derivedDrsZoneCount={derivedDrsZones?.length ?? null} />
        ) : null}

        {analysisTab === "waterfall" ? (
          <ReplayLapWaterfall laps={replay.laps} drivers={replay.drivers} />
        ) : null}

        {analysisTab === "battle" ? (
          <ReplayBattleGraph replay={replay} selectedDrivers={selectedDrivers} />
        ) : null}

        {analysisTab === "corners" ? (
          <ReplayCornerSpeeds replay={replay} selectedDrivers={selectedDrivers} focusId={focusId} />
        ) : null}

        {analysisTab === "sectors" ? (
          <ReplaySectorDominance replay={replay} selectedDrivers={selectedDrivers} />
        ) : null}

        {analysisTab === "racecontrol" ? (
          <section className="replay-insight-panel replay-insight-panel--embedded replay-rc-panel">
            <div className="replay-race-control__filters" role="tablist" aria-label="Filter race control messages">
              {RACE_CONTROL_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  role="tab"
                  aria-selected={raceControlFilter === filter.id}
                  className={`replay-race-control__filter${raceControlFilter === filter.id ? " replay-race-control__filter--active" : ""}`}
                  onClick={() => setRaceControlFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <ul className="replay-rc-panel__list">
              {filteredRaceControlMessages.length ? filteredRaceControlMessages.map((entry) => {
                const elapsed = entry.index <= lastElapsedRcIndex;
                return (
                  <li key={`rc-${entry.index}`}>
                    <button
                      type="button"
                      className={`replay-race-control__row${elapsed ? "" : " replay-race-control__row--upcoming"}`}
                      onClick={() => handleSeek(entry.message.t)}
                    >
                      <strong>{entry.message.flag || entry.message.category || "MSG"}</strong>
                      <span>
                        T+{Math.floor(entry.message.t)}s{entry.message.lapNumber ? ` · Lap ${entry.message.lapNumber}` : ""} · {entry.message.message}
                      </span>
                    </button>
                  </li>
                );
              }) : (
                <li className="replay-race-control__empty">No messages match this filter.</li>
              )}
            </ul>
          </section>
        ) : null}
        </div>
      </section>
        </>
      ) : null}

      {showShortcuts ? (
        <div className="shortcut-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={() => setShowShortcuts(false)}>
          <div className="shortcut-overlay__panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <p className="eyebrow">Keyboard shortcuts</p>
              <button type="button" onClick={() => setShowShortcuts(false)} aria-label="Close shortcuts">Close</button>
            </header>
            <ul>
              <li><kbd>Space</kbd><span>Play / pause</span></li>
              <li><kbd>← / →</kbd><span>Seek 5s</span></li>
              <li><kbd>Shift</kbd> + <kbd>← / →</kbd><span>Seek 30s</span></li>
              <li><kbd>[</kbd> / <kbd>]</kbd><span>Previous / next lap</span></li>
              <li><kbd>R</kbd><span>Restart from start</span></li>
              <li><kbd>1</kbd>–<kbd>5</kbd><span>Speed presets (0.5×, 1×, 2×, 4×, 8×)</span></li>
              <li><kbd>I</kbd> / <kbd>O</kbd><span>Mark loop in / out</span></li>
              <li><kbd>P</kbd><span>Toggle loop playback</span></li>
              <li><kbd>L</kbd> / <kbd>D</kbd> / <kbd>B</kbd> / <kbd>M</kbd><span>Labels / DRS / events / marshals</span></li>
              <li><kbd>Shift</kbd> + wheel<span>Zoom track canvas</span></li>
              <li><kbd>Alt</kbd> + drag<span>Rotate track canvas</span></li>
              <li>Double-click<span>Reset track view</span></li>
              <li><kbd>?</kbd><span>Toggle this help</span></li>
              <li><kbd>Esc</kbd><span>Close this help / clear selection</span></li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
