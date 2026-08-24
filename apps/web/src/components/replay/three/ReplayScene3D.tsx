"use client";

import {
  Billboard,
  Environment,
  Line,
  OrbitControls,
  PerformanceMonitor,
  Text,
  useProgress,
  useTexture,
} from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { configureTextBuilder } from "troika-three-text";
import type { ReplayDriver, ReplayFrame, ReplayPack } from "@/lib/data";
import { createReplayInterpolator, type InterpolatedDriverState, type ReplayInterpolator } from "../interpolation";
import type { PitPulse } from "../TrackCanvas";
import { buildTrackGeometry, type TrackGeometry } from "../track-geometry";
import {
  createDirectorState,
  selectDirectorShot,
  type CameraMode,
  type DirectorState,
  type ReplayCarState,
} from "./replay-director";

configureTextBuilder({
  defaultFontURL: "/fonts/roboto-latin-400-v51.woff",
  useWorker: false,
});

const TRACK_HALF_WIDTH = 6;
const FORMULA_CAR_URL = "/replay-3d/formula-car.glb";
const HDRI_URL = "/replay-3d/kloofendal-pure-sky-1k.hdr";
const CAR_LENGTH = 5.4;
const CAR_SOURCE_LENGTH = 3.0161001165321295;
const CAR_SCALE = CAR_LENGTH / CAR_SOURCE_LENGTH;
const CAR_SOURCE_CENTER = new THREE.Vector3(-0.0000008, 0.000807, 0.51486);
const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#e10600",
  MEDIUM: "#ffd12e",
  HARD: "#f2f2f2",
  INTERMEDIATE: "#43b02a",
  WET: "#1787ff",
};

interface ReplayScene3DProps {
  trackPath: ReplayPack["trackPath"];
  trackMetadata: ReplayPack["trackMetadata"];
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  nextFrame: ReplayFrame | null;
  playheadTimeRef: { current: number };
  clockSeconds: number;
  isPlaying: boolean;
  seekToken: number;
  estimatedLapDuration: number;
  selectedDrivers: string[];
  showDrsZones: boolean;
  showEvents: boolean;
  showMarshalSectors: boolean;
  drsZones?: Array<{ id?: string; from: number; to: number; fromRatio?: number; toRatio?: number }>;
  marshalSectors?: Array<{ index: number; fromDistance: number; toDistance: number; flag?: string | null }>;
  activeMarshalFlagBySector?: Map<number, string>;
  pitPulses?: PitPulse[];
  heatmapChannel: "off" | "speed" | "throttle" | "brake";
  heatmapSamples: Array<{ x: number; y: number; value: number }>;
  onDriverSelect?: (driverCode: string | null, append: boolean) => void;
  onUnavailable?: (message: string) => void;
}

interface WorldMapping {
  centerX: number;
  centerY: number;
  toWorld: (x: number, y: number) => [number, number, number];
  radius: number;
}

interface AssetPlacement {
  asset: string;
  ratio: number;
  offset: number;
  scale: number;
  lift?: number;
  rotationOffset?: number;
}

interface FleetPart {
  key: string;
  geometry: THREE.BufferGeometry;
  nodeMatrix: THREE.Matrix4;
  body: boolean;
  wheel: boolean;
}

interface ShotStatus {
  camera: string;
  detail: string;
  target: string;
}

class Replay3DErrorBoundary extends Component<{
  children: ReactNode;
  onError: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function buildWorldMapping(geometry: TrackGeometry): WorldMapping {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of geometry.densePoints) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  return {
    centerX,
    centerY,
    toWorld: (x, y) => [x - centerX, 0, -(y - centerY)],
    radius: Math.max(maxX - minX, maxY - minY) * 0.5 + TRACK_HALF_WIDTH * 5,
  };
}

