"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReplayFrame, ReplayLap, ReplayMetaPack, ReplayPack, ReplayRaceControlMessage, SessionSummary } from "@/lib/data";
import { buildClientDataUrl, buildClientWebSocketUrl, getClientApiOrigin } from "@/lib/client-data";
import { Leaderboard, type ReplayLeaderboardRow } from "@/components/replay/Leaderboard";
import { loadReplayChunkQueue, validateReplayFrameChunk, validateReplayMeta } from "@/components/replay/replay-chunks";
import { ReplayTelemetryStrip } from "@/components/replay/replay-telemetry-strip";
import { ReplayLapWaterfall } from "@/components/replay/replay-insights";
import { TrackCanvas } from "@/components/replay/TrackCanvas";
import { getCircuitArt } from "@/lib/art";

export interface LiveSessionRef {
  season: number;
  grandPrix: string;
  grandPrixName: string;
  session: string;
  sessionName: string;
  trackId: string;
  sessionKey: number;
  path: string;
  source: string;
}

interface LiveStatusResponse {
  live: {
    season: number;
    grandPrixSlug: string;
    grandPrixName: string;
    sessionSlug: string;
    sessionName: string;
    trackId: string;
    sessionKey: number;
    path: string;
    source: string;
  } | null;
}

interface LiveFeedState {
  loading: boolean;
  connected: boolean;
  finished: boolean;
  sourceLabel: string;
  frame: ReplayFrame | null;
  rcMessages: ReplayRaceControlMessage[];
  error: string | null;
  lastFrameAt: number | null;
  isSimulated: boolean;
}

interface LiveRouteClientProps {
  initialSession: LiveSessionRef;
  initialSummary: SessionSummary;
  initialReplayMeta: ReplayMetaPack;
  initialFrame: ReplayFrame | null;
  initialSpeed: number;
  mode?: "live" | "race-desk";
}

function hasStaticTrackCoordinates(frames?: ReplayPack["frames"]) {
  if (!frames || frames.length < 2) {
    return false;
  }

  const firstFrame = frames[0];
  const sampleCodes = Object.keys(firstFrame.drivers).slice(0, 6);
  if (!sampleCodes.length) {
    return false;
  }

  const sampleIndexes = Array.from(new Set([
    1,
    Math.floor(frames.length * 0.2),
    Math.floor(frames.length * 0.4),
    Math.floor(frames.length * 0.6),
    Math.floor(frames.length * 0.8),
    frames.length - 1,
  ].filter((index) => index > 0 && index < frames.length)));

  const sampleFrames = sampleIndexes.map((index) => frames[index]);
  return sampleCodes.every((driverCode) => {
    const baseline = firstFrame.drivers[driverCode];
    if (!baseline || baseline.x === null || baseline.y === null) {
      return false;
    }

    return sampleFrames.every((frame) => {
      const current = frame.drivers[driverCode];
      return !!current && current.x === baseline.x && current.y === baseline.y;
    });
  });
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

function intervalLabel(interval: number | null, position?: number) {
  if (position === 1) {
    return "Leader";
  }
  if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0) {
    return "Unavailable";
  }
  return `+${interval.toFixed(3)}`;
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

function formatSlugLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatWeatherValue(value: number | null, unit: string) {
  return value === null ? "Unavailable" : `${value}${unit}`;
}

function formatLiveSourceLabel(value: string | null | undefined) {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("live") || normalized.includes("oci")) {
    return "OCI live";
  }
  if (normalized.includes("replay") || normalized.includes("sim")) {
    return "OCI replay fallback";
  }
  return value ? formatSlugLabel(value) : "OCI live";
}

function normalizeRaceControlMessages(messages: ReplayRaceControlMessage[], totalTime: number) {
  const msThreshold = totalTime > 0 ? totalTime * 1.5 : 7200;
  return messages
    .map((message) => ({
      ...message,
      t: message.t > msThreshold ? message.t / 1000 : message.t,
    }))
    .sort((left, right) => left.t - right.t);
}

function buildSessionBasePath(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">) {
  return `/data/packs/seasons/${route.season}/${route.grandPrix}/${route.session}`;
}

function buildSummaryUrl(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">) {
  const staticPath = `${buildSessionBasePath(route)}/summary.json`;
  return buildClientDataUrl(staticPath, `/api/sessions/${route.season}/${route.grandPrix}/${route.session}/summary`);
}

function buildReplayMetaUrl(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">) {
  const staticPath = `${buildSessionBasePath(route)}/replay.meta.json`;
  return buildClientDataUrl(staticPath, `/api/replay/${route.season}/${route.grandPrix}/${route.session}/meta`);
}

function buildReplayLapsUrl(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">) {
  return `${buildSessionBasePath(route)}/replay.laps.json`;
}

