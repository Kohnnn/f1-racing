/**
 * Shared replay interpolation core (2026-06-10).
 *
 * Mirrors the proven TrackCanvas marker motion model so the 2D canvas and
 * the 3D scene move cars identically:
 *
 * - target arc distance per frame: project (x, y) onto the dense track line,
 *   with an interval-based fallback when coordinates are missing
 * - lap-rollover unwrap guards in both directions
 * - smoothstep easing between frame targets driven by the playhead clock
 * - residual smoother (RESIDUAL_EASE) plus a quarter-lap max-step clamp
 *
 * Constants are kept in lockstep with TrackCanvas.tsx.
 */

import type { ReplayFrame } from "@/lib/data";
import type { TrackGeometry } from "./track-geometry";

export const LANE_SPACING = 2.4;
export const RESIDUAL_EASE = 0.35;

export function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

export interface InterpolatedDriverState {
  driverCode: string;
  arcDistance: number;
  point: { x: number; y: number };
  /** Heading in track-plane radians (atan2 of the path tangent). */
  heading: number;
  laneOffset: number;
  position: number | null;
  speed: number | null;
  throttle: number | null;
  brake: number | null;
  gear: number | null;
  rpm: number | null;
  drs: number | null;
  lap: number | null;
  tyreCompound: string | null;
  tyreAge: number | null;
  interval: number | null;
}

interface DriverTargetState {
  distA: number;
  distB: number;
  displayDistance: number;
  laneOffset: number;
  frameDriver: ReplayFrame["drivers"][string];
}

export interface ReplayInterpolator {
  /** Re-snap frame targets; cheap when the frame signature is unchanged. */
  snap(currentFrame: ReplayFrame | null, nextFrame: ReplayFrame | null): void;
  /** Advance the residual smoother and sample every driver at the playhead. */
  sample(playheadTime: number): Map<string, InterpolatedDriverState>;
}

function laneOffsetForDriver(driverCode: string) {
  let hash = 0;
  for (let i = 0; i < driverCode.length; i += 1) {
    hash = (hash * 31 + driverCode.charCodeAt(i)) | 0;
  }
  return ((Math.abs(hash) % 5) - 2) * LANE_SPACING * 0.4;
}

