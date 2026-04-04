"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReplayDriver, ReplayFrame } from "@/lib/data";
import { drawDrivers, drawTrack, type DriverMarker, type TrackPoint } from "./track-renderer";

interface TrackCanvasProps {
  trackPath: [number, number][] | null;
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  selectedDrivers: string[];
  playbackSpeed?: number;
  width?: number;
  height?: number;
  onDriverClick?: (driverCode: string | null, append: boolean) => void;
}

interface InterpolatedPosition {
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  startTime: number;
  duration: number;
}

const BASE_INTERPOLATION_MS = 720;

export function TrackCanvas({
  trackPath,
  drivers,
  currentFrame,
  selectedDrivers,
  playbackSpeed = 1,
  width = 920,
  height = 610,
  onDriverClick,
}: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionsRef = useRef<Map<string, InterpolatedPosition>>(new Map());
  const markersRef = useRef<DriverMarker[]>([]);
  const renderedMarkersRef = useRef<DriverMarker[]>([]);

  const trackPoints = useMemo<TrackPoint[]>(() => (
    trackPath?.map(([x, y]) => ({ x, y })) ?? []
  ), [trackPath]);

  const driverColorByCode = useMemo(() => new Map(drivers.map((driver) => [driver.driverCode, driver.teamColor])), [drivers]);

  useEffect(() => {
    if (!currentFrame) {
      markersRef.current = [];
      return;
    }

    const now = performance.now();
    const duration = BASE_INTERPOLATION_MS / Math.max(playbackSpeed, 0.25);
    const markers = Object.values(currentFrame.drivers)
      .filter((driver) => driver.x !== null && driver.y !== null)
      .sort((left, right) => left.position - right.position)
      .map((driver) => ({
        abbr: driver.driverCode,
        x: driver.x ?? 0,
        y: driver.y ?? 0,
        color: driverColorByCode.get(driver.driverCode) || "#9ca3af",
        position: driver.position,
      }));

    markersRef.current = markers;

    for (const marker of markers) {
      const entry = positionsRef.current.get(marker.abbr);
      if (!entry) {
        positionsRef.current.set(marker.abbr, {
          prevX: marker.x,
          prevY: marker.y,
          targetX: marker.x,
          targetY: marker.y,
          startTime: now,
          duration,
        });
        continue;
      }

      const elapsed = now - entry.startTime;
      const ratio = Math.min(elapsed / entry.duration, 1);
      entry.prevX = entry.prevX + (entry.targetX - entry.prevX) * ratio;
      entry.prevY = entry.prevY + (entry.targetY - entry.prevY) * ratio;
      entry.targetX = marker.x;
      entry.targetY = marker.y;
      entry.startTime = now;
      entry.duration = duration;
    }
  }, [currentFrame, driverColorByCode, playbackSpeed]);

  useEffect(() => {
    let active = true;

    function render() {
      if (!active) {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        requestAnimationFrame(render);
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
        requestAnimationFrame(render);
        return;
      }

      drawTrack(ctx, trackPoints, width, height, currentFrame?.trackStatus || "GREEN");

      const now = performance.now();
      const interpolated = markersRef.current.map((marker) => {
        const entry = positionsRef.current.get(marker.abbr);
        if (!entry) {
          return marker;
        }

        const elapsed = now - entry.startTime;
        const ratio = Math.min(elapsed / entry.duration, 1);
        const x = entry.prevX + (entry.targetX - entry.prevX) * ratio;
        const y = entry.prevY + (entry.targetY - entry.prevY) * ratio;
        return { ...marker, x, y };
      });

      renderedMarkersRef.current = interpolated;
      drawDrivers(ctx, interpolated, trackPoints, width, height, selectedDrivers);

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
    return () => {
      active = false;
    };
  }, [currentFrame?.trackStatus, height, selectedDrivers, trackPoints, width]);

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!onDriverClick || !renderedMarkersRef.current.length) {
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

    for (const marker of renderedMarkersRef.current) {
      const sx = offsetX + (marker.x - minX) * scale;
      const sy = offsetY + (maxY - marker.y) * scale;
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
