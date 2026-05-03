"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReplayDriver, ReplayFrame } from "@/lib/data";
import { buildTrackGeometry } from "./track-geometry";
import { drawDrivers, drawSafetyCar, drawTrack, type DriverMarker, type SafetyCarMarker } from "./track-renderer";

interface TrackCanvasProps {
  trackPath: [number, number][] | null;
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  nextFrame: ReplayFrame | null;
  selectedDrivers: string[];
  showDriverLabels?: boolean;
  showDrsZones?: boolean;
  projectMarkersToTrack?: boolean;
  estimatedLapDuration?: number;
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
  speed: number | null;
  drs: number | null;
}

const BASE_INTERPOLATION_MS = 340;
const LANE_SPACING = 3.2;

export function TrackCanvas({
  trackPath,
  drivers,
  currentFrame,
  nextFrame,
  selectedDrivers,
  showDriverLabels = false,
  showDrsZones = true,
  projectMarkersToTrack = false,
  estimatedLapDuration = 90,
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
  const showDriverLabelsRef = useRef(showDriverLabels);
  const showDrsZonesRef = useRef(showDrsZones);
  const safetyCarRef = useRef<SafetyCarMarker | null>(null);

  const driverColorByCode = useMemo(
    () => new Map(drivers.map((driver) => [driver.driverCode, driver.teamColor])),
    [drivers],
  );

  const geometry = useMemo(() => buildTrackGeometry(trackPath, width, height), [trackPath, width, height]);

  function buildProjectedTarget(driver: ReplayFrame["drivers"][string]) {
    if (!geometry || !projectMarkersToTrack || driver.x === null || driver.y === null) {
      return { x: driver.x ?? 0, y: driver.y ?? 0 };
    }

    const leader = currentFrame
      ? Object.values(currentFrame.drivers).slice().sort((left, right) => left.position - right.position)[0]
      : null;
    const leaderProjection = leader && leader.x !== null && leader.y !== null
      ? geometry.project({ x: leader.x, y: leader.y })
      : null;
    const ownProjection = geometry.project({ x: driver.x, y: driver.y });
    const lapOffset = Math.max(0, (driver.lap ?? currentFrame?.lap ?? 1) - 1) * geometry.totalLength;
    const intervalDistance = driver.interval !== null
      ? (driver.interval / Math.max(55, estimatedLapDuration)) * geometry.totalLength
      : (Math.max(0, driver.position - 1) * geometry.totalLength * 0.012);
    const baseDistance = leaderProjection && driver.position > 1
      ? lapOffset + leaderProjection.distance - intervalDistance
      : lapOffset + ownProjection.distance;
    const trackPoint = geometry.pointAtDistance(baseDistance);
    const laneOffset = ((driver.position % 5) - 2) * LANE_SPACING;

    return {
      x: trackPoint.x + trackPoint.nx * laneOffset,
      y: trackPoint.y + trackPoint.ny * laneOffset,
    };
  }

  useEffect(() => {
    trackStatusRef.current = currentFrame?.trackStatus || "GREEN";
    selectedDriversRef.current = selectedDrivers;
    showDriverLabelsRef.current = showDriverLabels;
    showDrsZonesRef.current = showDrsZones;
    const safetyCar = currentFrame?.safetyCar;
    safetyCarRef.current = safetyCar && safetyCar.x !== null && safetyCar.y !== null && safetyCar.phase !== "none"
      ? { x: safetyCar.x, y: safetyCar.y, phase: safetyCar.phase }
      : null;
  }, [currentFrame, nextFrame, selectedDrivers, showDriverLabels, showDrsZones]);

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
      const target = buildProjectedTarget(driver);
      const previousX = existing
        ? existing.previousX + (existing.targetX - existing.previousX) * Math.min((now - existing.startTime) / existing.duration, 1)
        : target.x;
      const previousY = existing
        ? existing.previousY + (existing.targetY - existing.previousY) * Math.min((now - existing.startTime) / existing.duration, 1)
        : target.y;

      positionTargetsRef.current.set(driver.driverCode, {
        previousX,
        previousY,
        targetX: target.x,
        targetY: target.y,
        startTime: now,
        duration: Math.max(BASE_INTERPOLATION_MS, frameDuration * 1.35),
        position: driver.position,
        color: driverColorByCode.get(driver.driverCode) || "#9ca3af",
        speed: driver.speed,
        drs: driver.drs,
      });
    }

    const activeDrivers = new Set(targetDrivers.map((driver) => driver.driverCode));
    for (const key of positionTargetsRef.current.keys()) {
      if (!activeDrivers.has(key)) {
        positionTargetsRef.current.delete(key);
      }
    }
  }, [currentFrame, driverColorByCode, geometry, nextFrame, projectMarkersToTrack, estimatedLapDuration]);

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

      if (!geometry) {
        ctx.fillStyle = "#7f8797";
        ctx.font = "600 16px Aptos, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Track path not available", width / 2, height / 2);
        renderedMarkersRef.current = [];
        animationFrameRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      drawTrack(ctx, geometry, trackStatusRef.current, showDrsZonesRef.current);

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
          speed: target.speed,
          drs: target.drs,
        });
      }

      interpolatedMarkers.sort((left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER));
      drawSafetyCar(ctx, geometry, safetyCarRef.current);
      drawDrivers(ctx, interpolatedMarkers, geometry, selectedDriversRef.current, showDriverLabelsRef.current);
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
  }, [geometry, height, width]);

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!onDriverClick || !renderedMarkersRef.current.length || !geometry) {
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
      const screen = geometry.toScreen(marker);
      const distance = Math.hypot(x - screen.x, y - screen.y);
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
