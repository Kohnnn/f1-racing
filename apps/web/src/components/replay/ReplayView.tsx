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

const UI_SYNC_INTERVAL_MS = 180;

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
  onEnsureTimeLoaded?: (time: number) => void;
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

function formatSlugLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

export function ReplayView({ replay, manifest, summary, compare, route, stintPack, onEnsureTimeLoaded }: ReplayViewProps) {
  const initialTime = replay.frames[0]?.t || 0;
  const [playbackState, setPlaybackState] = useState(() => ({
    currentTime: initialTime,
    frameIndex: 0,
  }));
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const playheadTimeRef = useRef(initialTime);
  const frameIndexRef = useRef(0);
  const lastUiSyncRef = useRef(initialTime);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setFocusId(params.get("focus"));
  }, []);

  const totalTime = replay.totalTime ?? (replay.frames.at(-1)?.t || 0);
  const loadedEndTime = replay.frames.at(-1)?.t || 0;
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
  const currentFrame = replay.frames[currentFrameIndex] || null;
  const nextFrame = replay.frames[currentFrameIndex + 1] || null;
  const currentTime = playbackState.currentTime;
  const trackStatus = currentFrame?.trackStatus || "GREEN";
  const currentLap = currentFrame?.lap || null;
  const totalLaps = Math.max(...replay.laps.map((lap) => lap.lapNumber), 0);
  const replayFocus = getFocusPoint(focusId);
  const trackLabel = formatSlugLabel(replay.trackId);
  const replaySourceLabel = formatReplaySource(replay.source);

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

  const fastestLap = useMemo(() => {
    const completedLaps = replay.laps.filter((lap) => lap.lapTime !== null);
    if (!completedLaps.length) {
      return null;
    }

    return completedLaps
      .slice()
      .sort((left, right) => (left.lapTime ?? Infinity) - (right.lapTime ?? Infinity))[0];
  }, [replay.laps]);

  const suggestedDriver = useMemo(() => {
    return fastestLap?.driverCode ?? displayedDrivers[0]?.abbr ?? null;
  }, [displayedDrivers, fastestLap]);

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
  const weatherLabel = currentWeather
    ? `${currentWeather.airTempC}C air · ${currentWeather.trackTempC}C track`
    : `${summary.weatherSummary.airTempC}C air · ${summary.weatherSummary.trackTempC}C track`;
  const windLabel = currentWeather
    ? `${currentWeather.windSpeedMps.toFixed(1)} m/s · ${Math.round(currentWeather.windDirectionDeg)}°`
    : `Rain risk ${summary.weatherSummary.rainRiskPct}%`;
  const selectedDriverLabel = selectedTelemetryDrivers.length
    ? selectedTelemetryDrivers.map((driver) => driver.abbr).join(" · ")
    : "No drivers selected";
  const leadDriver = displayedDrivers[0] || null;

  const featuredCompareKey = Object.keys(manifest.compare ?? {})[0] ?? null;
  const featuredCompareHref = featuredCompareKey
    ? `/compare/${route.season}/${route.grandPrix}/${route.session}/${featuredCompareKey.split("-")[0]}/${featuredCompareKey.split("-")[1]}`
    : null;
  const featuredStintHref = manifest.stints ? `/stints/${route.season}/${route.grandPrix}/${route.session}` : null;

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
    setIsPlaying(false);
  }, [findFrameIndexForTime, onEnsureTimeLoaded, syncPlaybackState, totalTime]);

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

  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) {
      lastTimeRef.current = timestamp;
    }

    const deltaMs = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    const nextTime = playheadTimeRef.current + (deltaMs / 1000) * playbackSpeed;
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
    onEnsureTimeLoaded?.(nextTime + playbackSpeed * 12);
    const nextFrameIndex = findFrameIndexForTime(nextTime);
    const frameChanged = nextFrameIndex !== frameIndexRef.current;
    const uiDue = (nextTime - lastUiSyncRef.current) * 1000 >= UI_SYNC_INTERVAL_MS;

    if (frameChanged || uiDue) {
      frameIndexRef.current = nextFrameIndex;
      lastUiSyncRef.current = nextTime;
      setPlaybackState({ currentTime: nextTime, frameIndex: nextFrameIndex });
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [findFrameIndexForTime, loadedEndTime, onEnsureTimeLoaded, playbackSpeed, replay.frames.length, syncPlaybackState, totalTime]);

  useEffect(() => {
    onEnsureTimeLoaded?.(currentTime + playbackSpeed * 12);
  }, [currentTime, onEnsureTimeLoaded, playbackSpeed]);

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
          <h1>{replay.grandPrix}</h1>
          <p>
            {replay.session} replay at {trackLabel}. Live order, race control, and selected telemetry stay on one surface so the lap story reads like a control room instead of a route switch.
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
            <strong>{currentLap ? `${currentLap}${totalLaps ? ` / ${totalLaps}` : ""}` : totalLaps ? `- / ${totalLaps}` : "-"}</strong>
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
            {replay.note || `${replaySourceLabel} · session key ${replay.sessionKey}`}
          </p>
          <div className="replay-session-banner__actions">
            <a className="replay-session-banner__action replay-session-banner__action--primary" href="/replay">Replay library</a>
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

      <div className="replay-workspace-grid">
        <section className="replay-track-panel">
          <div className="replay-track-panel__header">
            <div className="replay-track-panel__title">
              <p className="eyebrow">Track stage</p>
              <h2>{trackLabel}</h2>
              <p>
                Click any marker to isolate a car. Shift-click keeps a comparison set of up to four drivers pinned into the telemetry deck below.
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
                <strong>{activeRaceControlMessages.length || 0}</strong>
              </div>
            </div>
          </div>

          <div className="replay-track-panel__canvas">
            <TrackCanvas
              trackPath={replay.trackPath}
              drivers={replay.drivers}
              currentFrame={currentFrame}
              nextFrame={nextFrame}
              selectedDrivers={selectedDrivers}
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
            <p className="eyebrow">Current read</p>
            <h3>{selectedTelemetryDrivers.length ? `Telemetry on ${selectedDriverLabel}` : leadDriver ? `${leadDriver.abbr} leads the field` : "Pick a driver to inspect"}</h3>
            <p>
              Track clicks and leaderboard picks feed the same telemetry deck. Keep fast context here, then use compare or stints lower down when you need a deeper supporting read.
            </p>
            <dl className="replay-side-card__stats">
              <div>
                <dt>Leader</dt>
                <dd>{leadDriver ? `${leadDriver.abbr} · ${leadDriver.team}` : "-"}</dd>
              </div>
              <div>
                <dt>Fastest lap</dt>
                <dd>{fastestLap?.lapTime ? `${fastestLap.driverCode} · ${formatLapTime(fastestLap.lapTime)}` : "-"}</dd>
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
          />
        </aside>
      </div>

      <section className="replay-telemetry-panel">
        <div className="section-header replay-telemetry-panel__header">
          <div>
            <p className="eyebrow">Driver telemetry</p>
            <h2>{selectedTelemetryDrivers.length ? "Selected telemetry strips" : "Select drivers from the leaderboard"}</h2>
          </div>
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
        onSpeedChange={setPlaybackSpeed}
        onSeek={handleSeek}
        onSkipLap={handleSkipLap}
        onSkipTime={handleSkipTime}
        onPlay={() => {
          if (playheadTimeRef.current >= totalTime) {
            syncPlaybackState(0, 0);
          }
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
      />

      {compare ? <ReplayComparePanel compare={compare} legacyHref={featuredCompareHref} /> : null}
      {stintPack ? <ReplayStintPanel stintPack={stintPack} legacyHref={featuredStintHref} /> : null}
    </div>
  );
}
