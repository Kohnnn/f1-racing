"use client";

const SPEEDS = [0.5, 1, 2, 4];
const SKIPS = [5, 30, 60, 300];

interface PlaybackControlsProps {
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;
  totalTime: number;
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

export function PlaybackControls({
  isPlaying,
  playbackSpeed,
  currentTime,
  totalTime,
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

  return (
    <section className="replay-controls-v2">
      <div className="replay-controls-v2__progress" onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        onSeek(Math.max(0, Math.min(totalTime, ratio * totalTime)));
      }}>
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

        <div className="replay-controls-v2__cluster">
          {SKIPS.map((seconds) => (
            <button key={`forward-${seconds}`} type="button" className="replay-controls-v2__ghost" onClick={() => onSkipTime(seconds)}>
              +{seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`}
            </button>
          ))}
        </div>
      </div>

      <div className="replay-controls-v2__footer">
        <div className="replay-controls-v2__meta">
          <span>{trackStatus}</span>
          <span>{formatTime(currentTime)} / {formatTime(totalTime)}</span>
          <span>{currentLap ? `Lap ${currentLap}` : "Lap -"}{totalLaps ? ` / ${totalLaps}` : ""}</span>
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
