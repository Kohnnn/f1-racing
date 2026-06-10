"use client";

import type { ReplayFrame, ReplayFrameDriver, ReplayPack } from "@/lib/data";

interface ReplayDebugPanelProps {
  currentTime: number;
  frameIndex: number;
  loadedFrames: number;
  totalFrameCount: number | null;
  playbackSpeed: number;
  loadedEndTime: number;
  chunkIndex: ReplayPack["frameChunkIndex"] | null;
  frame: ReplayFrame | null;
  nextFrameT: number | null;
  selectedDrivers: string[];
}

function pickDebugDriver(frame: ReplayFrame | null, selectedDrivers: string[]): ReplayFrameDriver | null {
  if (!frame) {
    return null;
  }
  for (const code of selectedDrivers) {
    const driver = frame.drivers[code];
    if (driver) {
      return driver;
    }
  }
  let leader: ReplayFrameDriver | null = null;
  for (const driver of Object.values(frame.drivers)) {
    if (!leader || driver.position < leader.position) {
      leader = driver;
    }
  }
  return leader;
}

function formatValue(value: number | string | null | undefined, digits = 1) {
  if (value === null || value === undefined) {
    return "–";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
  }
  return value;
}

export function ReplayDebugPanel({
  currentTime,
  frameIndex,
  loadedFrames,
  totalFrameCount,
  playbackSpeed,
  loadedEndTime,
  chunkIndex,
  frame,
  nextFrameT,
  selectedDrivers,
}: ReplayDebugPanelProps) {
  const driver = pickDebugDriver(frame, selectedDrivers);
  const totalChunks = chunkIndex?.length ?? 0;
  const loadedChunks = chunkIndex
    ? chunkIndex.filter((chunk) => chunk.fromTime <= loadedEndTime).length
    : 0;
  const nextFrameDeltaMs = frame && nextFrameT !== null
    ? Math.round((nextFrameT - frame.t) * 1000)
    : null;

  const driverRows: Array<[string, string]> = driver
    ? [
      ["driverCode", driver.driverCode],
      ["positionSource", driver.positionSource ?? "–"],
      ...(driver.rawX !== undefined || driver.rawY !== undefined
        ? [
          ["rawX", formatValue(driver.rawX, 1)] as [string, string],
          ["rawY", formatValue(driver.rawY, 1)] as [string, string],
        ]
        : []),
      ["speed", formatValue(driver.speed)],
      ["gear", formatValue(driver.gear)],
      ["drs", formatValue(driver.drs)],
      ["interval", formatValue(driver.interval, 3)],
    ]
    : [];

  return (
    <aside className="replay-debug-panel" aria-label="Replay debug overlay">
      <p className="replay-debug-panel__title">debug</p>
      <dl className="replay-debug-panel__grid">
        <dt>t</dt>
        <dd>{currentTime.toFixed(1)}s</dd>
        <dt>frame</dt>
        <dd>{frameIndex} / {loadedFrames}{totalFrameCount !== null ? ` (total ${totalFrameCount})` : ""}</dd>
        <dt>speed</dt>
        <dd>{playbackSpeed}x</dd>
        <dt>chunks</dt>
        <dd>{totalChunks > 0 ? `${loadedChunks} / ${totalChunks}` : "monolithic"}</dd>
        <dt>next dt</dt>
        <dd>{nextFrameDeltaMs !== null ? `${nextFrameDeltaMs}ms` : "–"}</dd>
      </dl>
      {driverRows.length > 0 ? (
        <dl className="replay-debug-panel__grid replay-debug-panel__grid--driver">
          {driverRows.map(([key, value]) => (
            <div key={key} className="replay-debug-panel__row">
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="replay-debug-panel__empty">no frame driver</p>
      )}
    </aside>
  );
}
