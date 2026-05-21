"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReplayDriver, ReplayFrame } from "@/lib/data";
import { buildTrackGeometry, type TrackGeometry } from "./track-geometry";
import {
  drawCorners,
  drawDrivers,
  drawDrsZones,
  drawMarshalSectors,
  drawPitPulses,
  drawSafetyCar,
  drawTrack,
  type CornerMarker,
  type DriverMarker,
  type DrsZoneMarker,
  type MarshalSectorMarker,
  type SafetyCarMarker,
} from "./track-renderer";

export interface PitPulse {
  /** stable identifier so we can dedupe re-emitted pulses */
  id: string;
  /** along-track normalised ratio (0..1) */
  ratio: number;
  /** absolute time (replay clock seconds) when the pulse fires */
  startedAt: number;
  /** team color for the pulse stroke */
  color?: string;
  /** optional small label rendered above the pulse */
  label?: string;
}

interface TrackCanvasProps {
  trackPath: [number, number][] | null;
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  nextFrame: ReplayFrame | null;
  selectedDrivers: string[];
  showDriverLabels?: boolean;
  showDrsZones?: boolean;
  /** Show corner number labels (drawn from trackMetadata when available). */
  showCorners?: boolean;
  /** Show marshal-sector flag overlays. */
  showMarshalSectors?: boolean;
  corners?: CornerMarker[];
  drsZones?: DrsZoneMarker[];
  marshalSectors?: MarshalSectorMarker[];
  /** Sector index → flag string. Indexed sectors will tint when present. */
  activeMarshalFlagBySector?: Map<number, string>;
  pitPulses?: PitPulse[];
  /** Optional clock used to age pit-pulses (typically the replay clock seconds). */
  clockSeconds?: number;
  trackTotalLength?: number;
  projectMarkersToTrack?: boolean;
  estimatedLapDuration?: number;
  width?: number;
  height?: number;
  onDriverClick?: (driverCode: string | null, append: boolean) => void;
}

interface DriverTarget {
  /** target along-track distance (cumulative, including lap offset) */
  targetDistance: number;
  /** smoothed displayed distance, advanced via easing */
  displayDistance: number;
  /** stable lateral offset assigned per driver to keep cars in their lane */
  laneOffset: number;
  position: number | null;
  color: string;
  speed: number | null;
  drs: number | null;
  lap: number | null;
}

const LANE_SPACING = 2.4;
// How fast the displayed distance catches up to the target distance.
// 0.18 means ~18% of the gap is closed each animation frame.
const SMOOTHING_FACTOR = 0.18;

