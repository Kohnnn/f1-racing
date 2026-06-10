"use client";

/**
 * Replay 3D scene (2026-06-10).
 *
 * React Three Fiber port of the 2D replay track map. Shares the exact same
 * motion model as TrackCanvas through createReplayInterpolator, so car
 * positions stay in sync with the leaderboard and playback clock.
 *
 * World mapping: canonical track coordinates (metres-ish) are centred at the
 * origin and laid into the XZ plane with Y up; world units stay 1:1 with
 * track units so car/track dimensions read naturally.
 */

import { Billboard, Line, OrbitControls, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ReplayDriver, ReplayFrame, ReplayPack } from "@/lib/data";
import { createReplayInterpolator, type ReplayInterpolator } from "../interpolation";
import { buildTrackGeometry, type TrackGeometry } from "../track-geometry";

type CameraMode = "orbit" | "chase" | "tv";

const TRACK_HALF_WIDTH = 6;
const CAR_LENGTH = 5.4;
const CAR_WIDTH = 1.9;

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#e10600",
  MEDIUM: "#ffd12e",
  HARD: "#d8d8d8",
  INTERMEDIATE: "#43b02a",
  WET: "#0067ad",
};

interface ReplayScene3DProps {
  trackPath: ReplayPack["trackPath"];
  trackMetadata: ReplayPack["trackMetadata"];
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  nextFrame: ReplayFrame | null;
  playheadTimeRef: { current: number };
  estimatedLapDuration: number;
  selectedDrivers: string[];
}

interface WorldMapping {
  centerX: number;
  centerY: number;
  toWorld: (x: number, y: number) => [number, number, number];
  radius: number;
}

function buildWorldMapping(geometry: TrackGeometry): WorldMapping {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of geometry.densePoints) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const radius = Math.max(maxX - minX, maxY - minY) * 0.5 + TRACK_HALF_WIDTH * 4;
  return {
    centerX,
    centerY,
    toWorld: (x: number, y: number) => [x - centerX, 0, -(y - centerY)],
    radius,
  };
}

function isYellowStatus(frame: ReplayFrame | null) {
  if (!frame) return false;
  const status = (frame.trackStatus || "").toUpperCase();
  if (status.includes("YELLOW") || status.includes("SC") || status.includes("VSC")) return true;
  return frame.safetyCar ? frame.safetyCar.phase !== "none" : false;
}