export function createReplayInterpolator(
  geometry: TrackGeometry,
  estimatedLapDuration: number,
): ReplayInterpolator {
  const targets = new Map<string, DriverTargetState>();
  let lastSignature: string | null = null;
  let currentFrameRef: ReplayFrame | null = null;
  let nextFrameRef: ReplayFrame | null = null;

  function computeTargetDistance(
    driver: ReplayFrame["drivers"][string],
    frame: ReplayFrame,
  ): number {
    const lapOffset = Math.max(0, (driver.lap ?? frame.lap ?? 1) - 1) * geometry.totalLength;
    if (driver.x !== null && driver.y !== null) {
      return lapOffset + geometry.project({ x: driver.x, y: driver.y }).distance;
    }
    return computeIntervalDistance(driver, frame, lapOffset);
  }

  function computeIntervalDistance(
    driver: ReplayFrame["drivers"][string],
    frame: ReplayFrame,
    lapOffset: number,
  ): number {
    const leader = Object.values(frame.drivers)
      .filter((candidate) => candidate.x !== null && candidate.y !== null)
      .sort((left, right) => left.position - right.position)[0];

    let leaderDistance = 0;
    if (leader && leader.x !== null && leader.y !== null) {
      leaderDistance = geometry.project({ x: leader.x, y: leader.y }).distance;
    }

    const intervalSeconds = driver.interval !== null
      ? driver.interval
      : Math.max(0, driver.position - 1) * 0.55;
    const lapDuration = Math.max(55, estimatedLapDuration);
    const intervalDistance = (intervalSeconds / lapDuration) * geometry.totalLength;

    return lapOffset + leaderDistance - intervalDistance;
  }

  function snap(currentFrame: ReplayFrame | null, nextFrame: ReplayFrame | null) {
    currentFrameRef = currentFrame;
    nextFrameRef = nextFrame;

    if (!currentFrame) {
      targets.clear();
      lastSignature = null;
      return;
    }

    const driverCount = Object.keys(currentFrame.drivers).length;
    const signature = `${currentFrame.t}|${driverCount}|${nextFrame ? nextFrame.t : "_"}`;
    if (lastSignature === signature) return;
    lastSignature = signature;

    const seen = new Set<string>();
    for (const driver of Object.values(currentFrame.drivers)) {
      if (!driver) continue;
      seen.add(driver.driverCode);
      const distA = computeTargetDistance(driver, currentFrame);
      let distB = distA;
      if (nextFrame) {
        const nextDriver = nextFrame.drivers[driver.driverCode];
        if (nextDriver) {
          let candidateB = computeTargetDistance(nextDriver, nextFrame);
          // Lap rollover: if next is far behind current, unwrap forward.
          if (candidateB - distA < -geometry.totalLength * 0.4) {
            candidateB += geometry.totalLength;
          }
          // Reverse desync: never let one inter-frame step span most of a lap.
          if (candidateB - distA > geometry.totalLength * 0.6) {
            candidateB -= geometry.totalLength;
          }
          distB = candidateB;
        }
      }

      const existing = targets.get(driver.driverCode);
      if (!existing) {
        targets.set(driver.driverCode, {
          distA,
          distB,
          displayDistance: distA,
          laneOffset: laneOffsetForDriver(driver.driverCode),
          frameDriver: driver,
        });
        continue;
      }

      let nextDisplay = existing.displayDistance;
      if (distA - nextDisplay < -geometry.totalLength * 0.4) {
        nextDisplay -= geometry.totalLength;
      }
      if (distA - nextDisplay > geometry.totalLength * 0.6) {
        nextDisplay += geometry.totalLength;
      }

      targets.set(driver.driverCode, {
        ...existing,
        distA,
        distB,
        displayDistance: nextDisplay,
        frameDriver: driver,
      });
    }

    for (const code of Array.from(targets.keys())) {
      if (!seen.has(code)) targets.delete(code);
    }
  }

  function sample(playheadTime: number): Map<string, InterpolatedDriverState> {
    const out = new Map<string, InterpolatedDriverState>();
    const cur = currentFrameRef;
    const nxt = nextFrameRef;
    let localT = 0;
    if (cur && nxt && nxt.t > cur.t) {
      localT = Math.min(1, Math.max(0, (playheadTime - cur.t) / (nxt.t - cur.t)));
    }
    const eased = smoothstep(localT);

    for (const [code, target] of targets.entries()) {
      const interpolatedDistance = target.distA + (target.distB - target.distA) * eased;
      let delta = interpolatedDistance - target.displayDistance;
      // Safety clamp: never advance more than a quarter lap in one frame.
      const maxStep = geometry.totalLength * 0.25;
      if (delta > maxStep) delta = maxStep;
      else if (delta < -maxStep) delta = -maxStep;
      target.displayDistance = target.displayDistance + delta * RESIDUAL_EASE;

      const trackPoint = geometry.pointAtDistance(target.displayDistance);
      const ahead = geometry.pointAtDistance(target.displayDistance + 3);
      const heading = Math.atan2(ahead.y - trackPoint.y, ahead.x - trackPoint.x);
      const driver = target.frameDriver;

      out.set(code, {
        driverCode: code,
        arcDistance: target.displayDistance,
        point: {
          x: trackPoint.x + trackPoint.nx * target.laneOffset,
          y: trackPoint.y + trackPoint.ny * target.laneOffset,
        },
        heading,
        laneOffset: target.laneOffset,
        position: driver.position ?? null,
        speed: driver.speed ?? null,
        throttle: driver.throttle ?? null,
        brake: driver.brake ?? null,
        gear: driver.gear ?? null,
        rpm: driver.rpm ?? null,
        drs: driver.drs ?? null,
        lap: driver.lap ?? null,
        tyreCompound: driver.tyreCompound ?? null,
        tyreAge: driver.tyreAge ?? null,
        interval: driver.interval ?? null,
      });
    }

    return out;
  }

  return { snap, sample };
}