export function TrackCanvas({
  trackPath,
  drivers,
  currentFrame,
  nextFrame,
  selectedDrivers,
  showDriverLabels = false,
  showDrsZones = true,
  showCorners = true,
  showMarshalSectors = true,
  corners,
  drsZones,
  marshalSectors,
  activeMarshalFlagBySector,
  pitPulses,
  clockSeconds,
  trackTotalLength,
  projectMarkersToTrack = false,
  estimatedLapDuration = 90,
  width = 920,
  height = 610,
  onDriverClick,
}: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Auto-fit the canvas size to the actual rendered DOM size so wide ovals
  // (Melbourne) and tall layouts (Monaco) both fit without aspect-ratio
  // distortion. We start with the static fallback then update on layout.
  const [renderSize, setRenderSize] = useState<{ width: number; height: number }>({ width, height });
  const animationFrameRef = useRef<number | null>(null);
  const driverTargetsRef = useRef<Map<string, DriverTarget>>(new Map());
  const laneAssignmentsRef = useRef<Map<string, number>>(new Map());
  const lastSnappedFrameRef = useRef<ReplayFrame | null>(null);
  const trackStatusRef = useRef(currentFrame?.trackStatus || "GREEN");
  const selectedDriversRef = useRef(selectedDrivers);
  const showDriverLabelsRef = useRef(showDriverLabels);
  const showDrsZonesRef = useRef(showDrsZones);
  const showCornersRef = useRef(showCorners);
  const showMarshalSectorsRef = useRef(showMarshalSectors);
  const cornersRef = useRef<CornerMarker[]>(corners ?? []);
  const drsZonesRef = useRef<DrsZoneMarker[]>(drsZones ?? []);
  const marshalSectorsRef = useRef<MarshalSectorMarker[]>(marshalSectors ?? []);
  const activeMarshalFlagsRef = useRef<Map<number, string>>(activeMarshalFlagBySector ?? new Map());
  const pitPulsesRef = useRef<PitPulse[]>(pitPulses ?? []);
  const clockSecondsRef = useRef<number>(clockSeconds ?? 0);
  const trackTotalLengthRef = useRef<number>(trackTotalLength ?? 0);
  const safetyCarRef = useRef<SafetyCarMarker | null>(null);
  const renderedMarkersRef = useRef<DriverMarker[]>([]);

  const driverColorByCode = useMemo(
    () => new Map(drivers.map((driver) => [driver.driverCode, driver.teamColor])),
    [drivers],
  );

  const geometry = useMemo(
    () => buildTrackGeometry(trackPath, renderSize.width, renderSize.height),
    [trackPath, renderSize.width, renderSize.height],
  );

  // Watch the container for resize so the geometry rebuilds with the actual
  // aspect ratio of the box on screen (B3 Melbourne distortion fix).
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        const nextWidth = Math.max(320, Math.round(cr.width));
        const nextHeight = Math.max(240, Math.round(cr.height));
        setRenderSize((previous) =>
          previous.width === nextWidth && previous.height === nextHeight
            ? previous
            : { width: nextWidth, height: nextHeight },
        );
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Stable per-driver lane offset, hashed from driver code so it does not change as positions swap.
  function laneOffsetForDriver(driverCode: string) {
    const cached = laneAssignmentsRef.current.get(driverCode);
    if (cached !== undefined) return cached;
    let hash = 0;
    for (let i = 0; i < driverCode.length; i += 1) {
      hash = (hash * 31 + driverCode.charCodeAt(i)) | 0;
    }
    const lane = ((Math.abs(hash) % 5) - 2) * LANE_SPACING * 0.4;
    laneAssignmentsRef.current.set(driverCode, lane);
    return lane;
  }

  function computeTargetDistance(
    driver: ReplayFrame["drivers"][string],
    frame: ReplayFrame,
    geom: TrackGeometry,
  ): number {
    const lapOffset = Math.max(0, (driver.lap ?? frame.lap ?? 1) - 1) * geom.totalLength;

    if (!projectMarkersToTrack || driver.x === null || driver.y === null) {
      if (driver.x !== null && driver.y !== null) {
        return lapOffset + geom.project({ x: driver.x, y: driver.y }).distance;
      }
      // No coordinates at all: fall back to interval-derived position relative to the leader.
      return computeIntervalDistance(driver, frame, geom, lapOffset);
    }

    // For non-leaders, prefer the leader's projected distance minus the gap so all cars stay
    // anchored to the actual leader position rather than drifting on noisy raw coordinates.
    if (driver.position > 1) {
      return computeIntervalDistance(driver, frame, geom, lapOffset);
    }
    return lapOffset + geom.project({ x: driver.x, y: driver.y }).distance;
  }

  function computeIntervalDistance(
    driver: ReplayFrame["drivers"][string],
    frame: ReplayFrame,
    geom: TrackGeometry,
    lapOffset: number,
  ): number {
    const leader = Object.values(frame.drivers)
      .filter((candidate) => candidate.x !== null && candidate.y !== null)
      .sort((left, right) => left.position - right.position)[0];

    let leaderDistance = 0;
    if (leader && leader.x !== null && leader.y !== null) {
      leaderDistance = geom.project({ x: leader.x, y: leader.y }).distance;
    }

    const intervalSeconds = driver.interval !== null
      ? driver.interval
      : Math.max(0, driver.position - 1) * 0.55;
    const lapDuration = Math.max(55, estimatedLapDuration);
    const intervalDistance = (intervalSeconds / lapDuration) * geom.totalLength;

    return lapOffset + leaderDistance - intervalDistance;
  }

  // Snap targets to new frame data whenever the active frame changes.
  useEffect(() => {
    trackStatusRef.current = currentFrame?.trackStatus || "GREEN";
    selectedDriversRef.current = selectedDrivers;
    showDriverLabelsRef.current = showDriverLabels;
    showDrsZonesRef.current = showDrsZones;
    showCornersRef.current = showCorners;
    showMarshalSectorsRef.current = showMarshalSectors;
    cornersRef.current = corners ?? [];
    drsZonesRef.current = drsZones ?? [];
    marshalSectorsRef.current = marshalSectors ?? [];
    activeMarshalFlagsRef.current = activeMarshalFlagBySector ?? new Map();
    pitPulsesRef.current = pitPulses ?? [];
    clockSecondsRef.current = clockSeconds ?? 0;
    trackTotalLengthRef.current = trackTotalLength ?? 0;

    const safetyCar = currentFrame?.safetyCar;
    safetyCarRef.current = safetyCar && safetyCar.x !== null && safetyCar.y !== null && safetyCar.phase !== "none"
      ? { x: safetyCar.x, y: safetyCar.y, phase: safetyCar.phase }
      : null;

    if (!currentFrame || !geometry) {
      driverTargetsRef.current.clear();
      lastSnappedFrameRef.current = null;
      return;
    }

    if (lastSnappedFrameRef.current === currentFrame) {
      // Same frame instance, just update reactive flags.
      return;
    }
    lastSnappedFrameRef.current = currentFrame;

    const seen = new Set<string>();
    for (const driver of Object.values(currentFrame.drivers)) {
      if (!driver) continue;
      seen.add(driver.driverCode);
      const targetDistance = computeTargetDistance(driver, currentFrame, geometry);
      const lane = laneOffsetForDriver(driver.driverCode);
      const existing = driverTargetsRef.current.get(driver.driverCode);

      if (!existing) {
        // First sighting: snap displayDistance directly so we don't get a startup sweep.
        driverTargetsRef.current.set(driver.driverCode, {
          targetDistance,
          displayDistance: targetDistance,
          laneOffset: lane,
          position: driver.position,
          color: driverColorByCode.get(driver.driverCode) || "#9ca3af",
          speed: driver.speed,
          drs: driver.drs,
          lap: driver.lap,
        });
        continue;
      }

      // Detect a lap rollover: if the new target is very far behind the displayed value,
      // assume the driver crossed the start/finish line and unwrap by adding a lap.
      let nextTarget = targetDistance;
      const wrapDelta = nextTarget - existing.displayDistance;
      if (wrapDelta < -geometry.totalLength * 0.4) {
        nextTarget += geometry.totalLength;
      }

      driverTargetsRef.current.set(driver.driverCode, {
        ...existing,
        targetDistance: nextTarget,
        laneOffset: lane,
        position: driver.position,
        color: driverColorByCode.get(driver.driverCode) || existing.color,
        speed: driver.speed,
        drs: driver.drs,
        lap: driver.lap,
      });
    }

    // Drop drivers no longer present in this frame.
    for (const code of Array.from(driverTargetsRef.current.keys())) {
      if (!seen.has(code)) {
        driverTargetsRef.current.delete(code);
      }
    }
  }, [currentFrame, nextFrame, selectedDrivers, showDriverLabels, showDrsZones, showCorners, showMarshalSectors, corners, drsZones, marshalSectors, activeMarshalFlagBySector, pitPulses, clockSeconds, trackTotalLength, geometry, driverColorByCode, projectMarkersToTrack, estimatedLapDuration]);

  // Continuous render loop. Display distance eases toward target distance every frame, and
  // marker positions are read off the dense polyline so cars never cut across corners.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawFrame = () => {
      const dpr = window.devicePixelRatio || 1;
      const targetWidth = Math.round(renderSize.width * dpr);
      const targetHeight = Math.round(renderSize.height * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, renderSize.width, renderSize.height);
      ctx.fillStyle = "#0a0d13";
      ctx.fillRect(0, 0, renderSize.width, renderSize.height);

      if (!geometry) {
        ctx.fillStyle = "#7f8797";
        ctx.font = "600 16px Aptos, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Track path not available", renderSize.width / 2, renderSize.height / 2);
        renderedMarkersRef.current = [];
        animationFrameRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      drawTrack(
        ctx,
        geometry,
        trackStatusRef.current,
        showDrsZonesRef.current,
        drsZonesRef.current,
        trackTotalLengthRef.current || geometry.totalLength,
      );

      if (showCornersRef.current && cornersRef.current.length) {
        drawCorners(ctx, geometry, cornersRef.current, trackTotalLengthRef.current || geometry.totalLength);
      }

      if (showMarshalSectorsRef.current) {
        drawMarshalSectors(
          ctx,
          geometry,
          marshalSectorsRef.current,
          trackTotalLengthRef.current || geometry.totalLength,
          activeMarshalFlagsRef.current,
        );
      }

      // Draw decaying pit-out pulses if any are still alive.
      if (pitPulsesRef.current.length) {
        const nowSeconds = clockSecondsRef.current;
        const ageMillis = pitPulsesRef.current.map((pulse) => ({
          ratio: pulse.ratio,
          color: pulse.color,
          label: pulse.label,
          ageMs: Math.max(0, (nowSeconds - pulse.startedAt) * 1000),
        }));
        drawPitPulses(ctx, geometry, ageMillis);
      }

      const interpolated: DriverMarker[] = [];
      for (const [abbr, target] of driverTargetsRef.current.entries()) {
        // Ease the displayed distance toward the target distance.
        const delta = target.targetDistance - target.displayDistance;
        const next = target.displayDistance + delta * SMOOTHING_FACTOR;
        target.displayDistance = next;

        // Resolve the screen position by reading the dense track polyline at the
        // displayed distance, then offsetting laterally by the per-driver lane.
        const trackPoint = geometry.pointAtDistance(next);
        interpolated.push({
          abbr,
          x: trackPoint.x + trackPoint.nx * target.laneOffset,
          y: trackPoint.y + trackPoint.ny * target.laneOffset,
          color: target.color,
          position: target.position,
          speed: target.speed,
          drs: target.drs,
        });
      }

      interpolated.sort(
        (left, right) =>
          (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER),
      );

      drawSafetyCar(ctx, geometry, safetyCarRef.current);
      drawDrivers(ctx, interpolated, geometry, selectedDriversRef.current, showDriverLabelsRef.current);
      renderedMarkersRef.current = interpolated;
      animationFrameRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [geometry, renderSize.height, renderSize.width]);

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!onDriverClick || !renderedMarkersRef.current.length || !geometry) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

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

    if (nearest && nearest.distance < 22) {
      onDriverClick(nearest.abbr, event.shiftKey || event.metaKey || event.ctrlKey);
      return;
    }

    onDriverClick(null, false);
  }

  return (
    <div
      ref={containerRef}
      className="replay-track-canvas-stage"
      style={{ position: "relative", width: "100%", height: "100%", minHeight: 360 }}
    >
      <canvas
        ref={canvasRef}
        width={renderSize.width}
        height={renderSize.height}
        onClick={handleCanvasClick}
        className="replay-track-canvas"
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
