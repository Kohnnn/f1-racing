"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReplayDriver, ReplayFrame } from "@/lib/data";
import { drawDrivers, drawTrack, type DriverMarker, type TrackPoint } from "./track-renderer";

interface TrackCanvasProps {
  trackPath: [number, number][] | null;
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  currentTime: number;
  nextFrame: ReplayFrame | null;
  selectedDrivers: string[];
  width?: number;
  height?: number;
  onDriverClick?: (driverCode: string | null, append: boolean) => void;
}

interface CanvasMetrics {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  padX: number;
  padTop: number;
  padBottom: number;
}

function buildCanvasMetrics(trackPoints: TrackPoint[], width: number, height: number): CanvasMetrics | null {
  if (!trackPoints.length) {
    return null;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of trackPoints) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const padX = 40;
  const padTop = 54;
  const padBottom = 70;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((width - padX * 2) / rangeX, (height - padTop - padBottom) / rangeY);
  const offsetX = padX + (width - padX * 2 - rangeX * scale) / 2;
  const offsetY = padTop + (height - padTop - padBottom - rangeY * scale) / 2;

  return { minX, maxX, minY, maxY, scale, offsetX, offsetY, padX, padTop, padBottom };
}

export function TrackCanvas({
  trackPath,
  drivers,
  currentFrame,
  currentTime,
  nextFrame,
  selectedDrivers,
  width = 920,
  height = 610,
  onDriverClick,
}: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedMarkersRef = useRef<DriverMarker[]>([]);

  const trackPoints = useMemo<TrackPoint[]>(() => (
    trackPath?.map(([x, y]) => ({ x, y })) ?? []
  ), [trackPath]);

  const driverColorByCode = useMemo(
    () => new Map(drivers.map((driver) => [driver.driverCode, driver.teamColor])),
    [drivers],
  );

  const canvasMetrics = useMemo(() => buildCanvasMetrics(trackPoints, width, height), [trackPoints, width, height]);

  const markers = useMemo<DriverMarker[]>(() => {
    if (!currentFrame) {
      return [];
    }

    const frameStart = currentFrame.t;
    const frameEnd = nextFrame?.t ?? frameStart;
    const ratio = frameEnd > frameStart
      ? Math.max(0, Math.min(1, (currentTime - frameStart) / (frameEnd - frameStart)))
      : 0;

    return Object.values(currentFrame.drivers)
      .filter((driver) => driver.x !== null && driver.y !== null)
      .sort((left, right) => left.position - right.position)
      .map((driver) => {
        const nextDriver = nextFrame?.drivers?.[driver.driverCode];
        const targetX = nextDriver?.x ?? driver.x ?? 0;
        const targetY = nextDriver?.y ?? driver.y ?? 0;
        return {
          abbr: driver.driverCode,
          x: (driver.x ?? 0) + (targetX - (driver.x ?? 0)) * ratio,
          y: (driver.y ?? 0) + (targetY - (driver.y ?? 0)) * ratio,
          color: driverColorByCode.get(driver.driverCode) || "#9ca3af",
          position: driver.position,
        };
      });
  }, [currentFrame, currentTime, driverColorByCode, nextFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0a0d13";
    ctx.fillRect(0, 0, width, height);

    if (!trackPoints.length) {
      ctx.fillStyle = "#7f8797";
      ctx.font = "600 16px Aptos, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Track path not available", width / 2, height / 2);
      renderedMarkersRef.current = [];
      return;
    }

    drawTrack(ctx, trackPoints, width, height, currentFrame?.trackStatus || "GREEN");
    drawDrivers(ctx, markers, trackPoints, width, height, selectedDrivers);
    renderedMarkersRef.current = markers;
  }, [currentFrame?.trackStatus, height, markers, selectedDrivers, trackPoints, width]);

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!onDriverClick || !renderedMarkersRef.current.length || !canvasMetrics) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let nearest: { abbr: string; distance: number } | null = null;
    for (const marker of renderedMarkersRef.current) {
      const sx = canvasMetrics.offsetX + (marker.x - canvasMetrics.minX) * canvasMetrics.scale;
      const sy = canvasMetrics.offsetY + (canvasMetrics.maxY - marker.y) * canvasMetrics.scale;
      const distance = Math.hypot(x - sx, y - sy);
      if (!nearest || distance < nearest.distance) {
        nearest = { abbr: marker.abbr, distance };
      }
    }

    if (nearest && nearest.distance < 20) {
      onDriverClick(nearest.abbr, event.shiftKey || event.metaKey || event.ctrlKey);
      return;
    }

    onDriverClick(null, false);
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleCanvasClick}
      className="replay-track-canvas"
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
