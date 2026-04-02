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
      case "SC": return "#ff8800";
      case "RED": return "#ff0000";
      default: return "#888888";
    }
  }

  function cycleSpeed() {
    const currentIndex = SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % SPEEDS.length;
    onSpeedChange(SPEEDS[nextIndex]);
  }

  return (
    <div className="playback-controls">
      <div className="playback-status">
        <span className="track-status" style={{ color: getTrackStatusColor(trackStatus) }}>
          {trackStatus === "GREEN" ? "●" : "⚠"} {trackStatus}
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
          onClick={() => onSkipLap(-1)}
          className="control-button"
          title="Previous lap"
        >
          ⏮
        </button>

        <button
          onClick={() => isPlaying ? onPause() : onPlay()}
          className="control-button control-button--primary"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        <button
          onClick={() => onSkipLap(1)}
          className="control-button"
          title="Next lap"
        >
          ⏭
        </button>

        <button
          onClick={cycleSpeed}
          className="control-button control-button--speed"
          title="Playback speed"
        >
          {playbackSpeed}x
        </button>
      </div>

      <style>{`
        .playback-controls {
          background: #16162a;
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .playback-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .track-status {
          font-weight: 600;
          font-family: monospace;
        }

        .current-lap {
          color: #888;
          font-family: monospace;
        }

        .playback-progress {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .time-display {
          font-family: monospace;
          font-size: 13px;
          color: #aaa;
          min-width: 60px;
        }

        .time-display:last-child {
          text-align: right;
        }

        .progress-slider {
          flex: 1;
          height: 6px;
          appearance: none;
          background: #333;
          border-radius: 3px;
          cursor: pointer;
        }

        .progress-slider::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          background: #fff;
          border-radius: 50%;
          cursor: pointer;
        }

        .progress-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: #fff;
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }

        .playback-buttons {
          display: flex;
          justify-content: center;
          gap: 8px;
        }

        .control-button {
          background: #2a2a4a;
          border: none;
          color: #fff;
          padding: 10px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          transition: background 0.15s;
          min-width: 44px;
        }

        .control-button:hover {
          background: #3a3a5a;
        }

        .control-button:active {
          background: #4a4a6a;
        }

        .control-button--primary {
          background: #3671C6;
          min-width: 56px;
          font-size: 20px;
        }

        .control-button--primary:hover {
          background: #4681d6;
        }

        .control-button--speed {
          font-family: monospace;
          font-weight: 600;
          min-width: 50px;
        }
      `}</style>
    </div>
  );
}
