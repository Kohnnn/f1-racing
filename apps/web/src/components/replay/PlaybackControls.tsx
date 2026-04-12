"use client";

const SPEEDS = [0.5, 1, 2, 4];
const SKIPS = [10, 60];

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
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
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
      label: currentTime === 0 && loadedTime === 0 ? "Booting replay" : "Loading chunk",
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
    label: `Ready +${formatTime(bufferedAhead)}`,
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
}: PlaybackControlsProps) {
  const progress = totalTime > 0 ? (currentTime / totalTime) * 100 : 0;
  const loadedProgress = totalTime > 0 ? (loadedTime / totalTime) * 100 : 0;
  const bufferState = getBufferState(currentTime, loadedTime, totalTime);

  return (
    <section className="replay-controls-v2">
      <div className="replay-controls-v2__progress" onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        onSeek(Math.max(0, Math.min(totalTime, ratio * totalTime)));
      }}>
        <div className="replay-controls-v2__buffer-fill" style={{ width: `${loadedProgress}%` }} />
        <div className="replay-controls-v2__progress-fill" style={{ width: `${progress}%` }} />
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
          <button type="button" className="replay-controls-v2__ghost" onClick={() => onSkipLap(-1)}>Prev lap</button>
          <button type="button" className="replay-controls-v2__play" onClick={isPlaying ? onPause : onPlay}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" className="replay-controls-v2__ghost" onClick={() => onSkipLap(1)}>Next lap</button>
        </div>

        <span className={bufferState.className}>{bufferState.label}</span>

        <div className="replay-controls-v2__cluster">
          {SKIPS.map((seconds) => (
            <button key={`forward-${seconds}`} type="button" className="replay-controls-v2__ghost" onClick={() => onSkipTime(seconds)}>
              +{seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`}
            </button>
          ))}
        </div>
        <div className="replay-controls-v2__meta">
          <span>{trackStatus}</span>
          <span>{formatTime(currentTime)} / {formatTime(totalTime)}</span>
          <span>{currentLap ? `Lap ${currentLap}` : "Lap -"}{totalLaps ? ` / ${totalLaps}` : ""}</span>
          <span>Loaded to {formatTime(loadedTime)}</span>
        </div>
        <div className="replay-controls-v2__speeds">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`replay-controls-v2__speed${playbackSpeed === speed ? " replay-controls-v2__speed--active" : ""}`}
              onClick={() => onSpeedChange(speed)}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