function createRibbonGeometry(
  geometry: TrackGeometry,
  mapping: WorldMapping,
  halfWidth: number,
  height: number,
) {
  const dense = geometry.densePoints;
  const positions = new Float32Array(dense.length * 6);
  const uvs = new Float32Array(dense.length * 4);
  const indices: number[] = [];
  for (let index = 0; index < dense.length; index += 1) {
    const point = dense[index];
    const [leftX, , leftZ] = mapping.toWorld(
      point.x + point.nx * halfWidth,
      point.y + point.ny * halfWidth,
    );
    const [rightX, , rightZ] = mapping.toWorld(
      point.x - point.nx * halfWidth,
      point.y - point.ny * halfWidth,
    );
    positions.set([leftX, height, leftZ, rightX, height, rightZ], index * 6);
    const u = point.distance / 32;
    uvs.set([u, 0, u, 1], index * 4);
    const next = (index + 1) % dense.length;
    const a = index * 2;
    const b = a + 1;
    const c = next * 2;
    const d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  result.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  result.setIndex(indices);
  result.computeVertexNormals();
  return result;
}

function headingAtDistance(geometry: TrackGeometry, distance: number) {
  const point = geometry.pointAtDistance(distance);
  const ahead = geometry.pointAtDistance(distance + 3);
  return Math.atan2(ahead.y - point.y, ahead.x - point.x);
}

function worldPlacement(
  geometry: TrackGeometry,
  mapping: WorldMapping,
  ratio: number,
  offset: number,
  lift = 0,
) {
  const distance = ratio * geometry.totalLength;
  const point = geometry.pointAtDistance(distance);
  const [x, , z] = mapping.toWorld(
    point.x + point.nx * offset,
    point.y + point.ny * offset,
  );
  return {
    position: [x, lift, z] as [number, number, number],
    rotationY: headingAtDistance(geometry, distance),
  };
}

function TrackSurface({ geometry, mapping }: { geometry: TrackGeometry; mapping: WorldMapping }) {
  const [colorMap, normalMap, roughnessMap] = useTexture([
    "/replay-3d/asphalt-color.webp",
    "/replay-3d/asphalt-normal.webp",
    "/replay-3d/asphalt-roughness.webp",
  ]);
  const runoff = useMemo(() => createRibbonGeometry(geometry, mapping, 13.5, 0.015), [geometry, mapping]);
  const shoulder = useMemo(() => createRibbonGeometry(geometry, mapping, 8.2, 0.03), [geometry, mapping]);
  const road = useMemo(() => createRibbonGeometry(geometry, mapping, TRACK_HALF_WIDTH, 0.055), [geometry, mapping]);
  const edges = useMemo(() => {
    const left: Array<[number, number, number]> = [];
    const right: Array<[number, number, number]> = [];
    for (let index = 0; index <= geometry.densePoints.length; index += 4) {
      const point = geometry.densePoints[index % geometry.densePoints.length];
      const [leftX, , leftZ] = mapping.toWorld(
        point.x + point.nx * TRACK_HALF_WIDTH,
        point.y + point.ny * TRACK_HALF_WIDTH,
      );
      const [rightX, , rightZ] = mapping.toWorld(
        point.x - point.nx * TRACK_HALF_WIDTH,
        point.y - point.ny * TRACK_HALF_WIDTH,
      );
      left.push([leftX, 0.09, leftZ]);
      right.push([rightX, 0.09, rightZ]);
    }
    return { left, right };
  }, [geometry, mapping]);
  const start = useMemo(() => {
    const placement = worldPlacement(geometry, mapping, 0, 0, 0.09);
    return placement;
  }, [geometry, mapping]);

  useEffect(() => {
    colorMap.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [colorMap, normalMap, roughnessMap]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
    }
  }, [colorMap, normalMap, roughnessMap]);

  useEffect(() => () => {
    runoff.dispose();
    shoulder.dispose();
    road.dispose();
  }, [road, runoff, shoulder]);

  return (
    <group>
      <mesh geometry={runoff}>
        <meshStandardMaterial color="#8a7969" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={shoulder}>
        <meshStandardMaterial color="#303943" roughness={0.98} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={road}>
        <meshStandardMaterial
          map={colorMap}
          normalMap={normalMap}
          roughnessMap={roughnessMap}
          color="#6f7478"
          roughness={0.92}
          metalness={0.02}
          normalScale={new THREE.Vector2(0.35, 0.35)}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Line points={edges.left} color="#f2f4ef" lineWidth={1.25} transparent opacity={0.92} />
      <Line points={edges.right} color="#f2f4ef" lineWidth={1.25} transparent opacity={0.92} />
      <mesh position={start.position} rotation={[0, start.rotationY, 0]}>
        <boxGeometry args={[1.8, 0.04, TRACK_HALF_WIDTH * 2]} />
        <meshStandardMaterial color="#f4f1e9" roughness={0.7} />
      </mesh>
      {Array.from({ length: 10 }, (_, index) => (
        <mesh
          key={index}
          position={worldPlacement(geometry, mapping, 0.002 + index * 0.00135, (index % 2 ? -1 : 1) * 2.2, 0.1).position}
          rotation={[0, start.rotationY, 0]}
        >
          <boxGeometry args={[0.12, 0.025, 0.75]} />
          <meshStandardMaterial color="#e8e4d9" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Kerbs({
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
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo(() => {
    const items: Array<{ matrix: THREE.Matrix4; color: THREE.Color }> = [];
    const ratioScale = trackTotalLength > 0 ? geometry.totalLength / trackTotalLength : 1;
    const object = new THREE.Object3D();
    for (const corner of corners) {
      if (corner.trackPosition === null) continue;
      const distance = corner.trackPosition * ratioScale;
      for (let index = -2; index <= 2; index += 1) {
        const point = geometry.pointAtDistance(distance + index * 5.4);
        const [x, , z] = mapping.toWorld(
          point.x + point.nx * (TRACK_HALF_WIDTH + 0.55),
          point.y + point.ny * (TRACK_HALF_WIDTH + 0.55),
        );
        object.position.set(x, 0.11, z);
        object.rotation.set(0, headingAtDistance(geometry, distance + index * 5.4), 0);
        object.updateMatrix();
        items.push({
          matrix: object.matrix.clone(),
          color: new THREE.Color((index + 2) % 2 === 0 ? "#d53b32" : "#f1eee7"),
        });
      }
    }
    return items;
  }, [corners, geometry, mapping, trackTotalLength]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    instances.forEach((item, index) => {
      mesh.setMatrixAt(index, item.matrix);
      mesh.setColorAt(index, item.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [instances]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, instances.length]}>
      <boxGeometry args={[5.4, 0.12, 1.15]} />
      <meshStandardMaterial vertexColors roughness={0.82} />
    </instancedMesh>
  );
}

function CornerLabels({
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
  const labels = useMemo(() => {
    const valid = corners.filter((corner) => corner.trackPosition !== null);
    const step = Math.max(1, Math.ceil(valid.length / 12));
    const ratioScale = trackTotalLength > 0 ? geometry.totalLength / trackTotalLength : 1;
    return valid.filter((_, index) => index % step === 0).map((corner) => {
      const distance = (corner.trackPosition ?? 0) * ratioScale;
      const point = geometry.pointAtDistance(distance);
      const [x, , z] = mapping.toWorld(
        point.x + point.nx * (TRACK_HALF_WIDTH + 9),
        point.y + point.ny * (TRACK_HALF_WIDTH + 9),
      );
      return {
        key: `${corner.number}${corner.letter ?? ""}`,
        position: [x, 4.2, z] as [number, number, number],
      };
    });
  }, [corners, geometry, mapping, trackTotalLength]);

  return (
    <group>
      {labels.map((label) => (
        <Billboard key={label.key} position={label.position}>
          <Text
            fontSize={2.4}
            color="#f7f4ec"
            outlineWidth={0.12}
            outlineColor="#1b2026"
            anchorX="center"
            anchorY="middle"
          >
            {`T${label.key}`}
          </Text>
        </Billboard>
      ))}
    </group>
  );
}

function DrsZoneStrips({
  geometry,
  mapping,
  drsZones,
  trackTotalLength,
}: {
  geometry: TrackGeometry;
  mapping: WorldMapping;
  drsZones: NonNullable<ReplayScene3DProps["drsZones"]>;
  trackTotalLength: number;
}) {
  const strips = useMemo(() => drsZones.flatMap((zone, zoneIndex) => {
    let startRatio: number | null = null;
    let endRatio: number | null = null;
    if (typeof zone.fromRatio === "number" && typeof zone.toRatio === "number") {
      startRatio = ((zone.fromRatio % 1) + 1) % 1;
      endRatio = ((zone.toRatio % 1) + 1) % 1;
    } else if (trackTotalLength > 0 && Number.isFinite(zone.from) && Number.isFinite(zone.to)) {
      startRatio = ((zone.from / trackTotalLength) % 1 + 1) % 1;
      endRatio = ((zone.to / trackTotalLength) % 1 + 1) % 1;
    }
    if (startRatio === null || endRatio === null) return [];
    const span = endRatio >= startRatio ? endRatio - startRatio : 1 - startRatio + endRatio;
    const steps = Math.max(8, Math.ceil(span * geometry.totalLength / 9));
    const points: Array<[number, number, number]> = [];
    for (let index = 0; index <= steps; index += 1) {
      const distance = (startRatio * geometry.totalLength + span * geometry.totalLength * index / steps) % geometry.totalLength;
      const point = geometry.pointAtDistance(distance);
      const [x, , z] = mapping.toWorld(point.x, point.y);
      points.push([x, 0.16, z]);
    }
    const midpoint = points[Math.floor(points.length / 2)];
    return [{ key: zone.id ?? String(zoneIndex), points, midpoint }];
  }), [drsZones, geometry, mapping, trackTotalLength]);

  return (
    <group>
      {strips.map((strip) => (
        <group key={strip.key}>
          <Line points={strip.points} color="#31e889" lineWidth={3.2} transparent opacity={0.9} dashed dashSize={2.8} gapSize={1.4} />
          <Billboard position={[strip.midpoint[0], 2.2, strip.midpoint[2]]}>
            <Text fontSize={1.5} color="#b8ffd7" outlineWidth={0.08} outlineColor="#101915">DRS</Text>
          </Billboard>
        </group>
      ))}
    </group>
  );
}

function MarshalFlags({
  geometry,
  mapping,
  sectors,
  activeFlags,
  trackTotalLength,
}: {
  geometry: TrackGeometry;
  mapping: WorldMapping;
  sectors: NonNullable<ReplayScene3DProps["marshalSectors"]>;
  activeFlags: Map<number, string>;
  trackTotalLength: number;
}) {
  const active = useMemo(() => sectors.flatMap((sector) => {
    const flag = activeFlags.get(sector.index) ?? sector.flag;
    if (!flag) return [];
    const scale = trackTotalLength > 0 ? geometry.totalLength / trackTotalLength : 1;
    const start = sector.fromDistance * scale;
    const end = sector.toDistance * scale;
    const span = end >= start ? end - start : geometry.totalLength - start + end;
    const points: Array<[number, number, number]> = [];
    for (let index = 0; index <= 18; index += 1) {
      const point = geometry.pointAtDistance(start + span * index / 18);
      const [x, , z] = mapping.toWorld(
        point.x + point.nx * (TRACK_HALF_WIDTH + 2.6),
        point.y + point.ny * (TRACK_HALF_WIDTH + 2.6),
      );
      points.push([x, 0.2, z]);
    }
    return [{ sector: sector.index, flag, points, midpoint: points[Math.floor(points.length / 2)] }];
  }), [activeFlags, geometry, mapping, sectors, trackTotalLength]);

  return (
    <group>
      {active.map((item) => {
        const color = item.flag.includes("RED") ? "#ff4b47" : "#ffd62e";
        return (
          <group key={item.sector}>
            <Line points={item.points} color={color} lineWidth={4.5} transparent opacity={0.88} />
            <Billboard position={[item.midpoint[0], 3, item.midpoint[2]]}>
              <Text fontSize={1.5} color={color} outlineWidth={0.08} outlineColor="#111318">
                {`S${item.sector} ${item.flag}`}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}

function PitPulseMarkers({
  geometry,
  mapping,
  pulses,
  clockSeconds,
}: {
  geometry: TrackGeometry;
  mapping: WorldMapping;
  pulses: PitPulse[];
  clockSeconds: number;
}) {
  return (
    <group>
      {pulses.map((pulse) => {
        const point = geometry.pointAtDistance(pulse.ratio * geometry.totalLength);
        const [x, , z] = mapping.toWorld(point.x, point.y);
        const age = Math.max(0, clockSeconds - pulse.startedAt);
        const scale = 1 + age * 2.2;
        return (
          <group key={pulse.id} position={[x, 0.2, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={scale}>
              <ringGeometry args={[1.3, 1.75, 28]} />
              <meshBasicMaterial color={pulse.color ?? "#ff7a1a"} transparent opacity={Math.max(0.08, 0.8 - age * 0.2)} side={THREE.DoubleSide} />
            </mesh>
            <Billboard position={[0, 3.4, 0]}>
              <Text fontSize={1.45} color={pulse.color ?? "#ffb47d"} outlineWidth={0.08} outlineColor="#111318">
                {pulse.label ?? "PIT"}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}

function TelemetryHeatmap({
  mapping,
  samples,
  channel,
}: {
  mapping: WorldMapping;
  samples: ReplayScene3DProps["heatmapSamples"];
  channel: ReplayScene3DProps["heatmapChannel"];
}) {
  const line = useMemo(() => {
    if (channel === "off" || !samples.length) return null;
    const step = Math.max(1, Math.ceil(samples.length / 280));
    const selected = samples.filter((_, index) => index % step === 0);
    const points = selected.map((sample) => {
      const [x, , z] = mapping.toWorld(sample.x, sample.y);
      return [x, 0.23, z] as [number, number, number];
    });
    const colors = selected.map((sample) => new THREE.Color().setHSL((1 - sample.value) * 0.62, 0.94, 0.55));
    return { points, colors };
  }, [channel, mapping, samples]);

  return line ? <Line points={line.points} vertexColors={line.colors} lineWidth={4.2} transparent opacity={0.9} /> : null;
}

function CircuitProp({
  geometry,
  mapping,
  placement,
}: {
  geometry: TrackGeometry;
  mapping: WorldMapping;
  placement: AssetPlacement;
}) {
  const { scene } = useLoader(GLTFLoader, placement.asset) as { scene: THREE.Group };
  const object = useMemo(() => scene.clone(true), [scene]);
  const world = useMemo(
    () => worldPlacement(geometry, mapping, placement.ratio, placement.offset, placement.lift),
    [geometry, mapping, placement],
  );
  return (
    <primitive
      object={object}
      position={world.position}
      rotation={[0, world.rotationY + (placement.rotationOffset ?? 0), 0]}
      scale={placement.scale}
    />
  );
}

function CircuitProps({ geometry, mapping, quality }: {
  geometry: TrackGeometry;
  mapping: WorldMapping;
  quality: "low" | "balanced" | "high";
}) {
  const placements = useMemo<AssetPlacement[]>(() => {
    const root = "/replay-3d/props";
    const core: AssetPlacement[] = [
      { asset: `${root}/overhead.glb`, ratio: 0.001, offset: 0, scale: 10.5 },
      { asset: `${root}/pitsGarage.glb`, ratio: 0.008, offset: -28, scale: 18 },
      { asset: `${root}/pitsOffice.glb`, ratio: 0.018, offset: -29, scale: 18 },
      { asset: `${root}/grandStandCovered.glb`, ratio: 0.055, offset: 34, scale: 22 },
      { asset: `${root}/grandStandCovered.glb`, ratio: 0.64, offset: -34, scale: 20 },
      { asset: `${root}/lightPostLarge.glb`, ratio: 0.13, offset: 22, scale: 12 },
      { asset: `${root}/pylon.glb`, ratio: 0.33, offset: 21, scale: 9 },
      { asset: `${root}/tent.glb`, ratio: 0.47, offset: -25, scale: 13 },
      { asset: `${root}/treeLarge.glb`, ratio: 0.38, offset: 31, scale: 11 },
      { asset: `${root}/treeLarge.glb`, ratio: 0.76, offset: -29, scale: 10 },
      { asset: `${root}/fenceStraight.glb`, ratio: 0.16, offset: 13, scale: 14 },
      { asset: `${root}/barrierWall.glb`, ratio: 0.21, offset: -9.5, scale: 13 },
      { asset: `${root}/barrierWall.glb`, ratio: 0.23, offset: -9.5, scale: 13 },
      { asset: `${root}/barrierWall.glb`, ratio: 0.57, offset: 9.5, scale: 13 },
      { asset: `${root}/barrierWall.glb`, ratio: 0.59, offset: 9.5, scale: 13 },
    ];
    if (quality === "low") return core.slice(0, 7);
    if (quality === "balanced") return core.slice(0, 12);
    return core;
  }, [quality]);

  return <group>{placements.map((placement, index) => <CircuitProp key={`${placement.asset}-${index}`} geometry={geometry} mapping={mapping} placement={placement} />)}</group>;
}

const TRAIL_LENGTH = 140;

interface TrailHandle {
  push: (x: number, z: number, speed: number | null) => void;
  clear: () => void;
}

function SpeedTrail({ handleRef }: { handleRef: { current: TrailHandle | null } }) {
  const [line, setLine] = useState<THREE.Line | null>(null);

  useEffect(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL_LENGTH * 3);
    const colors = new Float32Array(TRAIL_LENGTH * 3);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82 });
    const object = new THREE.Line(geometry, material);
    object.frustumCulled = false;
    const points: Array<{ x: number; z: number; speed: number }> = [];
    const color = new THREE.Color();
    handleRef.current = {
      push(x, z, speed) {
        const last = points.at(-1);
        if (last && Math.hypot(last.x - x, last.z - z) < 0.8) return;
        points.push({ x, z, speed: speed ?? 0 });
        if (points.length > TRAIL_LENGTH) points.shift();
        const positionAttribute = geometry.getAttribute("position") as THREE.BufferAttribute;
        const colorAttribute = geometry.getAttribute("color") as THREE.BufferAttribute;
        points.forEach((point, index) => {
          const age = index / Math.max(1, points.length - 1);
          const value = THREE.MathUtils.clamp((point.speed - 60) / 280, 0, 1);
          color.setHSL((1 - value) * 0.62, 0.92, 0.55);
          positionAttribute.setXYZ(index, point.x, 0.28, point.z);
          colorAttribute.setXYZ(index, color.r * age, color.g * age, color.b * age);
        });
        geometry.setDrawRange(0, points.length);
        positionAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
      },
      clear() {
        points.length = 0;
        geometry.setDrawRange(0, 0);
      },
    };
    setLine(object);
    return () => {
      handleRef.current = null;
      geometry.dispose();
      material.dispose();
    };
  }, [handleRef]);

  return line ? <primitive object={line} /> : null;
}

function SafetyCarBody() {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[4.6, 0.85, 1.9]} />
        <meshStandardMaterial color="#d7d9dc" roughness={0.3} metalness={0.55} />
      </mesh>
      <mesh position={[0.15, 1.12, 0]}>
        <boxGeometry args={[2.5, 0.55, 1.68]} />
        <meshStandardMaterial color="#333b46" roughness={0.3} metalness={0.35} />
      </mesh>
      {([1.55, -1.55] as const).flatMap((x) => ([0.95, -0.95] as const).map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.34, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.34, 0.34, 0.3, 10]} />
          <meshStandardMaterial color="#15181f" roughness={0.88} />
        </mesh>
      )))}
    </group>
  );
}

function ReplayFleet({
  geometry,
  mapping,
  drivers,
  currentFrame,
  nextFrame,
  playheadTimeRef,
  estimatedLapDuration,
  focusedCode,
  cameraMode,
  isPlaying,
  seekToken,
  reducedMotion,
  onDriverSelect,
  onShotStatus,
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
  isPlaying: boolean;
  seekToken: number;
  reducedMotion: boolean;
  onDriverSelect?: ReplayScene3DProps["onDriverSelect"];
  onShotStatus: (status: ShotStatus) => void;
}) {
  const { scene } = useLoader(GLTFLoader, FORMULA_CAR_URL) as { scene: THREE.Group };
  const parts = useMemo<FleetPart[]>(() => {
    scene.updateMatrixWorld(true);
    const result: FleetPart[] = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      result.push({
        key: object.name || `part-${result.length}`,
        geometry: object.geometry,
        nodeMatrix: object.matrixWorld.clone(),
        body: object.name === "body",
        wheel: object.name !== "body",
      });
    });
    return result;
  }, [scene]);
  const normalization = useMemo(() => new THREE.Matrix4()
    .makeScale(CAR_SCALE, CAR_SCALE, CAR_SCALE)
    .multiply(new THREE.Matrix4().makeTranslation(
      -CAR_SOURCE_CENTER.x,
      -CAR_SOURCE_CENTER.y,
      -CAR_SOURCE_CENTER.z,
    )), []);
  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.34,
    metalness: 0.32,
    vertexColors: true,
  }), []);
  const wheelMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#111318",
    roughness: 0.88,
    metalness: 0.05,
  }), []);
  const wingMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#171b22", roughness: 0.42, metalness: 0.25 }), []);
  const brakeMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ff4b1f", transparent: true, opacity: 0.88 }), []);
  const ringMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7, vertexColors: true }), []);
  const partRefs = useRef<Map<string, THREE.InstancedMesh>>(new Map());
  const flapRef = useRef<THREE.InstancedMesh>(null);
  const tyreRingRef = useRef<THREE.InstancedMesh>(null);
  const brakeRef = useRef<THREE.InstancedMesh>(null);
  const focusRingRef = useRef<THREE.Mesh>(null);
  const safetyCarRef = useRef<THREE.Group>(null);
  const safetyBeaconRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<THREE.Group>(null);
  const labelTextRef = useRef<{ text?: string } | null>(null);
  const interpolatorRef = useRef<ReplayInterpolator | null>(null);
  const directorRef = useRef<DirectorState>(createDirectorState(typeof performance === "undefined" ? 0 : performance.now()));
  const previousFocusRef = useRef(focusedCode);
  const trailRef = useRef<TrailHandle | null>(null);
  const cameraTargetRef = useRef(new THREE.Vector3());
  const wheelSpinRef = useRef<Map<string, number>>(new Map());
  const lastStatusRef = useRef("");
  const { camera } = useThree();
  const carObject = useMemo(() => new THREE.Object3D(), []);
  const localObject = useMemo(() => new THREE.Object3D(), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const zeroMatrix = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const tracksideAnchors = useMemo(() => Array.from({ length: 8 }, (_, index) => {
    const placement = worldPlacement(geometry, mapping, index / 8, index % 2 === 0 ? 31 : -31, 13 + (index % 3) * 2);
    return new THREE.Vector3(...placement.position);
  }), [geometry, mapping]);

  useEffect(() => {
    interpolatorRef.current = createReplayInterpolator(geometry, estimatedLapDuration);
  }, [estimatedLapDuration, geometry]);

  useEffect(() => {
    if (previousFocusRef.current !== focusedCode) {
      trailRef.current?.clear();
      previousFocusRef.current = focusedCode;
    }
  }, [focusedCode]);

  useEffect(() => () => {
    bodyMaterial.dispose();
    wheelMaterial.dispose();
    wingMaterial.dispose();
    brakeMaterial.dispose();
    ringMaterial.dispose();
  }, [bodyMaterial, brakeMaterial, ringMaterial, wheelMaterial, wingMaterial]);

  useFrame((_, delta) => {
    const interpolator = interpolatorRef.current;
    if (!interpolator) return;
    interpolator.snap(currentFrame, nextFrame);
    const states = interpolator.sample(playheadTimeRef.current);
    const worldByCode = new Map<string, THREE.Vector3>();
    const headingByCode = new Map<string, number>();
    let leaderCode: string | null = null;
    let leaderPosition = Number.MAX_SAFE_INTEGER;
    for (const state of states.values()) {
      if (state.position !== null && state.position < leaderPosition) {
        leaderPosition = state.position;
        leaderCode = state.driverCode;
      }
    }
    const focusCode = focusedCode ?? leaderCode;

    for (let driverIndex = 0; driverIndex < drivers.length; driverIndex += 1) {
      const driver = drivers[driverIndex];
      const state = states.get(driver.driverCode);
      if (!state) {
        for (const part of parts) partRefs.current.get(part.key)?.setMatrixAt(driverIndex, zeroMatrix);
        flapRef.current?.setMatrixAt(driverIndex, zeroMatrix);
        for (let wheelIndex = 0; wheelIndex < 4; wheelIndex += 1) tyreRingRef.current?.setMatrixAt(driverIndex * 4 + wheelIndex, zeroMatrix);
        for (let brakeIndex = 0; brakeIndex < 2; brakeIndex += 1) brakeRef.current?.setMatrixAt(driverIndex * 2 + brakeIndex, zeroMatrix);
        continue;
      }
      const [x, , z] = mapping.toWorld(state.point.x, state.point.y);
      const world = new THREE.Vector3(x, 0, z);
      worldByCode.set(driver.driverCode, world);
      headingByCode.set(driver.driverCode, state.heading);
      carObject.position.copy(world);
      carObject.rotation.set(0, state.heading + Math.PI / 2, 0);
      carObject.scale.setScalar(1);
      carObject.updateMatrix();
      const spin = (wheelSpinRef.current.get(driver.driverCode) ?? 0) + ((state.speed ?? 0) / 3.6 / 0.34) * delta;
      wheelSpinRef.current.set(driver.driverCode, spin);

      for (const part of parts) {
        const mesh = partRefs.current.get(part.key);
        if (!mesh) continue;
        matrix.copy(carObject.matrix).multiply(normalization).multiply(part.nodeMatrix);
        if (part.wheel) matrix.multiply(new THREE.Matrix4().makeRotationZ(-spin));
        mesh.setMatrixAt(driverIndex, matrix);
        if (part.body) mesh.setColorAt(driverIndex, new THREE.Color(driver.teamColor || "#9ca3af"));
      }

      localObject.position.set(0, 1.02, -2.05);
      localObject.rotation.set((state.drs ?? 0) >= 10 ? -0.52 : -0.08, 0, 0);
      localObject.scale.set(1, 1, 1);
      localObject.updateMatrix();
      flapRef.current?.setMatrixAt(driverIndex, matrix.copy(carObject.matrix).multiply(localObject.matrix));

      const tyreColor = new THREE.Color(COMPOUND_COLORS[(state.tyreCompound ?? "").toUpperCase()] ?? "#8f98a8");
      const wheelPositions = [
        [-0.82, 0.35, 1.45],
        [0.82, 0.35, 1.45],
        [-0.82, 0.35, -1.3],
        [0.82, 0.35, -1.3],
      ];
      wheelPositions.forEach(([wheelX, wheelY, wheelZ], wheelIndex) => {
        localObject.position.set(wheelX, wheelY, wheelZ);
        localObject.rotation.set(0, Math.PI / 2, 0);
        localObject.scale.setScalar(1);
        localObject.updateMatrix();
        const instance = driverIndex * 4 + wheelIndex;
        tyreRingRef.current?.setMatrixAt(instance, matrix.copy(carObject.matrix).multiply(localObject.matrix));
        tyreRingRef.current?.setColorAt(instance, tyreColor);
      });

      const braking = (state.brake ?? 0) > 30;
      [-0.68, 0.68].forEach((brakeX, brakeIndex) => {
        localObject.position.set(brakeX, 0.36, -1.28);
        localObject.rotation.set(0, 0, 0);
        localObject.scale.setScalar(braking ? 1 : 0);
        localObject.updateMatrix();
        brakeRef.current?.setMatrixAt(driverIndex * 2 + brakeIndex, matrix.copy(carObject.matrix).multiply(localObject.matrix));
      });

      if (driver.driverCode === focusCode) {
        trailRef.current?.push(x, z, state.speed);
        if (labelRef.current) {
          labelRef.current.visible = true;
          labelRef.current.position.set(x, 3.5, z);
        }
        if (labelTextRef.current) {
          const position = state.position === null ? "" : `P${state.position}  `;
          const speed = state.speed === null ? "" : `  ${Math.round(state.speed)} KM/H`;
          labelTextRef.current.text = `${position}${driver.driverCode}${speed}`;
        }
        if (focusRingRef.current) {
          focusRingRef.current.visible = true;
          focusRingRef.current.position.set(x, 0.12, z);
        }
      }
    }

    for (const part of parts) {
      const mesh = partRefs.current.get(part.key);
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (part.body && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (const mesh of [flapRef.current, tyreRingRef.current, brakeRef.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (!focusCode || !worldByCode.has(focusCode)) {
      if (labelRef.current) labelRef.current.visible = false;
      if (focusRingRef.current) focusRingRef.current.visible = false;
    }

    const safetyCar = currentFrame?.safetyCar;
    if (safetyCarRef.current) {
      if (safetyCar && safetyCar.phase !== "none" && safetyCar.x !== null && safetyCar.y !== null) {
        const [x, , z] = mapping.toWorld(safetyCar.x, safetyCar.y);
        safetyCarRef.current.visible = true;
        safetyCarRef.current.position.set(x, 0, z);
        if (safetyBeaconRef.current?.material instanceof THREE.MeshBasicMaterial) {
          const flash = reducedMotion ? 0.6 : (Math.sin(playheadTimeRef.current * 9) + 1) * 0.5;
          safetyBeaconRef.current.material.color.setRGB(1, 0.35 + flash * 0.55, 0.04);
        }
      } else {
        safetyCarRef.current.visible = false;
      }
    }

    if (!focusCode) return;
    const focusState = states.get(focusCode);
    const focusWorld = worldByCode.get(focusCode);
    if (!focusState || !focusWorld) return;
    const directorStates: ReplayCarState[] = Array.from(states.values()).map((state) => ({
      code: state.driverCode,
      brake: state.brake ?? 0,
      drs: state.drs ?? 0,
      position: state.position ?? 99,
      interval: state.interval ?? Number.POSITIVE_INFINITY,
      arcDistance: state.arcDistance,
    }));
    const focusDirectorState = directorStates.find((state) => state.code === focusCode) ?? directorStates[0];
    if (!focusDirectorState) return;
    const trackStatus = (currentFrame?.trackStatus ?? "").toUpperCase();
    directorRef.current = selectDirectorShot({
      mode: cameraMode,
      now: performance.now(),
      isPlaying,
      reducedMotion,
      seekToken,
      yellow: trackStatus.includes("YELLOW") || trackStatus.includes("VSC") || trackStatus.includes("SC"),
      safetyCarActive: Boolean(safetyCar && safetyCar.phase !== "none"),
      focus: focusDirectorState,
      states: directorStates,
    }, directorRef.current);
    const shot = directorRef.current;
    const targetPoints = shot.targetCodes.map((code) => worldByCode.get(code)).filter((point): point is THREE.Vector3 => Boolean(point));
    const targetWorld = targetPoints.length
      ? targetPoints.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / targetPoints.length)
      : focusWorld.clone();
    const heading = headingByCode.get(focusCode) ?? focusState.heading;
    let desiredPosition = camera.position.clone();
    let desiredTarget = targetWorld.clone().add(new THREE.Vector3(0, 0.8, 0));
    let targetFov = 46;

    if (shot.shotKind === "follow") {
      const back = new THREE.Vector3(-Math.cos(heading), 0, Math.sin(heading));
      const side = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      desiredPosition = focusWorld.clone().add(back.multiplyScalar(17)).add(side.multiplyScalar(2.2)).add(new THREE.Vector3(0, 6.2, 0));
      desiredTarget = focusWorld.clone().add(new THREE.Vector3(Math.cos(heading) * 5, 1, -Math.sin(heading) * 5));
      targetFov = 43;
    } else if (shot.shotKind === "trackside") {
      desiredPosition = tracksideAnchors.reduce((best, anchor) => (
        anchor.distanceToSquared(targetWorld) < best.distanceToSquared(targetWorld) ? anchor : best
      ), tracksideAnchors[0]).clone();
      targetFov = targetPoints.length > 1 ? 52 : 46;
    } else if (["paused", "seek", "reduced-motion"].includes(shot.reason)) {
      desiredPosition = new THREE.Vector3(mapping.radius * 0.55, mapping.radius * 0.72, mapping.radius * 0.55);
      desiredTarget = new THREE.Vector3(0, 0, 0);
      targetFov = 48;
    } else {
      desiredPosition = targetWorld.clone().add(new THREE.Vector3(mapping.radius * 0.08, Math.min(58, mapping.radius * 0.14), mapping.radius * 0.08));
      targetFov = targetPoints.length > 1 ? 52 : 48;
    }

    if (cameraMode !== "orbit") {
      const damping = reducedMotion ? 1 : 1 - Math.exp(-delta * (shot.shotKind === "trackside" ? 3 : 4.2));
      camera.position.lerp(desiredPosition, damping);
      cameraTargetRef.current.lerp(desiredTarget, damping);
      camera.lookAt(cameraTargetRef.current);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, damping);
        camera.updateProjectionMatrix();
      }
    }

    const statusKey = `${cameraMode}-${shot.shotKind}-${shot.reason}-${shot.targetCodes.join("-")}`;
    if (statusKey !== lastStatusRef.current) {
      lastStatusRef.current = statusKey;
      const cameraLabel = cameraMode === "director"
        ? `${shot.shotKind[0].toUpperCase()}${shot.shotKind.slice(1)} shot`
        : `${cameraMode[0].toUpperCase()}${cameraMode.slice(1)} camera`;
      onShotStatus({
        camera: cameraLabel,
        detail: shot.reason.replaceAll("-", " "),
        target: shot.targetCodes.join(" + ") || focusCode,
      });
    }
  });

  const selectDriver = (instanceId: number | undefined, append: boolean) => {
    if (typeof instanceId !== "number") return;
    onDriverSelect?.(drivers[instanceId]?.driverCode ?? null, append);
  };

  return (
    <group>
      {parts.map((part) => (
        <instancedMesh
          key={part.key}
          ref={(node) => {
            if (node) {
              node.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
              partRefs.current.set(part.key, node);
            } else {
              partRefs.current.delete(part.key);
            }
          }}
          args={[part.geometry, part.body ? bodyMaterial : wheelMaterial, drivers.length]}
          onClick={part.body ? (event) => {
            event.stopPropagation();
            selectDriver(event.instanceId, event.nativeEvent.shiftKey || event.nativeEvent.ctrlKey || event.nativeEvent.metaKey);
          } : undefined}
        />
      ))}
      <instancedMesh ref={flapRef} args={[undefined, wingMaterial, drivers.length]}>
        <boxGeometry args={[1.5, 0.08, 0.38]} />
      </instancedMesh>
      <instancedMesh ref={tyreRingRef} args={[undefined, ringMaterial, drivers.length * 4]}>
        <torusGeometry args={[0.35, 0.035, 7, 18]} />
      </instancedMesh>
      <instancedMesh ref={brakeRef} args={[undefined, brakeMaterial, drivers.length * 2]}>
        <sphereGeometry args={[0.18, 8, 8]} />
      </instancedMesh>
      <mesh ref={focusRingRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.1, 3.35, 36]} />
        <meshBasicMaterial color="#ff8a3d" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <group ref={safetyCarRef} visible={false}>
        <SafetyCarBody />
        <mesh ref={safetyBeaconRef} position={[0.15, 1.58, 0]}>
          <boxGeometry args={[0.9, 0.22, 0.5]} />
          <meshBasicMaterial color="#ff9a00" />
        </mesh>
        <Billboard position={[0, 3.1, 0]}>
          <Text fontSize={1.7} color="#ffe2a3" outlineWidth={0.08} outlineColor="#111318">SAFETY CAR</Text>
        </Billboard>
      </group>
      {!reducedMotion ? <SpeedTrail handleRef={trailRef} /> : null}
      <group ref={labelRef} visible={false}>
        <Billboard>
          <Text
            ref={labelTextRef as never}
            fontSize={1.7}
            color="#ffffff"
            outlineWidth={0.09}
            outlineColor="#111318"
            anchorX="center"
            anchorY="bottom"
          >
            {""}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

function ReplayWorld({
  geometry,
  mapping,
  quality,
  cameraMode,
  focusedCode,
  reducedMotion,
  onShotStatus,
  ...props
}: Omit<ReplayScene3DProps, "trackPath" | "onUnavailable"> & {
  geometry: TrackGeometry;
  mapping: WorldMapping;
  quality: "low" | "balanced" | "high";
  cameraMode: CameraMode;
  focusedCode: string | null;
  reducedMotion: boolean;
  onShotStatus: (status: ShotStatus) => void;
}) {
  const yellow = (props.currentFrame?.trackStatus ?? "").toUpperCase().match(/YELLOW|VSC|SC/);
  const trackTotalLength = props.trackMetadata?.length || geometry.totalLength;
  return (
    <>
      <color attach="background" args={[yellow ? "#b99865" : "#8eb4cf"]} />
      <fog attach="fog" args={[yellow ? "#b69a70" : "#98b4c6", mapping.radius * 0.9, mapping.radius * 3.1]} />
      <ambientLight intensity={0.52} color="#dcecff" />
      <hemisphereLight args={[yellow ? "#ffe3a3" : "#c7e7ff", "#30412c", 1.05]} />
      <directionalLight position={[mapping.radius * 0.45, mapping.radius * 0.8, mapping.radius * 0.2]} intensity={2.5} color="#fff2d2" />
      <Environment files={HDRI_URL} environmentIntensity={0.5} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <circleGeometry args={[mapping.radius * 2.8, 64]} />
        <meshStandardMaterial color="#415d3f" roughness={1} />
      </mesh>
      <TrackSurface geometry={geometry} mapping={mapping} />
      {props.trackMetadata?.corners?.length && props.showEvents ? (
        <>
          <Kerbs geometry={geometry} mapping={mapping} corners={props.trackMetadata.corners} trackTotalLength={trackTotalLength} />
          <CornerLabels geometry={geometry} mapping={mapping} corners={props.trackMetadata.corners} trackTotalLength={trackTotalLength} />
        </>
      ) : null}
      {props.showDrsZones && props.drsZones?.length ? (
        <DrsZoneStrips geometry={geometry} mapping={mapping} drsZones={props.drsZones} trackTotalLength={trackTotalLength} />
      ) : null}
      {props.showMarshalSectors && props.marshalSectors?.length && props.activeMarshalFlagBySector?.size ? (
        <MarshalFlags
          geometry={geometry}
          mapping={mapping}
          sectors={props.marshalSectors}
          activeFlags={props.activeMarshalFlagBySector}
          trackTotalLength={trackTotalLength}
        />
      ) : null}
      {props.pitPulses?.length ? <PitPulseMarkers geometry={geometry} mapping={mapping} pulses={props.pitPulses} clockSeconds={props.clockSeconds} /> : null}
      <TelemetryHeatmap mapping={mapping} samples={props.heatmapSamples} channel={props.heatmapChannel} />
      <CircuitProps geometry={geometry} mapping={mapping} quality={quality} />
      <ReplayFleet
        geometry={geometry}
        mapping={mapping}
        drivers={props.drivers}
        currentFrame={props.currentFrame}
        nextFrame={props.nextFrame}
        playheadTimeRef={props.playheadTimeRef}
        estimatedLapDuration={props.estimatedLapDuration}
        focusedCode={focusedCode}
        cameraMode={cameraMode}
        isPlaying={props.isPlaying}
        seekToken={props.seekToken}
        reducedMotion={reducedMotion}
        onDriverSelect={props.onDriverSelect}
        onShotStatus={onShotStatus}
      />
      {cameraMode === "orbit" ? (
        <OrbitControls
          enableDamping={!reducedMotion}
          dampingFactor={0.08}
          maxPolarAngle={Math.PI * 0.48}
          minDistance={mapping.radius * 0.08}
          maxDistance={mapping.radius * 2.5}
          target={[0, 0, 0]}
        />
      ) : null}
    </>
  );
}

function AssetProgress() {
  const { active, progress } = useProgress();
  return active ? <div className="replay3d__loading" role="status">Building broadcast scene · {Math.round(progress)}%</div> : null;
}

function ReplayCanvasFallback() {
  return <div className="replay3d__empty">3D unavailable on this device; showing 2D track map.</div>;
}

function currentFocusCode(currentFrame: ReplayFrame | null, selectedDrivers: string[]) {
  if (selectedDrivers[0]) return selectedDrivers[0];
  let leader: ReplayFrame["drivers"][string] | null = null;
  for (const driver of Object.values(currentFrame?.drivers ?? {})) {
    if (!leader || driver.position < leader.position) leader = driver;
  }
  return leader?.driverCode ?? null;
}

function currentDriverState(currentFrame: ReplayFrame | null, code: string | null) {
  return code ? currentFrame?.drivers[code] ?? null : null;
}

export default function ReplayScene3D(props: ReplayScene3DProps) {
  const [cameraMode, setCameraMode] = useState<CameraMode>("director");
  const [dpr, setDpr] = useState(1.25);
  const [quality, setQuality] = useState<"low" | "balanced" | "high">("balanced");
  const [rendererReady, setRendererReady] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [shotStatus, setShotStatus] = useState<ShotStatus>({ camera: "Director camera", detail: "establishing", target: "leader" });
  const hostRef = useRef<HTMLDivElement>(null);
  const unavailableRef = useRef(props.onUnavailable);
  const geometry = useMemo(() => buildTrackGeometry(props.trackPath, 1000, 1000), [props.trackPath]);
  const mapping = useMemo(() => geometry ? buildWorldMapping(geometry) : null, [geometry]);
  const focusedCode = currentFocusCode(props.currentFrame, props.selectedDrivers);
  const focusedDriver = currentDriverState(props.currentFrame, focusedCode);

  useEffect(() => {
    unavailableRef.current = props.onUnavailable;
  }, [props.onUnavailable]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { rootMargin: "120px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const failTo2D = useCallback((message = "3D unavailable on this device; showing 2D track map.") => {
    unavailableRef.current?.(message);
  }, []);

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    setRendererReady(true);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      failTo2D("The 3D graphics context was lost; showing 2D track map.");
    }, { once: true });
  }, [failTo2D]);

  const updateShotStatus = useCallback((status: ShotStatus) => setShotStatus(status), []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!rendererReady) failTo2D("WebGL could not start; showing 2D track map.");
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [failTo2D, rendererReady]);

  if (!geometry || !mapping) {
    return <div className="replay3d__empty">Track path not available for 3D view.</div>;
  }

  const modes: Array<[CameraMode, string]> = [
    ["director", "Director"],
    ["follow", "Follow"],
    ["trackside", "Trackside"],
    ["helicopter", "Helicopter"],
    ["orbit", "Orbit"],
  ];
  const stateText = focusedDriver
    ? `${focusedCode} · P${focusedDriver.position}${focusedDriver.speed === null ? "" : ` · ${Math.round(focusedDriver.speed)} km/h`}`
    : "Leader feed";

  return (
    <div className="replay3d" ref={hostRef} data-quality={quality}>
      <div className="replay3d__camera-bar" role="group" aria-label="3D camera mode">
        {modes.map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={`replay3d__camera-button${cameraMode === mode ? " replay3d__camera-button--active" : ""}`}
            aria-pressed={cameraMode === mode}
            aria-label={`${label} camera`}
            onClick={() => setCameraMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="replay3d__broadcast" aria-hidden="true">
        <span className="replay3d__live-mark">REPLAY 3D</span>
        <span>{shotStatus.camera}</span>
        <strong>{shotStatus.target}</strong>
        <small>{shotStatus.detail}</small>
      </div>
      <div className="replay3d__lower-third">
        <span>{props.trackMetadata?.name ?? "Circuit reconstruction"}</span>
        <strong>{stateText}</strong>
        <small>{props.currentFrame?.lap ? `Lap ${props.currentFrame.lap}` : "Race replay"} · {props.currentFrame?.trackStatus || "GREEN"} · {quality}</small>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {`${shotStatus.camera}. Following ${shotStatus.target}. ${shotStatus.detail}.`}
      </div>
      <AssetProgress />
      <Replay3DErrorBoundary onError={failTo2D}>
        <Canvas
          aria-label="Interactive 3D race replay"
          role="application"
          camera={{
            position: [mapping.radius * 0.6, mapping.radius * 0.7, mapping.radius * 0.6],
            fov: 48,
            near: 0.35,
            far: mapping.radius * 8,
          }}
          dpr={dpr}
          frameloop={!isVisible ? "never" : props.isPlaying ? "always" : "demand"}
          fallback={<ReplayCanvasFallback />}
          gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
          onCreated={handleCreated}
        >
          <PerformanceMonitor
            onIncline={() => {
              setDpr(1.5);
              setQuality("high");
            }}
            onDecline={() => {
              setDpr(1);
              setQuality("low");
            }}
            onFallback={() => {
              setDpr(1);
              setQuality("low");
            }}
          >
            <Suspense fallback={null}>
              <ReplayWorld
                {...props}
                geometry={geometry}
                mapping={mapping}
                quality={quality}
                cameraMode={cameraMode}
                focusedCode={focusedCode}
                reducedMotion={reducedMotion}
                onShotStatus={updateShotStatus}
              />
            </Suspense>
          </PerformanceMonitor>
        </Canvas>
      </Replay3DErrorBoundary>
      <p className="replay3d__hint">
        {cameraMode === "orbit" ? "Drag to rotate · pinch or wheel to zoom" : "Choose Orbit for manual inspection"}
      </p>
    </div>
  );
}
