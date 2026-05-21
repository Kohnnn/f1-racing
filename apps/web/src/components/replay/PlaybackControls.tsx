"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const SPEEDS = [0.1, 0.2, 0.5, 1, 2, 4, 8, 16, 20];
const SKIPS = [5, 30, 60, 300];

export interface PlaybackSegment {
  /** start time in replay clock seconds */
  fromTime: number;
  /** end time in replay clock seconds */
  toTime: number;
  /** zone variant — drives color */
  type: "sc" | "vsc" | "yellow" | "red" | "pit" | "drs";
  label?: string;
}

interface PlaybackControlsProps {
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;
  totalTime: number;
  loadedTime: number;
  currentLap: number | null;
  totalLaps: number;
  trackStatus: string;
  onPlay: () => void;
  onPause: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (time: number) => void;
  onSkipLap: (delta: number) => void;
  onSkipTime: (delta: number) => void;
  onRestart?: () => void;
  onToggleLabels: () => void;
  onToggleDrsZones: () => void;
  onToggleEvents: () => void;
  onToggleMarshalSectors?: () => void;
  onToggleLoop?: () => void;
  onMarkLoopIn?: () => void;
  onMarkLoopOut?: () => void;
  onClearLoop?: () => void;
  onShowShortcuts?: () => void;
  onLoadFullRace?: () => void;
  loadProgress?: number; // 0..1 while load-full-race is in flight
  showDriverLabels: boolean;
  showDrsZones: boolean;
  showEvents: boolean;
  showMarshalSectors?: boolean;
  loopActive?: boolean;
  loopFromTime?: number | null;
  loopToTime?: number | null;
  events: Array<{
    t: number;
    label: string;
    type: string;
  }>;
  segments?: PlaybackSegment[];
  estimatedLapDuration?: number;
}

function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function getBufferState(currentTime: number, loadedTime: number, totalTime: number) {
  if (totalTime > 0 && currentTime >= totalTime) {
    return {
      label: "Session complete",
      className: "replay-controls-v2__status replay-controls-v2__status--ready",
    };
  }

  const bufferedAhead = Math.max(0, loadedTime - currentTime);
  if (bufferedAhead < 3) {
    return {
      label: currentTime === 0 && loadedTime === 0 ? "Loading replay" : "Loading chunk",
      className: "replay-controls-v2__status replay-controls-v2__status--loading",
    };
  }

  if (bufferedAhead < 18) {
    return {
      label: `Buffer +${formatTime(bufferedAhead)}`,
      className: "replay-controls-v2__status replay-controls-v2__status--warm",
    };
  }

  return {
    label: `Loaded to ${formatTime(loadedTime)}`,
    className: "replay-controls-v2__status replay-controls-v2__status--ready",
  };
}

