"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TrackCanvas } from "./TrackCanvas";
import { PlaybackControls } from "./PlaybackControls";
import { Leaderboard } from "./Leaderboard";
import type { ReplayPack, ReplayFrame } from "@/lib/data";

interface ReplayViewProps {
  replay: ReplayPack;
}

export function ReplayView({ replay }: ReplayViewProps) {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const totalFrames = replay.frames.length;
  const totalTime = replay.frames[totalFrames - 1]?.t || 0;
  const currentFrame = replay.frames[currentFrameIndex] || null;
  const currentTime = currentFrame?.t || 0;

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
  }, [isPlaying, playbackSpeed, replay.frames, totalTime, findFrameIndexForTime]);

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

  return (
    <div className="replay-view">
      <div className="replay-header">
        <h1>{replay.grandPrix} · {replay.session}</h1>
        <p className="replay-meta">
          {replay.season} · Session key {replay.sessionKey}
          {selectedDriver && ` · Viewing: ${selectedDriver}`}
        </p>
      </div>

      <div className="replay-content">
        <div className="replay-main">
          <TrackCanvas
            trackPath={replay.trackPath}
            drivers={replay.drivers}
            currentFrame={currentFrame}
            width={900}
            height={600}
            selectedDriver={selectedDriver}
            onDriverClick={handleDriverSelect}
          />

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
          />
        </div>

        <div className="replay-sidebar">
          <Leaderboard
            drivers={replay.drivers}
            currentFrame={currentFrame}
            selectedDriver={selectedDriver}
            onDriverSelect={handleDriverSelect}
          />

          {selectedDriver && currentFrame?.drivers[selectedDriver] && (
            <div className="driver-telemetry">
              <h3>{selectedDriver}</h3>
              <div className="telemetry-grid">
                <div className="telemetry-item">
                  <span className="telemetry-label">Speed</span>
                  <span className="telemetry-value">
                    {currentFrame.drivers[selectedDriver].speed !== null
                      ? `${Math.round(currentFrame.drivers[selectedDriver].speed!)} km/h`
                      : "-"}
                  </span>
                </div>
                <div className="telemetry-item">
                  <span className="telemetry-label">Gear</span>
                  <span className="telemetry-value">
                    {currentFrame.drivers[selectedDriver].gear ?? "-"}
                  </span>
                </div>
                <div className="telemetry-item">
                  <span className="telemetry-label">Throttle</span>
                  <span className="telemetry-value">
                    {currentFrame.drivers[selectedDriver].throttle !== null
                      ? `${Math.round(currentFrame.drivers[selectedDriver].throttle!)}%`
                      : "-"}
                  </span>
                </div>
                <div className="telemetry-item">
                  <span className="telemetry-label">Brake</span>
                  <span className="telemetry-value">
                    {currentFrame.drivers[selectedDriver].brake !== null
                      ? `${Math.round(currentFrame.drivers[selectedDriver].brake!)}%`
                      : "-"}
                  </span>
                </div>
                <div className="telemetry-item">
                  <span className="telemetry-label">DRS</span>
                  <span className="telemetry-value">
                    {currentFrame.drivers[selectedDriver].drs ?? "-"}
                  </span>
                </div>
                <div className="telemetry-item">
                  <span className="telemetry-label">Lap</span>
                  <span className="telemetry-value">
                    {currentFrame.drivers[selectedDriver].lap ?? "-"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .replay-view {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .replay-header {
          margin-bottom: 24px;
        }

        .replay-header h1 {
          font-size: 28px;
          font-weight: 600;
          margin: 0 0 8px 0;
        }

        .replay-meta {
          color: #888;
          font-size: 14px;
          margin: 0;
        }

        .replay-content {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 24px;
        }

        @media (max-width: 1100px) {
          .replay-content {
            grid-template-columns: 1fr;
          }
        }

        .replay-main {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .replay-sidebar {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .driver-telemetry {
          background: #16162a;
          border-radius: 12px;
          padding: 16px;
        }

        .driver-telemetry h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .telemetry-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .telemetry-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .telemetry-label {
          font-size: 10px;
          text-transform: uppercase;
          color: #888;
          letter-spacing: 0.5px;
        }

        .telemetry-value {
          font-family: monospace;
          font-size: 14px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