function buildReplayRaceControlUrl(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">) {
  return `${buildSessionBasePath(route)}/replay.race-control.json`;
}

function buildReplayChunkUrl(
  route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">,
  entry: ReplayMetaPack["frameChunkIndex"][number],
) {
  const staticPath = `${buildSessionBasePath(route)}/${entry.path}`;
  return buildClientDataUrl(staticPath, `/api/replay/${route.season}/${route.grandPrix}/${route.session}/chunk/${entry.index}`);
}

function buildLiveSocketUrl(route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">, speed: number, delaySeconds: number = 0) {
  return buildClientWebSocketUrl(`/ws/live/${route.season}/${route.grandPrix}/${route.session}?speed=${speed}&delay=${delaySeconds}`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${url} (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function loadStaticReplay(
  route: Pick<LiveSessionRef, "season" | "grandPrix" | "session">,
  useStaticPaths: boolean,
) {
  const basePath = buildSessionBasePath(route);
  const [meta, laps, raceControlMessages] = await Promise.all([
    fetchJson<unknown>(useStaticPaths ? `${basePath}/replay.meta.json` : buildReplayMetaUrl(route)).then(validateReplayMeta),
    fetchJson<ReplayLap[]>(buildReplayLapsUrl(route)),
    fetchJson<ReplayRaceControlMessage[]>(buildReplayRaceControlUrl(route)),
  ]);
  const chunks = new Map<number, ReplayFrame[]>();
  await loadReplayChunkQueue(
    meta.frameChunkIndex.map((entry) => entry.index),
    async (chunkIndex) => {
      const entry = meta.frameChunkIndex[chunkIndex];
      if (!entry || entry.index !== chunkIndex) {
        throw new Error(`Replay chunk metadata is missing index ${chunkIndex}`);
      }
      const chunkUrl = useStaticPaths ? `${basePath}/${entry.path}` : buildReplayChunkUrl(route, entry);
      const chunk = validateReplayFrameChunk(await fetchJson<unknown>(chunkUrl), entry);
      chunks.set(chunkIndex, chunk.frames);
    },
  );
  const frames = meta.frameChunkIndex.flatMap((entry) => chunks.get(entry.index) ?? []);
  if (frames.length !== meta.frameCount || new Set(frames.map((frame) => frame.t)).size !== meta.frameCount) {
    throw new Error("Replay chunks do not exactly cover the declared frame count");
  }
  return {
    replay: { ...meta, laps, frames },
    raceControlMessages,
  };
}

function liveStatusToRef(status: NonNullable<LiveStatusResponse["live"]>): LiveSessionRef {
  return {
    season: status.season,
    grandPrix: status.grandPrixSlug,
    grandPrixName: status.grandPrixName,
    session: status.sessionSlug,
    sessionName: status.sessionName,
    trackId: status.trackId,
    sessionKey: status.sessionKey,
    path: status.path,
    source: status.source,
  };
}

export function LiveRouteClient({
  initialSession,
  initialSummary,
  initialReplayMeta,
  initialFrame,
  initialSpeed,
  mode = "live",
}: LiveRouteClientProps) {
  const isRaceDesk = mode === "race-desk";
  const apiOrigin = getClientApiOrigin();
  const [activeSession, setActiveSession] = useState<LiveSessionRef>(initialSession);
  const [summary, setSummary] = useState<SessionSummary>(initialSummary);
  const [replayMeta, setReplayMeta] = useState<ReplayMetaPack>(initialReplayMeta);
  const [feed, setFeed] = useState<LiveFeedState>({
    loading: false,
    connected: false,
    finished: false,
    sourceLabel: isRaceDesk ? "Static replay pack" : apiOrigin ? "Connecting to OCI live" : "Local replay simulator",
    frame: initialFrame,
    rcMessages: [],
    error: null,
    lastFrameAt: initialFrame ? Date.now() : null,
    isSimulated: isRaceDesk || !apiOrigin,
  });
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [frameAgeMs, setFrameAgeMs] = useState<number | null>(null);
  const [showRaceControl, setShowRaceControl] = useState(true);
  const [analysisTab, setAnalysisTab] = useState<"telemetry" | "stints" | "strategy" | "lap-times">("telemetry");
  const timerRef = useRef<number | null>(null);
  const speed = initialSpeed;
  const initialSessionId = `${initialSession.season}:${initialSession.grandPrix}:${initialSession.session}`;

  const closeTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveSession() {
      if (isRaceDesk || !apiOrigin) {
        return;
      }

      try {
        const status = await fetchJson<LiveStatusResponse>(`${apiOrigin}/api/live/status`);
        if (!cancelled && status.live) {
          const nextSession = liveStatusToRef(status.live);
          const nextSessionId = `${nextSession.season}:${nextSession.grandPrix}:${nextSession.session}`;
          const currentSessionId = `${activeSession.season}:${activeSession.grandPrix}:${activeSession.session}`;
          if (nextSessionId !== currentSessionId) {
            setActiveSession(nextSession);
          }
        }
      } catch {
        return;
      }
    }

    resolveSession();

    return () => {
      cancelled = true;
    };
  }, [activeSession.grandPrix, activeSession.season, activeSession.session, apiOrigin, isRaceDesk, reloadKey]);

  useEffect(() => {
    const sessionRef = activeSession;
    const sessionId = `${sessionRef.season}:${sessionRef.grandPrix}:${sessionRef.session}`;
    const shouldReuseInitial = reloadKey === 0 && sessionId === initialSessionId;
    if (shouldReuseInitial) {
      return;
    }

    let cancelled = false;

    async function loadSessionMetadata() {
      setFeed((previous) => ({ ...previous, error: null }));

      try {
        const [nextSummary, nextReplayMeta, nextReplayLaps] = await Promise.all([
          fetchJson<SessionSummary>(isRaceDesk ? `${buildSessionBasePath(sessionRef)}/summary.json` : buildSummaryUrl(sessionRef)),
          fetchJson<unknown>(isRaceDesk ? `${buildSessionBasePath(sessionRef)}/replay.meta.json` : buildReplayMetaUrl(sessionRef)).then(validateReplayMeta),
          fetchJson<ReplayLap[]>(buildReplayLapsUrl(sessionRef)).catch(() => []),
        ]);

        if (!cancelled) {
          setSummary(nextSummary);
          setReplayMeta({
            ...nextReplayMeta,
            laps: nextReplayLaps,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setFeed((previous) => ({
            ...previous,
            loading: false,
            error: error instanceof Error ? error.message : isRaceDesk ? "Historical replay metadata could not be loaded." : "Live metadata could not be loaded.",
          }));
        }
      }
    }

    loadSessionMetadata();

    return () => {
      cancelled = true;
    };
  }, [activeSession, initialSessionId, reloadKey]);

  useEffect(() => {
    const sessionRef = activeSession;
    let cancelled = false;
    let socket: WebSocket | null = null;

    closeTimer();
    setFeed((previous) => ({
      ...previous,
      loading: previous.frame ? false : true,
      connected: false,
      finished: false,
      sourceLabel: isRaceDesk ? "Static replay pack" : apiOrigin ? "OCI live" : "Local replay simulator",
      error: null,
    }));

    async function startStaticSimulation() {
      try {
        const { replay, raceControlMessages: raceControlPack } = await loadStaticReplay(sessionRef, isRaceDesk);
        if (cancelled) {
          return;
        }

        setReplayMeta(replay);

        const frames = replay.frames;
        const raceControlMessages = normalizeRaceControlMessages(
          raceControlPack,
          replay.totalTime,
        );
        let index = 0;
        let rcIndex = 0;
        const visibleMessages: ReplayRaceControlMessage[] = [];

        setFeed((previous) => ({
          ...previous,
          loading: false,
          connected: true,
          sourceLabel: isRaceDesk ? "Static replay pack" : apiOrigin ? "OCI replay fallback" : "Local replay simulator",
          isSimulated: true,
        }));

        const tick = () => {
          if (cancelled) {
            return;
          }

          const frame = frames[index];
          if (!frame) {
            setFeed((previous) => ({ ...previous, finished: true, connected: false }));
            return;
          }

          while (rcIndex < raceControlMessages.length && raceControlMessages[rcIndex].t <= frame.t) {
            visibleMessages.push(raceControlMessages[rcIndex]);
            rcIndex += 1;
          }

          setFeed((previous) => ({
            ...previous,
            frame,
            rcMessages: visibleMessages.slice(-6),
            lastFrameAt: Date.now(),
          }));

          if (index >= frames.length - 1) {
            setFeed((previous) => ({ ...previous, finished: true, connected: false }));
            return;
          }

          const nextFrame = frames[index + 1];
          const delayMs = Math.max(50, Math.min(1250, ((nextFrame.t - frame.t) * 1000) / speed));
          index += 1;
          timerRef.current = window.setTimeout(tick, delayMs);
        };

        tick();
      } catch (error) {
        if (!cancelled) {
          setFeed((previous) => ({
            ...previous,
            loading: false,
            connected: false,
            error: error instanceof Error ? error.message : isRaceDesk ? "Historical replay simulation failed." : "Static live simulation failed.",
          }));
        }
      }
    }

    if (isRaceDesk) {
      void startStaticSimulation();
      return () => {
        cancelled = true;
        closeTimer();
      };
    }

    const socketUrl = buildLiveSocketUrl(sessionRef, speed, delaySeconds);
    if (!socketUrl) {
      void startStaticSimulation();
      return () => {
        cancelled = true;
        closeTimer();
      };
    }

    socket = new WebSocket(socketUrl);
    socket.addEventListener("open", () => {
      if (!cancelled) {
        setFeed((previous) => ({ ...previous, connected: true }));
      }
    });
    socket.addEventListener("message", (event) => {
      if (cancelled) {
        return;
      }

      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          frame?: ReplayFrame;
          rcMessages?: ReplayRaceControlMessage[];
          source?: string;
          message?: string;
        };

        if (message.type === "status") {
          setFeed((previous) => ({
            ...previous,
            loading: previous.frame ? false : true,
            sourceLabel: message.source ? formatLiveSourceLabel(message.source) : previous.sourceLabel,
          }));
          return;
        }

        if (message.type === "ready") {
          setFeed((previous) => ({
            ...previous,
            loading: false,
            finished: false,
            sourceLabel: message.source ? formatLiveSourceLabel(message.source) : "OCI live",
            isSimulated: false,
          }));
          return;
        }

        if (message.type === "frame" && message.frame) {
          setFeed((previous) => ({
            ...previous,
            loading: false,
            frame: message.frame || null,
            rcMessages: normalizeRaceControlMessages(message.rcMessages || [], replayMeta.totalTime ?? 0).slice(-6),
            lastFrameAt: Date.now(),
            sourceLabel: message.source ? formatLiveSourceLabel(message.source) : "OCI live",
            isSimulated: false,
          }));
          return;
        }

        if (message.type === "finished") {
          setFeed((previous) => ({ ...previous, finished: true, connected: false }));
          return;
        }

        if (message.type === "error") {
          void startStaticSimulation();
        }
      } catch {
        return;
      }
    });
    socket.addEventListener("error", () => {
      if (!cancelled) {
        void startStaticSimulation();
      }
    });
    socket.addEventListener("close", () => {
      if (!cancelled) {
        setFeed((previous) => ({ ...previous, connected: false }));
      }
    });

    return () => {
      cancelled = true;
      closeTimer();
      socket?.close();
    };
  }, [activeSession, apiOrigin, closeTimer, delaySeconds, isRaceDesk, reloadKey, speed]);

  // Tick the displayed frame age (used in the Feed tile) once per second.
  useEffect(() => {
    if (isRaceDesk || !feed.lastFrameAt) {
      setFrameAgeMs(null);
      return;
    }
    const update = () => setFrameAgeMs(Date.now() - (feed.lastFrameAt ?? Date.now()));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [feed.lastFrameAt, isRaceDesk]);

  const currentFrame = feed.frame;
  const currentTime = currentFrame?.t ?? 0;
  const totalTime = replayMeta.totalTime ?? 0;
  const totalLaps = replayMeta.totalLaps ?? Math.max(...replayMeta.laps.map((lap) => lap.lapNumber), 0);
  const useSyntheticTrackMotion = useMemo(() => hasStaticTrackCoordinates(replayMeta.frames), [replayMeta.frames]);
  const estimatedLapDuration = useMemo(() => {
    if (totalLaps > 0 && totalTime > 0) {
      return Math.max(55, totalTime / totalLaps);
    }
    return 95;
  }, [totalLaps, totalTime]);
  const renderedCurrentFrame = useMemo(
    () => useSyntheticTrackMotion
      ? buildSyntheticFrame(currentFrame, replayMeta.trackPath, currentTime, estimatedLapDuration)
      : currentFrame,
    [currentFrame, currentTime, estimatedLapDuration, replayMeta.trackPath, useSyntheticTrackMotion],
  );
  const trackStatus = renderedCurrentFrame?.trackStatus || "GREEN";
  const currentLap = renderedCurrentFrame?.lap || null;

  const driverInfoByCode = useMemo(
    () => new Map(replayMeta.drivers.map((driver) => [driver.driverCode, driver])),
    [replayMeta.drivers],
  );

  const lapHistoryByDriver = useMemo(() => {
    const history = new Map<string, NonNullable<ReplayPack["laps"]>>();
    for (const lap of replayMeta.laps) {
      const entry = history.get(lap.driverCode) || [];
      entry.push(lap);
      history.set(lap.driverCode, entry);
    }
    for (const laps of history.values()) {
      laps.sort((left, right) => left.lapNumber - right.lapNumber);
    }
    return history;
  }, [replayMeta.laps]);

  const previousLapLabelByDriverLap = useMemo(() => {
    const lookup = new Map<string, string | null>();

    for (const [driverCode, laps] of lapHistoryByDriver.entries()) {
      let previousLabel: string | null = null;
      for (const lap of laps) {
        lookup.set(`${driverCode}:${lap.lapNumber}`, previousLabel);
        if (lap.lapTime !== null) {
          previousLabel = `${lap.lapTime.toFixed(3)}s`;
        }
      }
    }

    return lookup;
  }, [lapHistoryByDriver]);

  // Detect out-laps based on either compound change or a lap time well above the driver's
  // running median (matches the heuristic used in ReplayView).
  const outLapByDriverLap = useMemo(() => {
    const lookup = new Set<string>();
    for (const [driverCode, laps] of lapHistoryByDriver.entries()) {
      const completedTimes = laps
        .map((lap) => lap.lapTime)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      if (completedTimes.length < 4) continue;
      const sorted = [...completedTimes].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const previousCompoundByLap = new Map<number, string | null>();
      let previousCompound: string | null = null;
      for (const lap of laps) {
        previousCompoundByLap.set(lap.lapNumber, previousCompound);
        if (lap.compound) previousCompound = lap.compound;
      }
      for (const lap of laps) {
        if (lap.lapTime === null) continue;
        const compoundChanged = lap.compound && previousCompoundByLap.get(lap.lapNumber) && previousCompoundByLap.get(lap.lapNumber) !== lap.compound;
        const slowOutlier = lap.lapTime > median * 1.18;
        if (compoundChanged || slowOutlier) {
          lookup.add(`${driverCode}:${lap.lapNumber}`);
        }
      }
    }
    return lookup;
  }, [lapHistoryByDriver]);

  const displayedDrivers = useMemo<ReplayLeaderboardRow[]>(() => {
    if (!renderedCurrentFrame) {
      return [];
    }

    return Object.values(renderedCurrentFrame.drivers)
      .filter((driver) => driver.position > 0)
      .sort((left, right) => left.position - right.position)
      .map((driver) => {
        const info = driverInfoByCode.get(driver.driverCode);
        const lapKey = `${driver.driverCode}:${driver.lap || 0}`;
        const lastLapLabel = previousLapLabelByDriverLap.get(lapKey) ?? null;
        const isOutLap = outLapByDriverLap.has(lapKey);

        return {
          abbr: driver.driverCode,
          fullName: info?.fullName || driver.driverCode,
          team: info?.team || driver.team,
          color: info?.teamColor || "#9ca3af",
          position: driver.position,
          intervalLabel: intervalLabel(driver.interval, driver.position),
          compound: driver.tyreCompound,
          tyreAge: driver.tyreAge,
          lap: driver.lap,
          speed: driver.speed,
          throttle: driver.throttle,
          brake: driver.brake,
          gear: driver.gear,
          rpm: driver.rpm,
          drs: driver.drs,
          lastLapLabel,
          isOutLap,
        };
      });
  }, [driverInfoByCode, outLapByDriverLap, previousLapLabelByDriverLap, renderedCurrentFrame]);

  const selectedTelemetryDrivers = displayedDrivers.filter((driver) => selectedDrivers.includes(driver.abbr));
  const leadDriver = displayedDrivers[0] || null;
  const circuitArt = getCircuitArt(activeSession.trackId);
  const trackLabel = circuitArt.circuit.displayName !== "Unknown circuit"
    ? circuitArt.circuit.displayName
    : formatSlugLabel(activeSession.trackId);
  const grandPrixLabel = circuitArt.circuit.grandPrix !== "Unknown Grand Prix" ? circuitArt.circuit.grandPrix : null;
  const weatherLabel = currentFrame?.weather
    ? `${currentFrame.weather.airTempC}C air · ${currentFrame.weather.trackTempC}C track`
    : `${formatWeatherValue(summary.weatherSummary.airTempC, "C")} air · ${formatWeatherValue(summary.weatherSummary.trackTempC, "C")} track`;
  const windLabel = currentFrame?.weather
    ? `${currentFrame.weather.windSpeedMps.toFixed(1)} m/s · ${Math.round(currentFrame.weather.windDirectionDeg)}°`
    : `Rain risk ${formatWeatherValue(summary.weatherSummary.rainRiskPct, "%")}`;
  const selectedDriverLabel = selectedTelemetryDrivers.length
    ? selectedTelemetryDrivers.map((driver) => driver.abbr).join(" · ")
    : "No drivers selected";

  // Esc clears the live selection.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (event.code === "Escape") {
        setSelectedDrivers([]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleDriverSelect(driverCode: string | null, append: boolean) {
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
  }

  if (feed.error) {
    return (
      <div className="page-stack">
        <section className="hero hero--compact">
          <p className="eyebrow">{isRaceDesk ? "Race Desk" : "Live workspace"}</p>
          <h1>{isRaceDesk ? "Historical replay unavailable" : "Live feed unavailable"}</h1>
          <p className="lead">{feed.error}</p>
          <div className="hero-actions">
            <button className="button" type="button" onClick={() => setReloadKey((value) => value + 1)}>
              {isRaceDesk ? "Retry historical replay" : "Retry live feed"}
            </button>
            <a className="button button--secondary" href="/replay">Replay library</a>
          </div>
        </section>
      </div>
    );
  }

  if (!currentFrame) {
    return (
      <div className="page-stack">
        <section className="hero hero--compact">
          <p className="eyebrow">{isRaceDesk ? "Race Desk" : "Live workspace"}</p>
          <h1>{activeSession.grandPrixName}</h1>
          <p className="lead">
            {isRaceDesk
              ? "Loading the historical replay simulation from the featured static pack."
              : "Initializing the live workspace. When the backend is configured this route uses OCI WebSockets; otherwise it simulates the feed from the featured replay pack."}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="replay-view replay-view--workspace">
      <section className="replay-session-banner">
        <div className="replay-session-banner__identity">
          <p className="eyebrow">{isRaceDesk ? "Race Desk" : "Live workspace"}</p>
          <h1>{activeSession.grandPrixName}</h1>
          <p>
            {isRaceDesk
              ? `${activeSession.sessionName} historical replay simulation at ${trackLabel}, driven entirely by the featured static pack.`
              : `${activeSession.sessionName} live surface at ${trackLabel}. This route shares the replay map, leaderboard, and telemetry shell, but drives them from a socket-first live feed or a local replay-backed simulator.`}
          </p>
        </div>
        <div className="replay-session-banner__facts">
          <article className="replay-session-banner__fact">
            <span>{isRaceDesk ? "Source" : "Feed"}</span>
            <strong>{feed.sourceLabel}</strong>
            {!isRaceDesk && frameAgeMs !== null ? <small className="replay-session-banner__sub">Last frame {Math.max(0, Math.round(frameAgeMs / 1000))}s ago</small> : null}
          </article>
          <article className="replay-session-banner__fact">
            <span>Status</span>
            <strong>
              {feed.finished
                ? isRaceDesk ? "Replay complete" : "Finished"
                : feed.isSimulated
                  ? <span className="replay-session-banner__pill replay-session-banner__pill--simulated">{isRaceDesk ? "HISTORICAL" : "SIMULATED"}</span>
                  : feed.connected
                    ? <span className="replay-session-banner__pill replay-session-banner__pill--live">LIVE</span>
                    : currentFrame
                      ? <span className="replay-session-banner__pill replay-session-banner__pill--syncing">Syncing</span>
                      : <span className="replay-session-banner__pill replay-session-banner__pill--syncing">Connecting</span>}
            </strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Replay clock</span>
            <strong>{formatSeconds(currentTime)} / {formatSeconds(totalTime)}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Lap</span>
            <strong>{currentLap ? `${currentLap}${totalLaps ? ` / ${totalLaps}` : ""}` : totalLaps ? `- / ${totalLaps}` : "-"}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>Weather</span>
            <strong>{weatherLabel}</strong>
          </article>
          <article className="replay-session-banner__fact">
            <span>{currentFrame.weather ? "Wind" : "Forecast"}</span>
            <strong>{windLabel}</strong>
          </article>
        </div>
        <div className="replay-session-banner__footer">
          <p className="replay-session-banner__note">
            {isRaceDesk
              ? "Historical replay simulation · static data pack"
              : feed.isSimulated
                ? `${feed.sourceLabel} · replay speed ${speed.toFixed(1)}x`
                : `${feed.sourceLabel} · speed ${speed.toFixed(1)}x · displayed delay ${delaySeconds}s`}
          </p>
          <div className="replay-session-banner__actions">
            <a className="replay-session-banner__action replay-session-banner__action--primary" href={`/replay/${activeSession.season}/${activeSession.grandPrix}/${activeSession.session}`}>Open full Replay</a>
            <a className="replay-session-banner__action" href={`/sessions/${activeSession.season}/${activeSession.grandPrix}/${activeSession.session}`}>{activeSession.grandPrixName} summary</a>
            <a className="replay-session-banner__action" href="/cars/current-spec">Modelview</a>
            <a className="replay-session-banner__action" href="/learn">Learn</a>
          </div>
        </div>

        {!isRaceDesk ? (
          <div className="live-controls-strip">
            <label className="live-controls-strip__label">
              <span>Display delay</span>
              <input
                type="range"
                min={0}
                max={60}
                step={5}
                value={delaySeconds}
                onChange={(event) => setDelaySeconds(Number(event.target.value))}
                aria-label="Live feed display delay"
              />
              <strong>{delaySeconds}s</strong>
            </label>
            <p className="live-controls-strip__hints">
              <span><kbd>Click</kbd> driver to inspect</span>
              <span><kbd>Shift</kbd>+click to pin compare</span>
              <span><kbd>Esc</kbd> clears selection</span>
            </p>
          </div>
        ) : null}
      </section>

      <div className="replay-workspace-grid">
        <section className="replay-track-panel">
          <div className="replay-track-panel__header">
            <div className="replay-track-panel__title">
              <p className="eyebrow">Track stage</p>
              <h2>{trackLabel}</h2>
              {grandPrixLabel ? <p className="replay-track-panel__circuit">{grandPrixLabel} · {circuitArt.circuit.city}, {circuitArt.circuit.country}</p> : null}
              <p>
                {isRaceDesk
                  ? "Select cars from the map or leaderboard to inspect the historical replay telemetry deck."
                  : "Select cars from the map or leaderboard to pin them into the live telemetry deck. Socket-backed feeds pull chunks from OCI; static mode simulates the same surface from the replay pack."}
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
              <div>
                <span>Messages</span>
                <strong>{feed.rcMessages.length || 0}</strong>
              </div>
              <button
                type="button"
                className={`replay-track-panel__messages-button${showRaceControl ? " replay-track-panel__messages-button--open" : ""}`}
                onClick={() => setShowRaceControl((value) => !value)}
                aria-expanded={showRaceControl}
                aria-label="Toggle race control messages"
                disabled={feed.rcMessages.length === 0}
              >
                <span>Race control</span>
                <strong>{showRaceControl ? "Hide" : "Show"}</strong>
              </button>
            </div>
          </div>

          <div className="replay-track-panel__canvas">
            <TrackCanvas
              trackPath={replayMeta.trackPath}
              drivers={replayMeta.drivers}
              currentFrame={renderedCurrentFrame}
              nextFrame={null}
              selectedDrivers={selectedDrivers}
              corners={replayMeta.trackMetadata?.corners ?? []}
              drsZones={replayMeta.trackMetadata?.drsZones ?? []}
              marshalSectors={replayMeta.trackMetadata?.marshalSectors ?? []}
              trackTotalLength={replayMeta.trackMetadata?.length}
              clockSeconds={currentTime}
              onDriverClick={handleDriverSelect}
            />

            {showRaceControl && feed.rcMessages.length ? (
              <div className="replay-race-control">
                <p>Race control</p>
                <ul>
                  {feed.rcMessages.map((message) => (
                    <li key={`${message.t}-${message.message}`}>
                      <strong>{message.flag || message.category}</strong>
                      <span>
                        T+{Math.floor(message.t)}s{message.lapNumber ? ` · Lap ${message.lapNumber}` : ""} · {message.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="replay-side-column">
          <section className="replay-side-card">
            <p className="eyebrow">{isRaceDesk ? "Historical read" : "Live read"}</p>
            <h3>{selectedTelemetryDrivers.length ? `Telemetry on ${selectedTelemetryDrivers.map((driver) => driver.abbr).join(" · ")}` : leadDriver ? isRaceDesk ? `${leadDriver.abbr} leads this replay frame` : `${leadDriver.abbr} leads the live feed` : "Select drivers to inspect"}</h3>
            <p>
              {isRaceDesk
                ? "This historical replay simulation provides a control-room view of the featured static pack. Open full Replay for fine-grained scrubbing."
                : "This surface mirrors the replay workspace but lets you keep an always-on live board while the backend streams session frames. Use replay afterward for fine-grained scrubbing."}
            </p>
            <dl className="replay-side-card__stats">
              <div>
                <dt>Leader</dt>
                <dd>{leadDriver ? `${leadDriver.abbr} · ${leadDriver.team}` : "-"}</dd>
              </div>
              <div>
                <dt>{isRaceDesk ? "Pack source" : "Feed source"}</dt>
                <dd>{feed.sourceLabel}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>{activeSession.sessionName}</dd>
              </div>
              <div>
                <dt>Selected</dt>
                <dd>{selectedDriverLabel}</dd>
              </div>
            </dl>
          </section>

          <Leaderboard
            drivers={displayedDrivers}
            selectedDrivers={selectedDrivers}
            onDriverSelect={handleDriverSelect}
            orderLabel={isRaceDesk ? "Historical order" : "Live order"}
          />
        </aside>
      </div>

      <section className="replay-telemetry-panel replay-support-panel">
        <div className="section-header replay-support-panel__header">
          <div>
            <p className="eyebrow">{isRaceDesk ? "Historical analysis deck" : "Live analysis deck"}</p>
            <h2>
              {analysisTab === "telemetry"
                ? selectedTelemetryDrivers.length
                  ? isRaceDesk ? "Selected historical telemetry strips" : "Selected live telemetry strips"
                  : "Select drivers from the leaderboard"
                : analysisTab === "stints"
                  ? "Tyre stint snapshot"
                  : analysisTab === "strategy"
                    ? "Strategy desk"
                    : "Lap times waterfall"}
            </h2>
          </div>
          <div className="replay-support-panel__tabs">
            <button
              type="button"
              className={`replay-support-panel__tab${analysisTab === "telemetry" ? " replay-support-panel__tab--active" : ""}`}
              onClick={() => setAnalysisTab("telemetry")}
            >
              Telemetry {selectedTelemetryDrivers.length ? `· ${selectedTelemetryDrivers.length}` : ""}
            </button>
            <button
              type="button"
              className={`replay-support-panel__tab${analysisTab === "stints" ? " replay-support-panel__tab--active" : ""}`}
              onClick={() => setAnalysisTab("stints")}
            >
              Stints
            </button>
            <button
              type="button"
              className={`replay-support-panel__tab${analysisTab === "strategy" ? " replay-support-panel__tab--active" : ""}`}
              onClick={() => setAnalysisTab("strategy")}
            >
              Strategy
            </button>
            <button
              type="button"
              className={`replay-support-panel__tab${analysisTab === "lap-times" ? " replay-support-panel__tab--active" : ""}`}
              onClick={() => setAnalysisTab("lap-times")}
            >
              Lap times
            </button>
          </div>
        </div>

        {analysisTab === "telemetry" ? (
          selectedTelemetryDrivers.length ? (
            <div className="replay-telemetry-stack">
              {selectedTelemetryDrivers.map((driver) => (
                <ReplayTelemetryStrip key={driver.abbr} driver={driver} />
              ))}
            </div>
          ) : (
            <p className="replay-empty-copy">
              {isRaceDesk
                ? "Choose one driver for a focused historical read, or shift-click several drivers to compare telemetry strips side by side."
                : "Choose one driver for a focused live read, or shift-click several drivers to compare telemetry strips side by side."}
            </p>
          )
        ) : null}

        {analysisTab === "stints" ? (
          <div className="live-stints">
            {(() => {
              const stintsByDriver = new Map<string, Array<{ compound: string | null; laps: number[]; }>>();
              for (const lap of replayMeta.laps) {
                const list = stintsByDriver.get(lap.driverCode) ?? [];
                const last = list[list.length - 1];
                if (!last || last.compound !== lap.compound) {
                  list.push({ compound: lap.compound, laps: [lap.lapNumber] });
                } else {
                  last.laps.push(lap.lapNumber);
                }
                stintsByDriver.set(lap.driverCode, list);
              }
              const rows = displayedDrivers.slice(0, 10).map((driver) => ({
                driver,
                stints: stintsByDriver.get(driver.abbr) ?? [],
              }));
              if (!rows.length) {
                return <p className="replay-empty-copy">Stint data appears once the replay simulation has produced laps.</p>;
              }
              return (
                <ul className="live-stints__list">
                  {rows.map(({ driver, stints }) => (
                    <li key={driver.abbr}>
                      <strong style={{ color: driver.color }}>{driver.abbr}</strong>
                      <em>{driver.team}</em>
                      <span className="live-stints__chips">
                        {stints.length ? stints.map((stint, idx) => (
                          <span key={idx} className={`live-stints__chip live-stints__chip--${(stint.compound || "unknown").toLowerCase()}`}>
                            {(stint.compound || "?").slice(0, 1)} · {stint.laps.length}L
                          </span>
                        )) : <span className="live-stints__chip live-stints__chip--unknown">No stint data yet</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        ) : null}

        {analysisTab === "strategy" ? (
          <div className="live-strategy">
            <div className="live-strategy__grid">
              <div>
                <span>Pit loss (green)</span>
                <strong>~18.9s</strong>
                <em>Estimated based on pit lane length and pit-out merge</em>
              </div>
              <div>
                <span>Pit loss (SC/VSC)</span>
                <strong>~11.5s</strong>
                <em>Cars under safety-car bunching minimise pit loss</em>
              </div>
              <div>
                <span>Crossover · Inter</span>
                <strong>~95%</strong>
                <em>Wet → inter swap when track dries enough for one dry sector</em>
              </div>
              <div>
                <span>Crossover · Wet</span>
                <strong>~99%</strong>
                <em>Inter → wet when standing water threatens aquaplaning</em>
              </div>
            </div>
            <p className="live-strategy__hint">
              {isRaceDesk
                ? "Historical strategy reads are heuristic from the featured static pack."
                : "Live strategy reads are heuristic until OpenF1 publishes the official pit-window pack for this session."}
            </p>
          </div>
        ) : null}

        {analysisTab === "lap-times" ? (
          <ReplayLapWaterfall laps={replayMeta.laps} drivers={replayMeta.drivers} />
        ) : null}
      </section>
    </div>
  );
}