export function PlaybackControls({
  isPlaying,
  playbackSpeed,
  currentTime,
  totalTime,
  loadedTime,
  currentLap,
  totalLaps,
  trackStatus,
  onPlay,
  onPause,
  onSpeedChange,
  onSeek,
  onSkipLap,
  onSkipTime,
  onRestart,
  onToggleLabels,
  onToggleDrsZones,
  onToggleEvents,
  onToggleMarshalSectors,
  onToggleLoop,
  onMarkLoopIn,
  onMarkLoopOut,
  onClearLoop,
  onShowShortcuts,
  onLoadFullRace,
  loadProgress,
  showDriverLabels,
  showDrsZones,
  showEvents,
  showMarshalSectors,
  loopActive,
  loopFromTime,
  loopToTime,
  events,
  segments,
  estimatedLapDuration,
}: PlaybackControlsProps) {
  const progress = totalTime > 0 ? (currentTime / totalTime) * 100 : 0;
  const loadedProgress = totalTime > 0 ? (loadedTime / totalTime) * 100 : 0;
  const bufferState = getBufferState(currentTime, loadedTime, totalTime);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ leftPct: number; t: number } | null>(null);
  const [loadStartedAt, setLoadStartedAt] = useState<number | null>(null);
  const lapEstimate = estimatedLapDuration && estimatedLapDuration > 0 ? estimatedLapDuration : 95;
  const remainingSeconds = Math.max(0, totalTime - currentTime);
  const showLoadMore = Boolean(onLoadFullRace) && totalTime - loadedTime > 30;
  const isLoadingFullRace =
    typeof loadProgress === "number" && loadProgress > 0 && loadProgress < 1;

  useEffect(() => {
    if (isLoadingFullRace && !loadStartedAt) setLoadStartedAt(Date.now());
    if (!isLoadingFullRace && loadStartedAt) setLoadStartedAt(null);
  }, [isLoadingFullRace, loadStartedAt]);

  const loadEta = useMemo(() => {
    if (!isLoadingFullRace || !loadStartedAt || !loadProgress || loadProgress <= 0.02) return null;
    const elapsed = (Date.now() - loadStartedAt) / 1000;
    const total = elapsed / loadProgress;
    return Math.max(0, total - elapsed);
  }, [isLoadingFullRace, loadProgress, loadStartedAt]);

  function handleProgressMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!progressRef.current || totalTime <= 0) {
      setHover(null);
      return;
    }
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setHover({ leftPct: ratio * 100, t: ratio * totalTime });
  }

  function handleProgressLeave() {
    setHover(null);
  }

  return (
    <section className="replay-controls-v2">
      <div
        ref={progressRef}
        className="replay-controls-v2__progress"
        onMouseMove={handleProgressMove}
        onMouseLeave={handleProgressLeave}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          onSeek(Math.max(0, Math.min(totalTime, ratio * totalTime)));
        }}
      >
        <div className="replay-controls-v2__buffer-fill" style={{ width: `${loadedProgress}%` }} />

        {/* Segment ribbons (SC/VSC/Yellow/Red/Pit) sit under the playhead. */}
        {segments?.length
          ? segments.map((segment, index) => {
              if (totalTime <= 0) return null;
              const left = Math.max(0, Math.min(100, (segment.fromTime / totalTime) * 100));
              const width = Math.max(0.4, Math.min(100 - left, ((segment.toTime - segment.fromTime) / totalTime) * 100));
              return (
                <div
                  key={`seg-${segment.type}-${segment.fromTime}-${index}`}
                  className={`replay-controls-v2__segment replay-controls-v2__segment--${segment.type}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${segment.label ?? segment.type.toUpperCase()} · ${formatTime(segment.fromTime)} → ${formatTime(segment.toTime)}`}
                />
              );
            })
          : null}

        {/* Loop region */}
        {loopActive && typeof loopFromTime === "number" && typeof loopToTime === "number" && totalTime > 0 ? (
          <div
            className="replay-controls-v2__loop"
            style={{
              left: `${(loopFromTime / totalTime) * 100}%`,
              width: `${Math.max(0.4, ((loopToTime - loopFromTime) / totalTime) * 100)}%`,
            }}
            title={`Looping ${formatTime(loopFromTime)} → ${formatTime(loopToTime)}`}
          />
        ) : null}

        <div className="replay-controls-v2__progress-fill" style={{ width: `${progress}%` }} />
        {showEvents
          ? events.slice(0, 200).map((event, eventIndex) => {
              const left = totalTime > 0 ? Math.max(0, Math.min(100, (event.t / totalTime) * 100)) : 0;
              return (
                <button
                  key={`${event.t}-${event.label}-${eventIndex}`}
                  type="button"
                  className={`replay-controls-v2__event replay-controls-v2__event--${event.type
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")}`}
                  style={{ left: `${left}%` }}
                  title={`${formatTime(event.t)} · ${event.label}`}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    onSeek(event.t);
                  }}
                  aria-label={`Jump to ${event.label} at ${formatTime(event.t)}`}
                />
              );
            })
          : null}
        {hover ? (
          <div className="replay-controls-v2__hover" style={{ left: `${hover.leftPct}%` }}>
            <div className="replay-controls-v2__hover-pin" />
            <div className="replay-controls-v2__hover-card">
              <strong>{formatTime(hover.t)}</strong>
              <span>Lap {Math.max(1, Math.floor(hover.t / lapEstimate) + 1)}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="replay-controls-v2__main">
        <div className="replay-controls-v2__cluster">
          {[...SKIPS].reverse().map((seconds) => (
            <button key={`back-${seconds}`} type="button" className="replay-controls-v2__ghost" onClick={() => onSkipTime(-seconds)}>
              -{seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`}
            </button>
          ))}
        </div>

        <div className="replay-controls-v2__transport">
          <button type="button" className="replay-controls-v2__ghost" onClick={() => onSkipLap(-1)} title="Previous lap [ key">Prev lap</button>
          <button
            type="button"
            className="replay-controls-v2__play"
            onClick={isPlaying ? onPause : onPlay}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "Pause" : "Play"}
            <span className="replay-controls-v2__shortcut">Space</span>
          </button>
          <button type="button" className="replay-controls-v2__ghost" onClick={() => onSkipLap(1)} title="Next lap ] key">Next lap</button>
          {onRestart ? (
            <button
              type="button"
              className="replay-controls-v2__ghost"
              onClick={onRestart}
              title="Restart from start (R)"
            >
              ↺ Restart
            </button>
          ) : null}
        </div>

        <span className={bufferState.className}>{bufferState.label}</span>

        {showLoadMore && !isLoadingFullRace ? (
          <button
            type="button"
            className="replay-controls-v2__load-more"
            onClick={() => onLoadFullRace?.()}
            title={`Load remaining ${formatTime(totalTime - loadedTime)} of session`}
          >
            Load full race
          </button>
        ) : null}
        {isLoadingFullRace ? (
          <div className="replay-controls-v2__load-progress" role="status" aria-live="polite">
            <span className="replay-controls-v2__load-progress-bar">
              <span style={{ width: `${Math.round((loadProgress ?? 0) * 100)}%` }} />
            </span>
            <span className="replay-controls-v2__load-progress-meta">
              Loading {Math.round((loadProgress ?? 0) * 100)}%
              {loadEta !== null ? ` · ETA ${formatTime(loadEta)}` : ""}
            </span>
          </div>
        ) : null}

        <div className="replay-controls-v2__cluster">
          {SKIPS.map((seconds) => (
            <button key={`forward-${seconds}`} type="button" className="replay-controls-v2__ghost" onClick={() => onSkipTime(seconds)}>
              +{seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`}
            </button>
          ))}
        </div>
        <div className="replay-controls-v2__meta">
          <span className="replay-controls-v2__meta-status">{trackStatus}</span>
          <span className="replay-controls-v2__meta-clock">
            <strong>{formatTime(currentTime)}</strong>
            <em>elapsed</em>
          </span>
          <span className="replay-controls-v2__meta-clock">
            <strong>-{formatTime(remainingSeconds)}</strong>
            <em>remaining</em>
          </span>
          <span>{currentLap ? `Lap ${currentLap}` : "Lap -"}{totalLaps ? ` / ${totalLaps}` : ""}</span>
          <span>Loaded {formatTime(loadedTime)} / {formatTime(totalTime)}</span>
        </div>
        <div className="replay-controls-v2__speeds" aria-label="Playback speed presets">
          <span className="replay-controls-v2__speeds-label">Speed</span>
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`replay-controls-v2__speed${playbackSpeed === speed ? " replay-controls-v2__speed--active" : ""}`}
              onClick={() => onSpeedChange(speed)}
              title={`Set playback speed to ${speed}x`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
      <div className="replay-controls-v2__footer">
        <div className="replay-controls-v2__toggles">
          <button type="button" className={showDriverLabels ? "is-active" : ""} onClick={onToggleLabels} title="Toggle driver labels (L)">Labels L</button>
          <button type="button" className={showDrsZones ? "is-active" : ""} onClick={onToggleDrsZones} title="Toggle DRS zones (D)">DRS D</button>
          <button type="button" className={showEvents ? "is-active" : ""} onClick={onToggleEvents} title="Toggle event markers (B)">Events B</button>
          {onToggleMarshalSectors ? (
            <button
              type="button"
              className={showMarshalSectors ? "is-active" : ""}
              onClick={onToggleMarshalSectors}
              title="Toggle marshal-sector flag overlays (M)"
            >
              Marshals M
            </button>
          ) : null}
          {onMarkLoopIn ? (
            <button type="button" onClick={onMarkLoopIn} title="Mark loop in-point (I)">In I</button>
          ) : null}
          {onMarkLoopOut ? (
            <button type="button" onClick={onMarkLoopOut} title="Mark loop out-point (O)">Out O</button>
          ) : null}
          {onToggleLoop ? (
            <button
              type="button"
              className={loopActive ? "is-active" : ""}
              onClick={onToggleLoop}
              title="Toggle loop (L key when in/out set)"
            >
              Loop
            </button>
          ) : null}
          {onClearLoop && (typeof loopFromTime === "number" || typeof loopToTime === "number") ? (
            <button type="button" onClick={onClearLoop} title="Clear loop bounds">Clear loop</button>
          ) : null}
          {onShowShortcuts ? (
            <button
              type="button"
              className="replay-controls-v2__shortcut-help"
              onClick={onShowShortcuts}
              title="Open keyboard shortcuts (?)"
              aria-label="Open keyboard shortcuts"
            >
              ⌨ Shortcuts ?
            </button>
          ) : null}
        </div>
        <p>Space play/pause · arrows seek · Shift+arrows 30s · [ ] laps · R restart · 1-5 speed presets · I/O loop · ? help</p>
      </div>
    </section>
  );
}
