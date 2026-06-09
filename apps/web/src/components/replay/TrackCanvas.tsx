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
  drawTelemetryHeatmap,
  type CornerMarker,
  type DriverMarker,
  type DrsZoneMarker,
  type MarshalSectorMarker,
  type SafetyCarMarker,
} from "./track-renderer";

export interface PitPulse {
  id: string;
  ratio: number;
  startedAt: number;
  color?: string;
  label?: string;
}

export interface DriverHoverFields {
  position?: boolean;
  team?: boolean;
  gap?: boolean;
  lastLap?: boolean;
  bestLap?: boolean;
  tyre?: boolean;
  speed?: boolean;
  drs?: boolean;
  sector?: boolean;
}

export interface DriverHoverMeta {
  team?: string;
  tyreCompound?: string | null;
  tyreAge?: number | null;
  lastLapMs?: number | null;
  bestLapMs?: number | null;
  gap?: string | null;
  interval?: string | null;
}

interface TrackCanvasProps {
  trackPath: [number, number][] | null;
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  nextFrame: ReplayFrame | null;
  selectedDrivers: string[];
  showDriverLabels?: boolean;
  showDrsZones?: boolean;
  showCorners?: boolean;
  showMarshalSectors?: boolean;
  corners?: CornerMarker[];
  drsZones?: DrsZoneMarker[];
  marshalSectors?: MarshalSectorMarker[];
  activeMarshalFlagBySector?: Map<number, string>;
  pitPulses?: PitPulse[];
  clockSeconds?: number;
  /** Live wall-clock playhead time in seconds, refreshes every animation frame. */
  playheadTimeRef?: { current: number };
  trackTotalLength?: number;
  projectMarkersToTrack?: boolean;
  estimatedLapDuration?: number;
  width?: number;
  height?: number;
  /** Optional extended hover metadata, keyed by driver code. */
  hoverMetaByCode?: Map<string, DriverHoverMeta>;
  hoverFields?: DriverHoverFields;
  /** Racing-line telemetry heatmap: channel + per-sample (x,y,value 0..1). */
  heatmapChannel?: "off" | "speed" | "throttle" | "brake";
  heatmapSamples?: Array<{ x: number; y: number; value: number }>;
  onDriverClick?: (driverCode: string | null, append: boolean) => void;
}

interface DriverTarget {
  /** distance at currentFrame.t */
  distA: number;
  /** distance at nextFrame.t (or distA when nextFrame missing) */
  distB: number;
  /** smoothed displayed distance */
  displayDistance: number;
  laneOffset: number;
  position: number | null;
  color: string;
  speed: number | null;
  drs: number | null;
  lap: number | null;
  /** team color for label tint */
  team?: string;
}

const LANE_SPACING = 2.4;
const RESIDUAL_EASE = 0.35;
const MIN_SCALE = 0.6;
const MAX_SCALE = 5;
const ROT_LIMIT = (Math.PI / 180) * 80;