/** Track ribbon built from the dense centreline + outward normals. */
function TrackRibbon({ geometry, mapping }: { geometry: TrackGeometry; mapping: WorldMapping }) {
  const ribbon = useMemo(() => {
    const dense = geometry.densePoints;
    const count = dense.length;
    const positions = new Float32Array(count * 2 * 3);
    const indices: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const p = dense[i];
      const [lx, , lz] = mapping.toWorld(p.x + p.nx * TRACK_HALF_WIDTH, p.y + p.ny * TRACK_HALF_WIDTH);
      const [rx, , rz] = mapping.toWorld(p.x - p.nx * TRACK_HALF_WIDTH, p.y - p.ny * TRACK_HALF_WIDTH);
      positions[i * 6 + 0] = lx;
      positions[i * 6 + 1] = 0.02;
      positions[i * 6 + 2] = lz;
      positions[i * 6 + 3] = rx;
      positions[i * 6 + 4] = 0.02;
      positions[i * 6 + 5] = rz;
      const a = i * 2;
      const b = i * 2 + 1;
      const c = ((i + 1) % count) * 2;
      const d = ((i + 1) % count) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [geometry, mapping]);

  const edges = useMemo(() => {
    const dense = geometry.densePoints;
    const left: Array<[number, number, number]> = [];
    const right: Array<[number, number, number]> = [];
    const step = 4;
    for (let i = 0; i <= dense.length; i += step) {
      const p = dense[i % dense.length];
      const [lx, , lz] = mapping.toWorld(p.x + p.nx * TRACK_HALF_WIDTH, p.y + p.ny * TRACK_HALF_WIDTH);
      const [rx, , rz] = mapping.toWorld(p.x - p.nx * TRACK_HALF_WIDTH, p.y - p.ny * TRACK_HALF_WIDTH);
      left.push([lx, 0.06, lz]);
      right.push([rx, 0.06, rz]);
    }
    return { left, right };
  }, [geometry, mapping]);

  const startLine = useMemo(() => {
    const p = geometry.pointAtDistance(0);
    const [x, , z] = mapping.toWorld(p.x, p.y);
    const heading = Math.atan2(
      geometry.pointAtDistance(3).y - p.y,
      geometry.pointAtDistance(3).x - p.x,
    );
    return { position: [x, 0.05, z] as [number, number, number], rotationY: heading };
  }, [geometry, mapping]);

  return (
    <group>
      <mesh geometry={ribbon} receiveShadow={false}>
        <meshStandardMaterial color="#272c35" roughness={0.92} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      <Line points={edges.left} color="#cdd6e4" lineWidth={1} transparent opacity={0.75} />
      <Line points={edges.right} color="#cdd6e4" lineWidth={1} transparent opacity={0.75} />
      <mesh position={startLine.position} rotation={[0, startLine.rotationY, 0]}>
        <boxGeometry args={[1.6, 0.04, TRACK_HALF_WIDTH * 2]} />
        <meshBasicMaterial color="#f2f5fa" />
      </mesh>
    </group>
  );
}

/** Red/white kerb blocks plus billboard corner numbers. */
function CornerMarkers({
  geometry,
  mapping,
  corners,
  trackTotalLength,
}: {
  geometry: TrackGeometry;
  mapping: WorldMapping;
  corners: NonNullable<ReplayPack["trackMetadata"]>["corners"];
  trackTotalLength: number;
}) {
  const markers = useMemo(() => {
    const items: Array<{
      key: string;
      label: string;
      labelPos: [number, number, number];
      kerbs: Array<{ pos: [number, number, number]; rotY: number; color: string }>;
    }> = [];
    const ratioScale = trackTotalLength > 0 ? geometry.totalLength / trackTotalLength : 1;
    for (const corner of corners) {
      if (corner.trackPosition === null) continue;
      const distance = corner.trackPosition * ratioScale;
      const p = geometry.pointAtDistance(distance);
      const ahead = geometry.pointAtDistance(distance + 3);
      const heading = Math.atan2(ahead.y - p.y, ahead.x - p.x);
      const [lx, , lz] = mapping.toWorld(
        p.x + p.nx * (TRACK_HALF_WIDTH + 2.4),
        p.y + p.ny * (TRACK_HALF_WIDTH + 2.4),
      );
      const kerbs: Array<{ pos: [number, number, number]; rotY: number; color: string }> = [];
      for (let i = -2; i <= 2; i += 1) {
        const kp = geometry.pointAtDistance(distance + i * 6);
        const [kx, , kz] = mapping.toWorld(
          kp.x + kp.nx * (TRACK_HALF_WIDTH + 0.7),
          kp.y + kp.ny * (TRACK_HALF_WIDTH + 0.7),
        );
        const kAhead = geometry.pointAtDistance(distance + i * 6 + 3);
        kerbs.push({
          pos: [kx, 0.08, kz],
          rotY: Math.atan2(kAhead.y - kp.y, kAhead.x - kp.x),
          color: (i + 2) % 2 === 0 ? "#c33131" : "#e8ecf3",
        });
      }
      items.push({
        key: `corner-${corner.number}${corner.letter ?? ""}`,
        label: `${corner.number}${corner.letter ?? ""}`,
        labelPos: [lx, 7, lz],
        kerbs,
      });
      void heading;
    }
    return items;
  }, [corners, geometry, mapping, trackTotalLength]);

  return (
    <group>
      {markers.map((marker) => (
        <group key={marker.key}>
          {marker.kerbs.map((kerb, index) => (
            <mesh key={index} position={kerb.pos} rotation={[0, kerb.rotY, 0]}>
              <boxGeometry args={[5.4, 0.12, 1.3]} />
              <meshStandardMaterial color={kerb.color} roughness={0.8} />
            </mesh>
          ))}
          <Billboard position={marker.labelPos}>
            <Text fontSize={5} color="#9fb2cc" anchorX="center" anchorY="middle" outlineWidth={0.18} outlineColor="#0a0d13">
              {marker.label}
            </Text>
          </Billboard>
        </group>
      ))}
    </group>
  );
}

/** Low-poly F1 car assembled from primitives. Parts are looked up by name. */
function F1Car({ color, code }: { color: string; code: string }) {
  const bodyColor = useMemo(() => new THREE.Color(color), [color]);
  return (
    <group name={`car-${code}`}>
      {/* Chassis centre + engine cover */}
      <mesh name="body" position={[0, 0.45, 0]}>
        <boxGeometry args={[CAR_LENGTH * 0.52, 0.55, CAR_WIDTH * 0.5]} />
        <meshStandardMaterial color={bodyColor} roughness={0.35} metalness={0.25} />
      </mesh>
      {/* Nose */}
      <mesh position={[CAR_LENGTH * 0.36, 0.36, 0]} rotation={[0, 0, -0.06]}>
        <boxGeometry args={[CAR_LENGTH * 0.34, 0.3, CAR_WIDTH * 0.22]} />
        <meshStandardMaterial color={bodyColor} roughness={0.35} metalness={0.25} />
      </mesh>
      {/* Sidepods */}
      <mesh position={[-CAR_LENGTH * 0.05, 0.4, 0]}>
        <boxGeometry args={[CAR_LENGTH * 0.34, 0.42, CAR_WIDTH * 0.86]} />
        <meshStandardMaterial color={bodyColor} roughness={0.45} metalness={0.2} />
      </mesh>
      {/* Cockpit + halo */}
      <mesh position={[CAR_LENGTH * 0.08, 0.74, 0]}>
        <boxGeometry args={[0.8, 0.32, 0.62]} />
        <meshStandardMaterial color="#11151d" roughness={0.5} />
      </mesh>
      <mesh position={[CAR_LENGTH * 0.08, 0.92, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.34, 0.045, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#2a313d" roughness={0.4} metalness={0.4} />
      </mesh>
      {/* Front wing */}
      <mesh position={[CAR_LENGTH * 0.52, 0.16, 0]}>
        <boxGeometry args={[0.5, 0.07, CAR_WIDTH]} />
        <meshStandardMaterial color="#1a1f29" roughness={0.5} />
      </mesh>
      {/* Rear wing main plane on pillars */}
      <mesh position={[-CAR_LENGTH * 0.46, 0.95, 0]}>
        <boxGeometry args={[0.42, 0.06, CAR_WIDTH * 0.78]} />
        <meshStandardMaterial color="#1a1f29" roughness={0.5} />
      </mesh>
      {/* DRS flap: hinged group so the flap rotates open about its leading edge */}
      <group name="drsFlap" position={[-CAR_LENGTH * 0.43, 1.04, 0]}>
        <mesh position={[-0.14, 0, 0]}>
          <boxGeometry args={[0.3, 0.045, CAR_WIDTH * 0.74]} />
          <meshStandardMaterial color="#222835" roughness={0.5} />
        </mesh>
      </group>
      {/* Wheels: wrapper groups spin around the axle (local Z). */}
      {([
        ["wheelFL", CAR_LENGTH * 0.3, CAR_WIDTH * 0.56],
        ["wheelFR", CAR_LENGTH * 0.3, -CAR_WIDTH * 0.56],
        ["wheelRL", -CAR_LENGTH * 0.32, CAR_WIDTH * 0.56],
        ["wheelRR", -CAR_LENGTH * 0.32, -CAR_WIDTH * 0.56],
      ] as Array<[string, number, number]>).map(([name, wx, wz]) => (
        <group key={name} name={name} position={[wx, 0.34, wz]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.34, 0.34, 0.36, 12]} />
            <meshStandardMaterial color="#15181f" roughness={0.85} />
          </mesh>
          <mesh name={`${name}-ring`}>
            <torusGeometry args={[0.345, 0.035, 6, 18]} />
            <meshStandardMaterial color="#d8d8d8" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* Brake glow discs at the rear wheels */}
      {([
        ["brakeGlowL", -CAR_LENGTH * 0.32, CAR_WIDTH * 0.36],
        ["brakeGlowR", -CAR_LENGTH * 0.32, -CAR_WIDTH * 0.36],
      ] as Array<[string, number, number]>).map(([name, gx, gz]) => (
        <mesh key={name} name={name} position={[gx, 0.34, gz]} visible={false}>
          <sphereGeometry args={[0.16, 8, 8]} />
          <meshBasicMaterial color="#ff4416" transparent opacity={0.85} />
        </mesh>
      ))}
      {/* Fake contact shadow */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[CAR_LENGTH * 0.42, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Drives car transforms, telemetry effects, the focused-car label, and the
 * chase / tv cameras every frame without re-rendering React.
 */
function SimulationLayer({
  geometry,
  mapping,
  drivers,
  currentFrame,
  nextFrame,
  playheadTimeRef,
  estimatedLapDuration,
  focusedCode,
  cameraMode,
}: {
  geometry: TrackGeometry;
  mapping: WorldMapping;
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  nextFrame: ReplayFrame | null;
  playheadTimeRef: { current: number };
  estimatedLapDuration: number;
  focusedCode: string | null;
  cameraMode: CameraMode;
}) {
  const carRefs = useRef<Map<string, THREE.Group>>(new Map());
  const labelRef = useRef<THREE.Group>(null);
  const textRef = useRef<{ text?: string } | null>(null);
  const interpolatorRef = useRef<ReplayInterpolator | null>(null);
  const framesRef = useRef<{ current: ReplayFrame | null; next: ReplayFrame | null }>({ current: null, next: null });
  const focusedRef = useRef<string | null>(focusedCode);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const wheelSpinRef = useRef<Map<string, number>>(new Map());
  const lastPositionsRef = useRef<Map<string, number>>(new Map());
  const pulseRef = useRef<Map<string, number>>(new Map());
  const { camera } = useThree();

  useEffect(() => {
    interpolatorRef.current = createReplayInterpolator(geometry, estimatedLapDuration);
  }, [geometry, estimatedLapDuration]);

  useEffect(() => {
    framesRef.current = { current: currentFrame, next: nextFrame };
  }, [currentFrame, nextFrame]);

  useEffect(() => {
    focusedRef.current = focusedCode;
  }, [focusedCode]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  const tvPoints = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i += 1) {
      const p = geometry.pointAtDistance((i / 6) * geometry.totalLength);
      const [x, , z] = mapping.toWorld(
        p.x + p.nx * (TRACK_HALF_WIDTH + 26),
        p.y + p.ny * (TRACK_HALF_WIDTH + 26),
      );
      points.push(new THREE.Vector3(x, 14, z));
    }
    return points;
  }, [geometry, mapping]);

  useFrame((_, delta) => {
    const interpolator = interpolatorRef.current;
    if (!interpolator) return;
    interpolator.snap(framesRef.current.current, framesRef.current.next);
    const states = interpolator.sample(playheadTimeRef.current);

    let focusedWorld: THREE.Vector3 | null = null;
    let focusedHeading = 0;
    let leaderCode: string | null = null;
    let leaderPosition = Number.MAX_SAFE_INTEGER;
    for (const state of states.values()) {
      if (state.position !== null && state.position < leaderPosition) {
        leaderPosition = state.position;
        leaderCode = state.driverCode;
      }
    }
    const focusCode = focusedRef.current ?? leaderCode;

    for (const [code, state] of states.entries()) {
      const group = carRefs.current.get(code);
      if (!group) continue;
      group.visible = true;
      const [wx, , wz] = mapping.toWorld(state.point.x, state.point.y);
      group.position.set(wx, 0, wz);
      group.rotation.y = state.heading;

      // Wheel spin scaled by speed.
      const spin = (wheelSpinRef.current.get(code) ?? 0) + ((state.speed ?? 0) / 3.6 / 0.34) * delta;
      wheelSpinRef.current.set(code, spin);
      for (const wheelName of ["wheelFL", "wheelFR", "wheelRL", "wheelRR"]) {
        const wheel = group.getObjectByName(wheelName);
        if (wheel) wheel.rotation.z = -spin;
      }

      // DRS flap.
      const flap = group.getObjectByName("drsFlap");
      if (flap) {
        const open = (state.drs ?? 0) >= 10;
        flap.rotation.z = THREE.MathUtils.lerp(flap.rotation.z, open ? -0.9 : 0, 0.2);
      }

      // Brake glow.
      const braking = (state.brake ?? 0) > 30;
      for (const glowName of ["brakeGlowL", "brakeGlowR"]) {
        const glow = group.getObjectByName(glowName);
        if (glow) glow.visible = braking;
      }

      // Tyre compound rings.
      const ringColor = COMPOUND_COLORS[(state.tyreCompound ?? "").toUpperCase()] ?? "#7a8294";
      for (const wheelName of ["wheelFL", "wheelFR", "wheelRL", "wheelRR"]) {
        const ring = group.getObjectByName(`${wheelName}-ring`) as THREE.Mesh | null;
        if (ring && ring.material instanceof THREE.MeshStandardMaterial) {
          ring.material.color.set(ringColor);
        }
      }

      // Position-change pulse on the body emissive.
      const lastPosition = lastPositionsRef.current.get(code);
      if (state.position !== null && lastPosition !== undefined && state.position !== lastPosition) {
        pulseRef.current.set(code, 1);
      }
      if (state.position !== null) lastPositionsRef.current.set(code, state.position);
      const pulse = pulseRef.current.get(code) ?? 0;
      const body = group.getObjectByName("body") as THREE.Mesh | null;
      if (body && body.material instanceof THREE.MeshStandardMaterial) {
        body.material.emissive.setScalar(pulse * 0.5);
      }
      if (pulse > 0) pulseRef.current.set(code, Math.max(0, pulse - delta * 1.4));

      if (code === focusCode) {
        focusedWorld = group.position.clone();
        focusedHeading = state.heading;
        const label = labelRef.current;
        if (label) {
          label.visible = true;
          label.position.set(wx, 3.4, wz);
          const text = textRef.current;
          if (text) {
            const positionLabel = state.position !== null ? `P${state.position} ` : "";
            const gearLabel = state.gear !== null ? ` · G${state.gear}` : "";
            const speedLabel = state.speed !== null ? ` · ${Math.round(state.speed)} km/h` : "";
            text.text = `${positionLabel}${code}${gearLabel}${speedLabel}`;
          }
        }
      }
    }

    // Hide cars with no data this frame.
    for (const [code, group] of carRefs.current.entries()) {
      if (!states.has(code)) group.visible = false;
    }
    if (!focusedWorld && labelRef.current) labelRef.current.visible = false;

    // Camera rigs.
    const mode = cameraModeRef.current;
    if (mode === "chase" && focusedWorld) {
      const back = new THREE.Vector3(-Math.cos(focusedHeading), 0, Math.sin(focusedHeading));
      const target = focusedWorld.clone().add(back.multiplyScalar(16)).add(new THREE.Vector3(0, 7, 0));
      camera.position.lerp(target, Math.min(1, delta * 3.2));
      camera.lookAt(focusedWorld.x, focusedWorld.y + 1, focusedWorld.z);
    } else if (mode === "tv" && focusedWorld) {
      let best = tvPoints[0];
      let bestDistance = Infinity;
      for (const point of tvPoints) {
        const d = point.distanceToSquared(focusedWorld);
        if (d < bestDistance) {
          bestDistance = d;
          best = point;
        }
      }
      camera.position.lerp(best, Math.min(1, delta * 2.4));
      camera.lookAt(focusedWorld.x, focusedWorld.y + 1, focusedWorld.z);
    }
  });

  return (
    <group>
      {drivers.map((driver) => (
        <group
          key={driver.driverCode}
          ref={(node) => {
            if (node) carRefs.current.set(driver.driverCode, node);
            else carRefs.current.delete(driver.driverCode);
          }}
        >
          <F1Car color={driver.teamColor || "#9ca3af"} code={driver.driverCode} />
        </group>
      ))}
      <group ref={labelRef} visible={false}>
        <Billboard>
          <Text
            ref={textRef as never}
            fontSize={2.2}
            color="#eef2f9"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.1}
            outlineColor="#0a0d13"
          >
            {""}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

function SceneAtmosphere({ yellow, radius }: { yellow: boolean; radius: number }) {
  return (
    <>
      <hemisphereLight args={[yellow ? "#d8c27a" : "#aab8d4", "#10141c", 0.85]} />
      <directionalLight position={[radius * 0.6, radius * 0.9, radius * 0.3]} intensity={1.1} color={yellow ? "#ffe9b0" : "#ffffff"} />
      <fog attach="fog" args={[yellow ? "#16140c" : "#0a0d13", radius * 0.9, radius * 3.4]} />
      <color attach="background" args={[yellow ? "#100f0a" : "#0a0d13"]} />
    </>
  );
}

export default function ReplayScene3D({
  trackPath,
  trackMetadata,
  drivers,
  currentFrame,
  nextFrame,
  playheadTimeRef,
  estimatedLapDuration,
  selectedDrivers,
}: ReplayScene3DProps) {
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");

  const geometry = useMemo(
    () => buildTrackGeometry(trackPath, 1000, 1000),
    [trackPath],
  );
  const mapping = useMemo(
    () => (geometry ? buildWorldMapping(geometry) : null),
    [geometry],
  );

  const focusedCode = selectedDrivers[0] ?? null;
  const yellow = isYellowStatus(currentFrame);

  if (!geometry || !mapping) {
    return <div className="replay3d__empty">Track path not available for 3D view.</div>;
  }

  return (
    <div className="replay3d">
      <div className="replay3d__camera-bar" role="group" aria-label="3D camera mode">
        {([
          ["orbit", "Orbit"],
          ["chase", "Chase"],
          ["tv", "TV"],
        ] as Array<[CameraMode, string]>).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={`replay3d__camera-button${cameraMode === mode ? " replay3d__camera-button--active" : ""}`}
            aria-pressed={cameraMode === mode}
            onClick={() => setCameraMode(mode)}
          >
            {label}
          </button>
        ))}
        <span className="replay3d__hint">
          {cameraMode === "orbit" ? "Drag rotate · wheel zoom" : focusedCode ? `Following ${focusedCode}` : "Following leader"}
        </span>
      </div>
      <Canvas
        camera={{
          position: [mapping.radius * 0.7, mapping.radius * 0.85, mapping.radius * 0.7],
          fov: 48,
          near: 0.5,
          far: mapping.radius * 8,
        }}
        frameloop="always"
        dpr={[1, 1.75]}
      >
        <SceneAtmosphere yellow={yellow} radius={mapping.radius} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <circleGeometry args={[mapping.radius * 2.6, 48]} />
          <meshStandardMaterial color="#0d1118" roughness={1} />
        </mesh>
        <gridHelper args={[mapping.radius * 3, 46, "#1c2330", "#141a25"]} position={[0, -0.02, 0]} />
        <TrackRibbon geometry={geometry} mapping={mapping} />
        {trackMetadata?.corners?.length ? (
          <CornerMarkers
            geometry={geometry}
            mapping={mapping}
            corners={trackMetadata.corners}
            trackTotalLength={trackMetadata.length || geometry.totalLength}
          />
        ) : null}
        <SimulationLayer
          geometry={geometry}
          mapping={mapping}
          drivers={drivers}
          currentFrame={currentFrame}
          nextFrame={nextFrame}
          playheadTimeRef={playheadTimeRef}
          estimatedLapDuration={estimatedLapDuration}
          focusedCode={focusedCode}
          cameraMode={cameraMode}
        />
        {cameraMode === "orbit" ? (
          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI * 0.49}
            minDistance={mapping.radius * 0.12}
            maxDistance={mapping.radius * 2.6}
          />
        ) : null}
      </Canvas>
    </div>
  );
}
