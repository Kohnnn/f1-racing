"use client";

import { formatLapTime } from "@f1-racing/telemetry-utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComparePack, ReplayPack, SessionManifest, SessionSummary, StintPack } from "@/lib/data";
import { getFocusPoint } from "@/components/model-viewer/focus-points";
import { Leaderboard, type ReplayLeaderboardRow } from "./Leaderboard";
import { PlaybackControls } from "./PlaybackControls";
import { ReplayComparePanel, ReplayStintPanel } from "./replay-insights";
import { ReplayTelemetryStrip } from "./replay-telemetry-strip";
import { TrackCanvas } from "./TrackCanvas";

interface ReplayViewProps {
  replay: ReplayPack;
  manifest: SessionManifest;
  summary: SessionSummary;
  compare: ComparePack | null;
  route: {
    season: string;
    grandPrix: string;
    session: string;
  };
  stintPack: StintPack | null;
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

function intervalLabel(interval: number | null) {
  if (interval === null) {
    return "-";
  }
  if (interval === 0) {
    return "Leader";
  }
  return `+${interval.toFixed(3)}`;
}

export function ReplayView({ replay, manifest, summary, compare, route, stintPack }: ReplayViewProps) {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setFocusId(params.get("focus"));
  }, []);

  const currentFrame = replay.frames[currentFrameIndex] || null;
  const currentTime = currentFrame?.t || 0;
  const totalTime = replay.frames.at(-1)?.t || 0;
  const trackStatus = currentFrame?.trackStatus || "GREEN";
  const currentLap = currentFrame?.lap || null;
  const totalLaps = Math.max(...replay.laps.map((lap) => lap.lapNumber), 0);
  const replayFocus = getFocusPoint(focusId);

  const driverInfoByCode = useMemo(
    () => new Map(replay.drivers.map((driver) => [driver.driverCode, driver])),
    [replay.drivers],
  );

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

  const displayedDrivers = useMemo<ReplayLeaderboardRow[]>(() => {
    if (!currentFrame) {
      return [];
    }

    return Object.values(currentFrame.drivers)
      .filter((driver) => driver.position > 0)
      .sort((left, right) => left.position - right.position)
      .map((driver) => {
        const info = driverInfoByCode.get(driver.driverCode);
        const lastLap = (lapHistoryByDriver.get(driver.driverCode) || [])
          .filter((lap) => lap.lapNumber < (driver.lap || 0) && lap.lapTime !== null)
          .at(-1);

        return {
          abbr: driver.driverCode,
          fullName: info?.fullName || driver.driverCode,
          team: info?.team || driver.team,
          color: info?.teamColor || "#9ca3af",
          position: driver.position,
          intervalLabel: intervalLabel(driver.interval),
          compound: driver.tyreCompound,
          tyreAge: driver.tyreAge,
          lap: driver.lap,
          speed: driver.speed,
          throttle: driver.throttle,
          brake: driver.brake,
          gear: driver.gear,
          rpm: driver.rpm,
          drs: driver.drs,
          lastLapLabel: lastLap?.lapTime ? formatLapTime(lastLap.lapTime) : null,
        };
      });
  }, [currentFrame, driverInfoByCode, lapHistoryByDriver]);

  const suggestedDriver = useMemo(() => {
    const fastestLap = replay.laps
      .filter((lap) => lap.lapTime !== null)
      .slice()
      .sort((left, right) => (left.lapTime ?? Infinity) - (right.lapTime ?? Infinity))[0];
    return fastestLap?.driverCode ?? displayedDrivers[0]?.abbr ?? null;
  }, [displayedDrivers, replay.laps]);

  useEffect(() => {
    if (selectedDrivers.length) {
      return;
    }
    if (replayFocus && suggestedDriver) {
      setSelectedDrivers([suggestedDriver]);
    }
  }, [replayFocus, selectedDrivers.length, suggestedDriver]);

  const selectedTelemetryDrivers = displayedDrivers.filter((driver) => selectedDrivers.includes(driver.abbr));
  const activeRaceControlMessages = useMemo(() => {
    if (!replay.raceControlMessages?.length) {
      return [];
    }

    return replay.raceControlMessages.filter((message) => message.t <= currentTime).slice(-4).reverse();
  }, [currentTime, replay.raceControlMessages]);
  const currentWeather = currentFrame?.weather || null;

  const featuredCompareKey = Object.keys(manifest.compare ?? {})[0] ?? null;
  const featuredCompareHref = featuredCompareKey
    ? `/compare/${route.season}/${route.grandPrix}/${route.session}/${featuredCompareKey.split("-")[0]}/${featuredCompareKey.split("-")[1]}`
    : null;
  const featuredStintHref = manifest.stints ? `/stints/${route.season}/${route.grandPrix}/${route.session}` : null;

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

  const handleSeek = useCallback((time: number) => {
    setCurrentFrameIndex(findFrameIndexForTime(time));
    setIsPlaying(false);
  }, [findFrameIndexForTime]);

  const handleSkipTime = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(totalTime, currentTime + delta));
    handleSeek(next);
  }, [currentTime, handleSeek, totalTime]);

  const handleSkipLap = useCallback((delta: number) => {
    const targetLap = Math.max(1, (currentLap || 1) + delta);
    const targetFrame = replay.frames.findIndex((frame) => (frame.lap || 0) >= targetLap);
    setCurrentFrameIndex(targetFrame === -1 ? replay.frames.length - 1 : targetFrame);
    setIsPlaying(false);
  }, [currentLap, replay.frames]);

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

  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) {
      lastTimeRef.current = timestamp;
    }

    const deltaMs = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    setCurrentFrameIndex((previous) => {
      const nextTime = (replay.frames[previous]?.t || 0) + (deltaMs / 1000) * playbackSpeed;
      if (nextTime >= totalTime) {
        setIsPlaying(false);
        return replay.frames.length - 1;
      }
      return findFrameIndexForTime(nextTime);
    });

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [findFrameIndexForTime, isPlaying, playbackSpeed, replay.frames, totalTime]);

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
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tagName)) {
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
      if (event.code === "KeyR") {
        event.preventDefault();
        handleSeek(0);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSeek, handleSkipLap, handleSkipTime]);

  return (
    <div className="replay-view replay-view--workspace">
      <section className="replay-session-banner">
        <div className="replay-session-banner__identity">
          <p className="eyebrow">Replay workspace</p>
          <h1>{replay.grandPrix} · {replay.session}</h1>
          <p>
            Replay is the main product surface. Modelview and Learn stay available when you need engineering context, but the lap story starts here.
          </p>
        </div>
        <div className="replay-session-banner__facts">
          <span>{currentWeather ? `${currentWeather.airTempC}C / ${currentWeather.trackTempC}C` : `${summary.weatherSummary.airTempC}C / ${summary.weatherSummary.trackTempC}C`}</span>
          <span>{currentWeather ? `Humidity ${currentWeather.humidityPct}%` : `Rain risk ${summary.weatherSummary.rainRiskPct}%`}</span>
          <span>{currentWeather ? `${currentWeather.windSpeedMps.toFixed(1)} m/s @ ${Math.round(currentWeather.windDirectionDeg)}°` : `Rain risk ${summary.weatherSummary.rainRiskPct}%`}</span>
          <span>Session key {replay.sessionKey}</span>
          <span>{currentLap ? `Lap ${currentLap}` : "Lap -"}</span>
          <span>{formatSeconds(currentTime)} / {formatSeconds(totalTime)}</span>
        </div>
        <div className="replay-session-banner__actions">
          <a href="/replay">Replay library</a>
          <a href="/cars/current-spec">Modelview</a>
          <a href="/learn">Learn</a>
          <a href={`/sessions/${route.season}/${route.grandPrix}/${route.session}`}>Session summary</a>
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

      <div className="replay-workspace-grid">
        <section className="replay-track-panel">
          <div className="replay-track-panel__header">
            <div>
              <span>Track map</span>
              <strong>{trackStatus}</strong>
            </div>
            <div>
              <span>Selected drivers</span>
              <strong>{selectedDrivers.length || 0}</strong>
            </div>
          </div>

          <div className="replay-track-panel__canvas">
            <TrackCanvas
              trackPath={replay.trackPath}
              drivers={replay.drivers}
              currentFrame={currentFrame}
              selectedDrivers={selectedDrivers}
              playbackSpeed={playbackSpeed}
              onDriverClick={handleDriverSelect}
            />

            {activeRaceControlMessages.length ? (
              <div className="replay-race-control">
                <p>Race control</p>
                <ul>
                  {activeRaceControlMessages.map((message) => (
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
            <p className="eyebrow">Replay workflow</p>
            <h3>Use replay as the control room.</h3>
            <p>
              Click a driver to isolate their telemetry. Shift-click to compare multiple drivers. The old compare and stint pages now mirror the same read below instead of owning the flow.
            </p>
          </section>

          <Leaderboard
            drivers={displayedDrivers}
            selectedDrivers={selectedDrivers}
            onDriverSelect={handleDriverSelect}
          />
        </aside>
      </div>

      <section className="replay-telemetry-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Driver telemetry</p>
            <h2>{selectedTelemetryDrivers.length ? "Selected telemetry strips" : "Select drivers from the leaderboard"}</h2>
          </div>
        </div>
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
      </section>

      <PlaybackControls
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        currentTime={currentTime}
        totalTime={totalTime}
        currentLap={currentLap}
        totalLaps={totalLaps}
        trackStatus={trackStatus}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onSpeedChange={setPlaybackSpeed}
        onSeek={handleSeek}
        onSkipLap={handleSkipLap}
        onSkipTime={handleSkipTime}
      />

      {compare ? <ReplayComparePanel compare={compare} legacyHref={featuredCompareHref} /> : null}
      {stintPack ? <ReplayStintPanel stintPack={stintPack} legacyHref={featuredStintHref} /> : null}
    </div>
  );
}