function ease(t: number) {
  // smoothstep
  return t * t * (3 - 2 * t);
}

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
  playheadTimeRef,
  trackTotalLength,
  projectMarkersToTrack = false,
  estimatedLapDuration = 90,
  width = 920,
  height = 610,
  hoverMetaByCode,
  hoverFields,
  heatmapChannel = "off",
  heatmapSamples,
  onDriverClick,
}: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [renderSize, setRenderSize] = useState<{ width: number; height: number }>({ width, height });
  const animationFrameRef = useRef<number | null>(null);
  const driverTargetsRef = useRef<Map<string, DriverTarget>>(new Map());
  const laneAssignmentsRef = useRef<Map<string, number>>(new Map());
  const lastSnappedSignatureRef = useRef<string | null>(null);
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
  const currentFrameRef = useRef<ReplayFrame | null>(currentFrame);
  const nextFrameRef = useRef<ReplayFrame | null>(nextFrame);
  const heatmapChannelRef = useRef(heatmapChannel);
  const heatmapRatioSamplesRef = useRef<Array<{ ratio: number; value: number }>>([]);

  // User transform state (drag pan, ctrl-wheel zoom, shift-drag rotate).
  const transformRef = useRef<{ tx: number; ty: number; scale: number; rot: number }>({ tx: 0, ty: 0, scale: 1, rot: 0 });
  const interactionRef = useRef<{
    pointerId: number | null;
    mode: "idle" | "pan" | "rotate";
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    startRot: number;
  }>({ pointerId: null, mode: "idle", startX: 0, startY: 0, startTx: 0, startTy: 0, startRot: 0 });
  const [hover, setHover] = useState<{
    abbr: string;
    px: number;
    py: number;
  } | null>(null);
  const hoverRefState = useRef<{ x: number; y: number } | null>(null);

  const driverColorByCode = useMemo(
    () => new Map(drivers.map((driver) => [driver.driverCode, driver.teamColor])),
    [drivers],
  );
  const driverTeamByCode = useMemo(
    () => new Map(drivers.map((driver) => [driver.driverCode, driver.team])),
    [drivers],
  );

  const geometry = useMemo(
    () => buildTrackGeometry(trackPath, renderSize.width, renderSize.height),
    [trackPath, renderSize.width, renderSize.height],
  );

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

    // Place every car with valid coordinates by projecting its position onto
    // the track. Previously only the leader used real coordinates and all
    // other cars (position > 1) were placed via a constant-speed interval
    // estimate, which drifted them off the real position (badly in corners).
    // The interval estimator now only serves as a fallback when coordinates
    // are missing entirely.
    if (driver.x !== null && driver.y !== null) {
      return lapOffset + geom.project({ x: driver.x, y: driver.y }).distance;
    }
    return computeIntervalDistance(driver, frame, geom, lapOffset);
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

  // Project the racing-line heatmap samples (x,y,value) onto track ratios once
  // per data change, so the render loop only does cheap segment colouring.
  useEffect(() => {
    heatmapChannelRef.current = heatmapChannel;
    if (!geometry || heatmapChannel === "off" || !heatmapSamples?.length) {
      heatmapRatioSamplesRef.current = [];
      return;
    }
    const total = geometry.totalLength || 1;
    heatmapRatioSamplesRef.current = heatmapSamples.map((s) => ({
      ratio: Math.max(0, Math.min(1, geometry.project({ x: s.x, y: s.y }).distance / total)),
      value: s.value,
    }));
  }, [geometry, heatmapChannel, heatmapSamples]);

  // Snap distA/distB whenever currentFrame or nextFrame changes.
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
    currentFrameRef.current = currentFrame;
    nextFrameRef.current = nextFrame;

    const safetyCar = currentFrame?.safetyCar;
    safetyCarRef.current = safetyCar && safetyCar.x !== null && safetyCar.y !== null && safetyCar.phase !== "none"
      ? { x: safetyCar.x, y: safetyCar.y, phase: safetyCar.phase }
      : null;

    if (!currentFrame || !geometry) {
      driverTargetsRef.current.clear();
      lastSnappedSignatureRef.current = null;
      return;
    }

    // Resnap whenever (a) the current frame timestamp changes, OR (b) the
    // driver count changes (e.g. a frame chunk arrived late and added cars
    // we hadn't yet picked up). Reference equality on the frame object is
    // unreliable here because ReplayView re-spreads it on every render.
    const driverCount = Object.keys(currentFrame.drivers).length;
    const signature = `${currentFrame.t}|${driverCount}|${nextFrame ? nextFrame.t : "_"}`;
    if (lastSnappedSignatureRef.current === signature) {
      return;
    }
    lastSnappedSignatureRef.current = signature;

    const seen = new Set<string>();
    for (const driver of Object.values(currentFrame.drivers)) {
      if (!driver) continue;
      seen.add(driver.driverCode);
      const distA = computeTargetDistance(driver, currentFrame, geometry);
      let distB = distA;
      if (nextFrame) {
        const nextDriver = nextFrame.drivers[driver.driverCode];
        if (nextDriver) {
          let candidateB = computeTargetDistance(nextDriver, nextFrame, geometry);
          // Lap rollover: if next is far behind current, unwrap forward.
          if (candidateB - distA < -geometry.totalLength * 0.4) {
            candidateB += geometry.totalLength;
          }
          // Reverse desync: the timing lap counter (lapOffset) and the
          // projected within-lap distance can tick at slightly different
          // times across the start/finish line, which can push candidateB a
          // whole lap *ahead* of distA. Pull it back so a single inter-frame
          // step never spans most of a lap.
          if (candidateB - distA > geometry.totalLength * 0.6) {
            candidateB -= geometry.totalLength;
          }
          distB = candidateB;
        }
      }
      const lane = laneOffsetForDriver(driver.driverCode);
      const existing = driverTargetsRef.current.get(driver.driverCode);

      if (!existing) {
        driverTargetsRef.current.set(driver.driverCode, {
          distA,
          distB,
          displayDistance: distA,
          laneOffset: lane,
          position: driver.position,
          color: driverColorByCode.get(driver.driverCode) || "#9ca3af",
          team: driverTeamByCode.get(driver.driverCode),
          speed: driver.speed,
          drs: driver.drs,
          lap: driver.lap,
        });
        continue;
      }

      // Lap rollover handling for displayed distance.
      let nextDisplay = existing.displayDistance;
      if (distA - nextDisplay < -geometry.totalLength * 0.4) {
        nextDisplay -= geometry.totalLength;
      }
      // Positive desync guard: if the new target sits a whole lap ahead of the
      // currently displayed distance (lapOffset ticked while the projected
      // distance is still near zero), realign the display by a lap so the
      // residual smoother doesn't fast-forward the marker across the circuit.
      if (distA - nextDisplay > geometry.totalLength * 0.6) {
        nextDisplay += geometry.totalLength;
      }

      driverTargetsRef.current.set(driver.driverCode, {
        ...existing,
        distA,
        distB,
        displayDistance: nextDisplay,
        laneOffset: lane,
        position: driver.position,
        color: driverColorByCode.get(driver.driverCode) || existing.color,
        team: driverTeamByCode.get(driver.driverCode) ?? existing.team,
        speed: driver.speed,
        drs: driver.drs,
        lap: driver.lap,
      });
    }

    for (const code of Array.from(driverTargetsRef.current.keys())) {
      if (!seen.has(code)) {
        driverTargetsRef.current.delete(code);
      }
    }
  }, [currentFrame, nextFrame, selectedDrivers, showDriverLabels, showDrsZones, showCorners, showMarshalSectors, corners, drsZones, marshalSectors, activeMarshalFlagBySector, pitPulses, clockSeconds, trackTotalLength, geometry, driverColorByCode, driverTeamByCode, projectMarkersToTrack, estimatedLapDuration]);

  // Continuous render loop.
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

      // Apply DPR scaling, then user transform around centre of viewport.
      const t = transformRef.current;
      const cx = renderSize.width * 0.5;
      const cy = renderSize.height * 0.5;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, renderSize.width, renderSize.height);
      ctx.fillStyle = "#0a0d13";
      ctx.fillRect(0, 0, renderSize.width, renderSize.height);
      // Compose: translate to centre + user pan, rotate, scale, translate back.
      ctx.save();
      ctx.translate(cx + t.tx, cy + t.ty);
      ctx.rotate(t.rot);
      ctx.scale(t.scale, t.scale);
      ctx.translate(-cx, -cy);

      if (!geometry) {
        ctx.restore();
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

      if (heatmapChannelRef.current !== "off" && heatmapRatioSamplesRef.current.length) {
        drawTelemetryHeatmap(
          ctx,
          geometry,
          heatmapRatioSamplesRef.current,
          heatmapChannelRef.current as "speed" | "throttle" | "brake",
        );
      }

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

      // Compute interpolation parameter localT = (now - tA) / (tB - tA).
      const cur = currentFrameRef.current;
      const nxt = nextFrameRef.current;
      const playhead = playheadTimeRef?.current ?? clockSecondsRef.current;
      let localT = 0;
      if (cur && nxt && nxt.t > cur.t) {
        localT = Math.min(1, Math.max(0, (playhead - cur.t) / (nxt.t - cur.t)));
      }
      const eased = ease(localT);

      const interpolated: DriverMarker[] = [];
      for (const [abbr, target] of driverTargetsRef.current.entries()) {
        // Linear interp distA -> distB by eased localT.
        const interpolatedDistance = target.distA + (target.distB - target.distA) * eased;
        // Apply a tiny residual smoother so micro-jitter is eaten without losing
        // sample-step responsiveness.
        let delta = interpolatedDistance - target.displayDistance;
        // Safety clamp: even if a lap-counter / projection desync slips past
        // the unwrap guards, never let a single frame advance the marker more
        // than a quarter lap. A genuine large gap then resolves smoothly over
        // a few frames instead of teleporting across the circuit.
        const maxStep = geometry.totalLength * 0.25;
        if (delta > maxStep) delta = maxStep;
        else if (delta < -maxStep) delta = -maxStep;
        target.displayDistance = target.displayDistance + delta * RESIDUAL_EASE;

        const trackPoint = geometry.pointAtDistance(target.displayDistance);
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
      ctx.restore();

      // Hover tooltip placement.
      const hoverPoint = hoverRefState.current;
      if (hoverPoint && interpolated.length) {
        const hovered = pickNearestDriver(hoverPoint.x, hoverPoint.y, geometry, t, cx, cy);
        if (hovered) {
          setHover((prev) => {
            if (prev && prev.abbr === hovered.abbr && Math.abs(prev.px - hovered.screenX) < 1 && Math.abs(prev.py - hovered.screenY) < 1) {
              return prev;
            }
            return { abbr: hovered.abbr, px: hovered.screenX, py: hovered.screenY };
          });
        } else {
          setHover(null);
        }
      }

      animationFrameRef.current = requestAnimationFrame(drawFrame);
    };

    function pickNearestDriver(px: number, py: number, geom: TrackGeometry, transform: { tx: number; ty: number; scale: number; rot: number }, ccx: number, ccy: number) {
      let best: { abbr: string; distance: number; screenX: number; screenY: number } | null = null;
      for (const marker of renderedMarkersRef.current) {
        const screen = geom.toScreen(marker);
        // Apply the same composite transform as the canvas.
        const dx = screen.x - ccx;
        const dy = screen.y - ccy;
        const cos = Math.cos(transform.rot);
        const sin = Math.sin(transform.rot);
        const rx = (dx * cos - dy * sin) * transform.scale;
        const ry = (dx * sin + dy * cos) * transform.scale;
        const sx = ccx + transform.tx + rx;
        const sy = ccy + transform.ty + ry;
        const d = Math.hypot(px - sx, py - sy);
        if (!best || d < best.distance) {
          best = { abbr: marker.abbr, distance: d, screenX: sx, screenY: sy };
        }
      }
      if (best && best.distance < 22) return best;
      return null;
    }

    drawFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [geometry, renderSize.height, renderSize.width, playheadTimeRef]);

  // Pointer + wheel handlers for pan / zoom / rotate.
  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.button !== 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // Right-mouse drag rotates. Left + Alt also rotates for trackpad users.
    // Shift+drag stays as pan (shift is now reserved for wheel-zoom).
    const mode = (event.button === 2 || event.altKey) ? "rotate" : "pan";
    interactionRef.current = {
      pointerId: event.pointerId,
      mode,
      startX: x,
      startY: y,
      startTx: transformRef.current.tx,
      startTy: transformRef.current.ty,
      startRot: transformRef.current.rot,
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    hoverRefState.current = { x, y };
    const interaction = interactionRef.current;
    if (interaction.mode === "pan" && interaction.pointerId === event.pointerId) {
      transformRef.current.tx = interaction.startTx + (x - interaction.startX);
      transformRef.current.ty = interaction.startTy + (y - interaction.startY);
    } else if (interaction.mode === "rotate" && interaction.pointerId === event.pointerId) {
      const cx = rect.width * 0.5;
      const cy = rect.height * 0.5;
      const startAngle = Math.atan2(interaction.startY - cy, interaction.startX - cx);
      const currentAngle = Math.atan2(y - cy, x - cx);
      let nextRot = interaction.startRot + (currentAngle - startAngle);
      if (nextRot > ROT_LIMIT) nextRot = ROT_LIMIT;
      if (nextRot < -ROT_LIMIT) nextRot = -ROT_LIMIT;
      transformRef.current.rot = nextRot;
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const interaction = interactionRef.current;
    const canvas = canvasRef.current;
    if (canvas && interaction.pointerId === event.pointerId) {
      try { canvas.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    }
    interactionRef.current = { pointerId: null, mode: "idle", startX: 0, startY: 0, startTx: 0, startTy: 0, startRot: 0 };
  }

  function handlePointerLeave() {
    hoverRefState.current = null;
    setHover(null);
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    // Shift+wheel zooms; plain wheel scrolls the page; Ctrl+wheel is
    // intentionally ignored so the browser tab zoom keeps working.
    if (!event.shiftKey) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const cx = rect.width * 0.5;
    const cy = rect.height * 0.5;
    const t = transformRef.current;
    const scaleDelta = Math.pow(1.0015, -event.deltaY);
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * scaleDelta));
    const ratio = nextScale / t.scale;
    // Zoom toward cursor: anchor cursor relative to centre + tx/ty.
    const ax = cursorX - (cx + t.tx);
    const ay = cursorY - (cy + t.ty);
    t.tx -= ax * (ratio - 1);
    t.ty -= ay * (ratio - 1);
    t.scale = nextScale;
  }

  function resetTransform() {
    transformRef.current = { tx: 0, ty: 0, scale: 1, rot: 0 };
  }

  function handleDoubleClick() {
    resetTransform();
  }

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!onDriverClick || !renderedMarkersRef.current.length || !geometry) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const cx = rect.width * 0.5;
    const cy = rect.height * 0.5;
    const t = transformRef.current;
    const cos = Math.cos(t.rot);
    const sin = Math.sin(t.rot);

    let nearest: { abbr: string; distance: number } | null = null;
    for (const marker of renderedMarkersRef.current) {
      const screen = geometry.toScreen(marker);
      const dx = screen.x - cx;
      const dy = screen.y - cy;
      const rx = (dx * cos - dy * sin) * t.scale;
      const ry = (dx * sin + dy * cos) * t.scale;
      const sx = cx + t.tx + rx;
      const sy = cy + t.ty + ry;
      const distance = Math.hypot(x - sx, y - sy);
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

  // Compute hover meta for tooltip.
  const hoverMeta = hover ? hoverMetaByCode?.get(hover.abbr) ?? null : null;
  const hoverTarget = hover ? driverTargetsRef.current.get(hover.abbr) ?? null : null;
  const fields = hoverFields ?? { position: true, team: true, gap: true, lastLap: true, tyre: true, speed: true, drs: true };

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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        className="replay-track-canvas"
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
      />
      {hover && hoverTarget ? (
        <div
          className="replay-track-canvas__tooltip"
          style={{
            left: Math.min(renderSize.width - 220, Math.max(8, hover.px + 14)),
            top: Math.max(8, hover.py - 14),
          }}
        >
          <div className="replay-track-canvas__tooltip-head">
            <span className="replay-track-canvas__tooltip-stripe" style={{ background: hoverTarget.color }} />
            <strong>{hover.abbr}</strong>
            {fields.position && hoverTarget.position ? <span className="replay-track-canvas__tooltip-pos">P{hoverTarget.position}</span> : null}
          </div>
          {fields.team && (hoverMeta?.team || hoverTarget.team) ? (
            <p className="replay-track-canvas__tooltip-line"><span>Team</span><strong>{hoverMeta?.team ?? hoverTarget.team}</strong></p>
          ) : null}
          {fields.gap && hoverMeta?.gap ? (
            <p className="replay-track-canvas__tooltip-line"><span>Gap</span><strong>{hoverMeta.gap}</strong></p>
          ) : null}
          {fields.lastLap && typeof hoverMeta?.lastLapMs === "number" && hoverMeta.lastLapMs > 0 ? (
            <p className="replay-track-canvas__tooltip-line"><span>Last lap</span><strong>{formatLap(hoverMeta.lastLapMs)}</strong></p>
          ) : null}
          {fields.bestLap && typeof hoverMeta?.bestLapMs === "number" && hoverMeta.bestLapMs > 0 ? (
            <p className="replay-track-canvas__tooltip-line"><span>Best lap</span><strong>{formatLap(hoverMeta.bestLapMs)}</strong></p>
          ) : null}
          {fields.tyre && hoverMeta?.tyreCompound ? (
            <p className="replay-track-canvas__tooltip-line"><span>Tyre</span><strong>{hoverMeta.tyreCompound}{typeof hoverMeta.tyreAge === "number" ? ` · ${hoverMeta.tyreAge}L` : ""}</strong></p>
          ) : null}
          {fields.speed && typeof hoverTarget.speed === "number" ? (
            <p className="replay-track-canvas__tooltip-line"><span>Speed</span><strong>{Math.round(hoverTarget.speed)} km/h</strong></p>
          ) : null}
          {fields.drs && typeof hoverTarget.drs === "number" ? (
            <p className="replay-track-canvas__tooltip-line"><span>DRS</span><strong>{hoverTarget.drs ? "open" : "closed"}</strong></p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatLap(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`
    : `${seconds.toFixed(3)}s`;
}
