"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TrackCanvas } from "./TrackCanvas";
import { PlaybackControls } from "./PlaybackControls";
import { Leaderboard } from "./Leaderboard";
import { ReplayComparePanel, ReplayStintPanel } from "./replay-insights";
import type { ComparePack, ReplayPack, ReplayFrame, SessionManifest, SessionSummary, StintPack } from "@/lib/data";
import { getFocusPoint } from "@/components/model-viewer/focus-points";

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

type ReplayMetricId = "speed" | "gear" | "throttle" | "brake" | "drs" | "lap";

const REPLAY_METRIC_LABELS: Record<ReplayMetricId, string> = {
  speed: "Speed",
  gear: "Gear",
  throttle: "Throttle",
  brake: "Brake",
  drs: "DRS",
  lap: "Lap",
};

function formatLapTime(seconds: number | null) {
  if (seconds === null) {
    return null;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(3).padStart(6, "0")}`;
}

export function ReplayView({ replay, manifest, summary, compare, route, stintPack }: ReplayViewProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setFocusId(params.get("focus"));
  }, []);

  const totalFrames = replay.frames.length;
  const totalTime = replay.frames[totalFrames - 1]?.t || 0;
  const currentFrame = replay.frames[currentFrameIndex] || null;
  const currentTime = currentFrame?.t || 0;
  const replayFocus = getFocusPoint(focusId);

  const currentLap = currentFrame
    ? Math.max(...Object.values(currentFrame.drivers)
        .map((d) => d.lap)
        .filter((l): l is number => l !== null), 0) || null
    : null;

  const trackStatus = currentFrame?.trackStatus || "GREEN";

  const findFrameIndexForTime = useCallback((time: number): number => {
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

  const handlePlay = useCallback(() => {
    if (currentFrameIndex >= replay.frames.length - 1) {
      setCurrentFrameIndex(0);
    }
    setIsPlaying(true);
  }, [currentFrameIndex, replay.frames.length]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleSeek = useCallback((time: number) => {
    const index = findFrameIndexForTime(time);
    setCurrentFrameIndex(index);
    setIsPlaying(false);
  }, [findFrameIndexForTime]);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
  }, []);

  const handleSkipLap = useCallback((delta: number) => {
    if (!currentFrame) return;

    const targetLap = (currentLap || 0) + delta;
    if (targetLap < 1) return;

    let targetFrame = 0;
    for (let i = 0; i < replay.frames.length; i++) {
      const frame = replay.frames[i];
      const frameLap = Math.max(...Object.values(frame.drivers)
        .map((d) => d.lap)
        .filter((l): l is number => l !== null), 0);

      if (frameLap >= targetLap) {
        targetFrame = i;
        break;
      }
      targetFrame = i;
    }

    setCurrentFrameIndex(targetFrame);
    setIsPlaying(false);
  }, [currentFrame, currentLap, replay.frames]);

  const handleDriverSelect = useCallback((driverCode: string | null) => {
    setSelectedDriver(driverCode);
  }, []);

  const suggestedDriver = useMemo(() => {
    const fastestLap = replay.laps
      .filter((lap) => lap.lapTime !== null)
      .sort((left, right) => (left.lapTime ?? Infinity) - (right.lapTime ?? Infinity))[0];

    if (fastestLap) {
      const driver = replay.drivers.find((entry) => entry.driverCode === fastestLap.driverCode);

      if (driver) {
        return {
          driverCode: driver.driverCode,
          fullName: driver.fullName,
          lapNumber: fastestLap.lapNumber,
          lapTime: fastestLap.lapTime,
        };
      }
    }

    const fallback = replay.drivers[0];
    return fallback
      ? {
          driverCode: fallback.driverCode,
          fullName: fallback.fullName,
          lapNumber: null,
          lapTime: null,
        }
      : null;
  }, [replay.drivers, replay.laps]);
  const focusMetrics: readonly ReplayMetricId[] = replayFocus?.watchMetrics ?? [];
  const telemetryItems = selectedDriver && currentFrame?.drivers[selectedDriver]
    ? [
        {
          id: "speed" as ReplayMetricId,
          label: "Speed",
          value: currentFrame.drivers[selectedDriver].speed !== null
            ? `${Math.round(currentFrame.drivers[selectedDriver].speed!)} km/h`
            : "-",
        },
        {
          id: "gear" as ReplayMetricId,
          label: "Gear",
          value: currentFrame.drivers[selectedDriver].gear ?? "-",
        },
        {
          id: "throttle" as ReplayMetricId,
          label: "Throttle",
          value: currentFrame.drivers[selectedDriver].throttle !== null
            ? `${Math.round(currentFrame.drivers[selectedDriver].throttle!)}%`
            : "-",
        },
        {
          id: "brake" as ReplayMetricId,
          label: "Brake",
          value: currentFrame.drivers[selectedDriver].brake !== null
            ? `${Math.round(currentFrame.drivers[selectedDriver].brake!)}%`
            : "-",
        },
        {
          id: "drs" as ReplayMetricId,
          label: "DRS",
          value: currentFrame.drivers[selectedDriver].drs ?? "-",
        },
        {
          id: "lap" as ReplayMetricId,
          label: "Lap",
          value: currentFrame.drivers[selectedDriver].lap ?? "-",
        },
      ]
    : [];
  const featuredCompareKey = Object.keys(manifest.compare ?? {})[0] ?? null;
  const featuredCompareHref = featuredCompareKey
    ? `/compare/${route.season}/${route.grandPrix}/${route.session}/${featuredCompareKey.split("-")[0]}/${featuredCompareKey.split("-")[1]}`
    : null;
  const featuredStintHref = manifest.stints ? `/stints/${route.season}/${route.grandPrix}/${route.session}` : null;
  const activeRaceControlMessages = useMemo(() => {
    if (!replay.raceControlMessages?.length) {
      return [];
    }

    return replay.raceControlMessages
      .filter((message) => message.t <= currentTime)
      .slice(-3)
      .reverse();
  }, [currentTime, replay.raceControlMessages]);

  const handleSkipTime = useCallback((delta: number) => {
    const nextTime = Math.max(0, Math.min(totalTime, currentTime + delta));
    const index = findFrameIndexForTime(nextTime);
    setCurrentFrameIndex(index);
    setIsPlaying(false);
  }, [currentTime, findFrameIndexForTime, totalTime]);

  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) {
      lastTimeRef.current = timestamp;
    }

    const deltaMs = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    const timeAdvance = (deltaMs / 1000) * playbackSpeed;

    setCurrentFrameIndex((prev) => {
      const currentTimeVal = replay.frames[prev]?.t || 0;
      const newTime = currentTimeVal + timeAdvance;

      if (newTime >= totalTime) {
        setIsPlaying(false);
        return replay.frames.length - 1;
      }

      return findFrameIndexForTime(newTime);
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
  }, [isPlaying, animate]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tagName)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (isPlaying) {
          handlePause();
        } else {
          handlePlay();
        }
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

      if (event.code === "Digit1") {
        handleSpeedChange(0.5);
      }

      if (event.code === "Digit2") {
        handleSpeedChange(1);
      }

      if (event.code === "Digit3") {
        handleSpeedChange(2);
      }

      if (event.code === "Digit4") {
        handleSpeedChange(4);
      }

      if (event.code === "KeyR") {
        event.preventDefault();
        handleSeek(0);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePause, handlePlay, handleSeek, handleSkipLap, handleSkipTime, isPlaying, handleSpeedChange]);

  return (
    <div className="replay-view">
      <section className="hero hero--compact replay-hero">
        <p className="eyebrow">Replay surface</p>
        <h1>{replay.grandPrix} · {replay.session}</h1>
        <p className="lead">
          Track playback, leaderboard order, and selected-driver telemetry from a compact exported replay pack.
        </p>
        <div className="replay-meta-row">
          <span className="replay-meta-pill">{replay.season} season</span>
          <span className="replay-meta-pill">Session key {replay.sessionKey}</span>
          <span className="replay-meta-pill">{selectedDriver ? `Driver focus: ${selectedDriver}` : "Full-field view"}</span>
          <span className="replay-meta-pill">{summary.weatherSummary.airTempC}C / {summary.weatherSummary.trackTempC}C</span>
          <span className="replay-meta-pill">Rain risk {summary.weatherSummary.rainRiskPct}%</span>
        </div>
      </section>

      <div className="replay-content">
        <div className="replay-main">
          {replayFocus ? (
            <section className="replay-focus-panel">
              <p className="eyebrow">Engineering lens</p>
              <h2>{replayFocus.replayTitle}</h2>
              <p>{replayFocus.replaySummary}</p>

              <div className="replay-meta-row replay-meta-row--focus">
                {suggestedDriver ? (
                  <span className="replay-meta-pill">Suggested driver {suggestedDriver.driverCode}</span>
                ) : null}
                {suggestedDriver && suggestedDriver.lapTime !== null ? (
                  <span className="replay-meta-pill">
                    Fastest lap {formatLapTime(suggestedDriver.lapTime)} · Lap {suggestedDriver.lapNumber}
                  </span>
                ) : null}
              </div>

              <ul className="replay-focus-list">
                {replayFocus.watchList.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <div className="replay-focus-actions">
                <a className="button button--ghost" href={replayFocus.learnHref}>{replayFocus.learnLabel}</a>
                <a className="button button--secondary" href={`/cars/current-spec?focus=${replayFocus.id}`}>
                  Return to modelview
                </a>
                {suggestedDriver && selectedDriver !== suggestedDriver.driverCode ? (
                  <button className="button" type="button" onClick={() => handleDriverSelect(suggestedDriver.driverCode)}>
                    Inspect {suggestedDriver.driverCode}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className="replay-stage">
            <TrackCanvas
              trackPath={replay.trackPath}
              drivers={replay.drivers}
              currentFrame={currentFrame}
              width={900}
              height={600}
              selectedDriver={selectedDriver}
              onDriverClick={handleDriverSelect}
            />
          </div>

          <PlaybackControls
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            currentTime={currentTime}
            totalTime={totalTime}
            currentLap={currentLap}
            trackStatus={trackStatus}
            onPlay={handlePlay}
            onPause={handlePause}
            onSpeedChange={handleSpeedChange}
            onSeek={handleSeek}
            onSkipLap={handleSkipLap}
            onSkipTime={handleSkipTime}
          />

          {compare ? <ReplayComparePanel compare={compare} legacyHref={featuredCompareHref} /> : null}
          {stintPack ? <ReplayStintPanel stintPack={stintPack} legacyHref={featuredStintHref} /> : null}
        </div>

        <div className="replay-sidebar">
          <section className="driver-telemetry replay-observer-panel">
            <p className="eyebrow">Replay workflow</p>
            <h3>Keep the main surface focused.</h3>
            <p className="driver-telemetry__focus-note">
              Replay is the core product. Compare and stint reads now live inside this workspace, while Modelview and Learn stay available as secondary routes for deeper context.
            </p>
            <div className="replay-metric-tags">
              <span className="replay-metric-tag">Space play/pause</span>
              <span className="replay-metric-tag">Arrows skip time</span>
              <span className="replay-metric-tag">[ ] jump laps</span>
              <span className="replay-metric-tag">1-4 speed</span>
            </div>
            <div className="replay-secondary-links">
              <a href={`/sessions/${route.season}/${route.grandPrix}/${route.session}`}>Session summary</a>
              <a href="/cars/current-spec">Modelview</a>
              <a href="/learn">Learn</a>
            </div>
          </section>

          {activeRaceControlMessages.length ? (
            <section className="driver-telemetry replay-observer-panel">
              <p className="eyebrow">Race control</p>
              <h3>Latest messages</h3>
              <ul className="summary-list summary-list--compact">
                {activeRaceControlMessages.map((message) => (
                  <li key={`${message.t}-${message.message}`}>
                    <strong>{message.flag || message.category}</strong>
                    <span>
                      T+{Math.floor(message.t)}s{message.lapNumber ? ` · Lap ${message.lapNumber}` : ""} · {message.message}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Leaderboard
            drivers={replay.drivers}
            currentFrame={currentFrame}
            selectedDriver={selectedDriver}
            onDriverSelect={handleDriverSelect}
          />

          {replayFocus ? (
            <section className="driver-telemetry replay-observer-panel">
              <p className="eyebrow">Telemetry guide</p>
              <h3>{selectedDriver ? `Watching ${selectedDriver}` : "Choose a driver to inspect"}</h3>
              <p className="driver-telemetry__focus-note">
                {selectedDriver
                  ? `Cards marked Focus are the main telemetry signals for ${replayFocus.shortLabel.toLowerCase()}.`
                  : suggestedDriver
                    ? `Start with ${suggestedDriver.driverCode} if you want one representative lap to inspect right away.`
                    : "Select any driver from the leaderboard to connect the focus story to telemetry."}
              </p>
              <div className="replay-metric-tags">
                {focusMetrics.map((metric) => (
                  <span className="replay-metric-tag" key={metric}>{REPLAY_METRIC_LABELS[metric]}</span>
                ))}
              </div>
              {suggestedDriver && selectedDriver !== suggestedDriver.driverCode ? (
                <button className="button button--secondary replay-observer-panel__button" type="button" onClick={() => handleDriverSelect(suggestedDriver.driverCode)}>
                  Inspect {suggestedDriver.driverCode} telemetry
                </button>
              ) : null}
            </section>
          ) : null}

          {selectedDriver && currentFrame?.drivers[selectedDriver] && (
            <div className="driver-telemetry">
              <h3>{selectedDriver}</h3>
              {replayFocus ? (
                <p className="driver-telemetry__focus-note">
                  Focus on {replayFocus.watchMetrics.map((metric) => REPLAY_METRIC_LABELS[metric]).join(", ")} for the {replayFocus.shortLabel.toLowerCase()} story.
                </p>
              ) : null}
              <div className="replay-telemetry-grid">
                {telemetryItems.map((item) => {
                  const isFocusMetric = focusMetrics.includes(item.id);

                  return (
                    <div className={`telemetry-item${isFocusMetric ? " telemetry-item--focus" : ""}`} key={item.id}>
                      <div className="telemetry-label-row">
                        <span className="telemetry-label">{item.label}</span>
                        {isFocusMetric ? <span className="telemetry-badge">Focus</span> : null}
                      </div>
                      <span className="telemetry-value">{item.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
