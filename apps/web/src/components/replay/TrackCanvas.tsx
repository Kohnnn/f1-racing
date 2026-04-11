"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReplayDriver, ReplayFrame } from "@/lib/data";
import { drawDrivers, drawTrack, type DriverMarker, type TrackPoint } from "./track-renderer";

interface TrackCanvasProps {
  trackPath: [number, number][] | null;
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  nextFrame: ReplayFrame | null;
  selectedDrivers: string[];
  width?: number;
  height?: number;
  onDriverClick?: (driverCode: string | null, append: boolean) => void;
}

interface PositionTarget {
  previousX: number;
  previousY: number;
  targetX: number;
  targetY: number;
  startTime: number;
  duration: number;
  position: number | null;
  color: string;
}

const BASE_INTERPOLATION_MS = 340;

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
  nextFrame,
  selectedDrivers,
  width = 920,
  height = 610,
  onDriverClick,
}: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedMarkersRef = useRef<DriverMarker[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const positionTargetsRef = useRef<Map<string, PositionTarget>>(new Map());
  const trackStatusRef = useRef(currentFrame?.trackStatus || "GREEN");
  const selectedDriversRef = useRef(selectedDrivers);

  const trackPoints = useMemo<TrackPoint[]>(() => (
    trackPath?.map(([x, y]) => ({ x, y })) ?? []
  ), [trackPath]);

  const driverColorByCode = useMemo(
    () => new Map(drivers.map((driver) => [driver.driverCode, driver.teamColor])),
    [drivers],
  );

  const canvasMetrics = useMemo(() => buildCanvasMetrics(trackPoints, width, height), [trackPoints, width, height]);

  useEffect(() => {
    trackStatusRef.current = currentFrame?.trackStatus || "GREEN";
    selectedDriversRef.current = selectedDrivers;
  }, [currentFrame, nextFrame, selectedDrivers]);

  useEffect(() => {
    if (!currentFrame) {
      positionTargetsRef.current.clear();
      renderedMarkersRef.current = [];
      return;
    }

    const now = performance.now();
    const frameDuration = Math.max(120, ((nextFrame?.t ?? currentFrame.t) - currentFrame.t) * 1000);
    const targetDrivers = Object.values(currentFrame.drivers)
      .filter((driver) => driver.x !== null && driver.y !== null)
      .sort((left, right) => left.position - right.position);

    for (const driver of targetDrivers) {
      const existing = positionTargetsRef.current.get(driver.driverCode);
      const previousX = existing
        ? existing.previousX + (existing.targetX - existing.previousX) * Math.min((now - existing.startTime) / existing.duration, 1)
        : (driver.x ?? 0);
      const previousY = existing
        ? existing.previousY + (existing.targetY - existing.previousY) * Math.min((now - existing.startTime) / existing.duration, 1)
        : (driver.y ?? 0);

      positionTargetsRef.current.set(driver.driverCode, {
        previousX,
        previousY,
        targetX: driver.x ?? 0,
        targetY: driver.y ?? 0,
        startTime: now,
        duration: Math.max(BASE_INTERPOLATION_MS, frameDuration * 1.35),
        position: driver.position,
        color: driverColorByCode.get(driver.driverCode) || "#9ca3af",
      });
    }

    const activeDrivers = new Set(targetDrivers.map((driver) => driver.driverCode));
    for (const key of positionTargetsRef.current.keys()) {
      if (!activeDrivers.has(key)) {
        positionTargetsRef.current.delete(key);
      }
    }
  }, [currentFrame, driverColorByCode, nextFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const drawFrame = () => {
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
        animationFrameRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      drawTrack(ctx, trackPoints, width, height, trackStatusRef.current);

      const now = performance.now();
      const interpolatedMarkers: DriverMarker[] = [];

      for (const [abbr, target] of positionTargetsRef.current.entries()) {
        const progress = Math.min((now - target.startTime) / target.duration, 1);
        interpolatedMarkers.push({
          abbr,
          x: target.previousX + (target.targetX - target.previousX) * progress,
          y: target.previousY + (target.targetY - target.previousY) * progress,
          color: target.color,
          position: target.position,
        });
      }

      interpolatedMarkers.sort((left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER));
      drawDrivers(ctx, interpolatedMarkers, trackPoints, width, height, selectedDriversRef.current);
      renderedMarkersRef.current = interpolatedMarkers;
      animationFrameRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [height, trackPoints, width]);

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
