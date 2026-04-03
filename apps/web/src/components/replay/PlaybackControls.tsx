"use client";

interface PlaybackControlsProps {
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;
  totalTime: number;
  currentLap: number | null;
  trackStatus: string;
  onPlay: () => void;
  onPause: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (time: number) => void;
  onSkipLap: (delta: number) => void;
  onSkipTime: (delta: number) => void;
}

const SPEEDS = [0.5, 1, 2, 4];

export function PlaybackControls({
  isPlaying,
  playbackSpeed,
  currentTime,
  totalTime,
  currentLap,
  trackStatus,
  onPlay,
  onPause,
  onSpeedChange,
  onSeek,
  onSkipLap,
  onSkipTime,
}: PlaybackControlsProps) {
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  }

  function getTrackStatusColor(status: string): string {
    switch (status) {
      case "GREEN": return "#00ff00";
      case "YELLOW": return "#ffff00";
      case "DOUBLE YELLOW": return "#ffcc00";
      case "SC": return "#ff8800";
      case "VSC": return "#ff9f43";
      case "RED": return "#ff0000";
      case "CHEQUERED": return "#ffffff";
      default: return "#888888";
    }
  }

  function cycleSpeed() {
    const currentIndex = SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % SPEEDS.length;
    onSpeedChange(SPEEDS[nextIndex]);
  }

  return (
    <div className="replay-controls">
      <div className="playback-status">
        <span className="track-status" style={{ color: getTrackStatusColor(trackStatus) }}>
          {trackStatus === "GREEN" ? "●" : trackStatus === "CHEQUERED" ? "🏁" : "⚠"} {trackStatus}
        </span>
        <span className="current-lap">
          {currentLap ? `Lap ${currentLap}` : "-"}
        </span>
      </div>

      <div className="playback-progress">
        <span className="time-display">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={totalTime}
          step={0.1}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="progress-slider"
        />
        <span className="time-display">{formatTime(totalTime)}</span>
      </div>

      <div className="playback-buttons">
        <button
          type="button"
          onClick={() => onSkipTime(-30)}
          className="control-button control-button--timing"
          title="Back 30 seconds"
        >
          -30s
        </button>

        <button
          type="button"
          onClick={() => onSkipTime(-5)}
          className="control-button control-button--timing"
          title="Back 5 seconds"
        >
          -5s
        </button>

        <button
          type="button"
          onClick={() => onSkipLap(-1)}
          className="control-button"
          title="Previous lap"
        >
          ⏮
        </button>

        <button
          type="button"
          onClick={() => isPlaying ? onPause() : onPlay()}
          className="control-button control-button--primary"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        <button
          type="button"
          onClick={() => onSkipLap(1)}
          className="control-button"
          title="Next lap"
        >
          ⏭
        </button>

        <button
          type="button"
          onClick={() => onSkipTime(5)}
          className="control-button control-button--timing"
          title="Forward 5 seconds"
        >
          +5s
        </button>

        <button
          type="button"
          onClick={() => onSkipTime(30)}
          className="control-button control-button--timing"
          title="Forward 30 seconds"
        >
          +30s
        </button>

        <button
          type="button"
          onClick={cycleSpeed}
          className="control-button control-button--speed"
          title="Playback speed"
        >
          {playbackSpeed}x
        </button>
      </div>

      <div className="playback-hints">
        <span>Space play/pause</span>
        <span>Arrows skip 5s</span>
        <span>Shift + arrows skip 30s</span>
        <span>[ ] jump lap</span>
        <span>1-4 speed</span>
      </div>
    </div>
  );
}
