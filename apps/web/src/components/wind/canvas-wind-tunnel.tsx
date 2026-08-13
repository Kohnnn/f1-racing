"use client";

/**
 * Wind Tunnel V5 (rewritten 2026-05-24).
 *
 * Mode switcher: silhouette source can be procedural (always-an-F1-shape),
 * SVG (hand-curated per constructor), or GLB-derived (column-envelope).
 * Constructors with curated side profiles default to the model-backed
 * SVG profile; procedural remains the fallback for constructors without
 * a curated silhouette.
 *
 * Renderer polish:
 * - Dark glossy paint with rim-light and team-colour accent stripe.
 * - Ground shadow ellipse beneath the body.
 * - Animated rolling-road dashes whose speed scales with airspeed.
 * - Ribbon / Technical / Smoke display modes, with Ribbon as the default
 *   instrument view so the airflow stays sparse and shaped by the car.
 * - Frame-rate counter in the readout.
 * - Stage canvas height bumped to 460.
 */

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { ensureModelViewerLoaded } from "@/lib/model-viewer-loader";
import { buildAirfoilSilhouette, buildProceduralSilhouette } from "./procedural-silhouette";

type GroundMode = "rolling" | "fixed";
type WheelMode = "rotating" | "stationary";
type SilhouetteMode = "procedural" | "airfoil" | "svg" | "glb";
type FlowView = "ribbon" | "technical" | "diagnostic" | "smoke";
type SolverState = "warming" | "stabilizing" | "settled" | "stale";
type WakeZoneKind = "rearWing" | "diffuser";
type QualityPreset = "low" | "medium" | "high";

interface WindTunnelControls {
  airspeed: number;
  yawDeg: number;
  airfoilAngleDeg: number;
  windSourceY: number;
  rideHeightMm: number;
  drsOpen: boolean;
  groundMode: GroundMode;
  wheelMode: WheelMode;
  particles: number;
  overlayMode: FlowView;
  silhouetteMode: SilhouetteMode;
  probeEnabled: boolean;
  quality: QualityPreset;
  vectorsOn: boolean;
  separationOn: boolean;
}

const DEFAULT_CONTROLS: WindTunnelControls = {
  airspeed: 80,
  yawDeg: 0,
  airfoilAngleDeg: 4,
  windSourceY: 0.48,
  rideHeightMm: 28,
  drsOpen: false,
  groundMode: "rolling",
  wheelMode: "rotating",
  particles: 96,
  overlayMode: "ribbon",
  silhouetteMode: "procedural",
  probeEnabled: true,
  quality: "medium",
  vectorsOn: false,
  separationOn: false,
};

/**
 * Quality presets bundle the particle count (the main per-frame render cost)
 * into one control. Picking a preset overrides the particle slider; the slider
 * still works for fine-tuning within the chosen budget.
 */
const QUALITY_PRESETS: Record<QualityPreset, { particles: number; label: string }> = {
  low: { particles: 48, label: "Low" },
  medium: { particles: 96, label: "Medium" },
  high: { particles: 200, label: "High" },
};

function buildDefaultControls(constructorSlug?: string): WindTunnelControls {
  return {
    ...DEFAULT_CONTROLS,
    silhouetteMode: constructorSlug && CURATED_SVG_SILHOUETTES.has(constructorSlug) ? "svg" : "procedural",
  };
}

const STAGE_WIDTH = 1024;
const STAGE_HEIGHT = 460;
const SOLVER_NX = 320;
const SOLVER_NY = 144;
const STREAMLINE_Y_GAIN = 0.98;
const TRAIL_LENGTH = 16;

const INLET_MARKERS = [0.20, 0.30, 0.40, 0.52, 0.64, 0.76, 0.86];
const STREAMLINE_SEEDS = [0.28, 0.36, 0.44, 0.52, 0.60, 0.68, 0.76, 0.84, 0.91];
const CURATED_SVG_SILHOUETTES = new Set([
  "fia-2026",
  "mclaren",
  "red-bull",
  "ferrari",
  "mercedes",
  "aston-martin",
  "alpine",
]);

const FLOW_VIEW_META: Record<FlowView, { label: string; description: string; low: string; high: string }> = {
  ribbon: {
    label: "Ribbon",
    description: "Field streamlines",
    low: "calm",
    high: "fast",
  },
  technical: {
    label: "Technical",
    description: "Sparse vectors + pressure bands",
    low: "low Cp",
    high: "high Cp",
  },
  diagnostic: {
    label: "Diagnostic",
    description: "Solver mask + wake zones",
    low: "geometry",
    high: "field",
  },
  smoke: {
    label: "Smoke",
    description: "Soft plume trails",
    low: "thin",
    high: "wake",
  },
};

interface ParticleState {
  x: number;
  y: number;
  age: number;
  trail: Float32Array;
  trailHead: number;
}

interface WheelArch {
  cx: number;
  cy: number;
  r: number;
}

interface WindProfileData {
  polygon: Array<[number, number]>;
  wheelArches: WheelArch[];
  aspect: number;
  details?: Array<{ kind: "halo" | "frontWing" | "floor" | "rearWing" | "stripe" | "sidepod" | "beamWing"; points: Array<[number, number]> }>;
  source: SilhouetteMode;
}

interface FlowComponentZone {
  kind: WakeZoneKind;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  strength: number;
}

interface FluidFrameState {
  u: Float32Array | null;
  v: Float32Array | null;
  speed: Float32Array | null;
  pressure: Float32Array | null;
  bodyDistance: Float32Array | null;
  bodyNormalX: Float32Array | null;
  bodyNormalY: Float32Array | null;
  bodyMask: Uint8Array | null;
  wheelMask: Uint8Array | null;
  wake: Float32Array | null;
  ground: Float32Array | null;
  componentZones: FlowComponentZone[];
  bodyInfluenceRadius: number;
  drag: number;
  lift: number;
  modeDragFactor: number;
  modeDragFactorStatic: number;
  ready: boolean;
  lastFrameAt: number;
  frameIndex: number;
}

const AERO_PROFILE_BY_CONSTRUCTOR: Record<string, { rearWingHeight: number; noseHeight: number; cd: number; cl: number }> = {
  "red-bull": { rearWingHeight: 0.30, noseHeight: 0.72, cd: 0.83, cl: -2.85 },
  mclaren: { rearWingHeight: 0.31, noseHeight: 0.73, cd: 0.82, cl: -2.78 },
  ferrari: { rearWingHeight: 0.33, noseHeight: 0.74, cd: 0.85, cl: -2.70 },
  mercedes: { rearWingHeight: 0.34, noseHeight: 0.71, cd: 0.86, cl: -2.66 },
  "aston-martin": { rearWingHeight: 0.35, noseHeight: 0.75, cd: 0.87, cl: -2.62 },
  alpine: { rearWingHeight: 0.34, noseHeight: 0.76, cd: 0.88, cl: -2.58 },
  "fia-2026": { rearWingHeight: 0.29, noseHeight: 0.70, cd: 0.76, cl: -2.12 },
};

const DEFAULT_AERO_PROFILE = { rearWingHeight: 0.32, noseHeight: 0.74, cd: 0.85, cl: -2.65 };

type BuiltSilhouette = ReturnType<typeof buildProceduralSilhouette>;

function createEmptyFluidFrame(): FluidFrameState {
  return {
    u: null,
    v: null,
    speed: null,
    pressure: null,
    bodyDistance: null,
    bodyNormalX: null,
    bodyNormalY: null,
    bodyMask: null,
    wheelMask: null,
    wake: null,
    ground: null,
    componentZones: [],
    bodyInfluenceRadius: 46,
    drag: 0,
    lift: 0,
    modeDragFactor: 1,
    modeDragFactorStatic: 1,
    ready: false,
    lastFrameAt: 0,
    frameIndex: 0,
  };
}

export interface CanvasWindTunnelProps {
  modelTitle: string;
  accentColor?: string;
  constructorSlug?: string;
  modelFile?: string;
  modelScale?: string;
}

export function CanvasWindTunnel({ modelTitle, accentColor = "#ff7a1a", constructorSlug, modelFile, modelScale }: CanvasWindTunnelProps) {
  const initialControls = useMemo(() => buildDefaultControls(constructorSlug), [constructorSlug]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const flowOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const isVisibleRef = useRef<boolean>(true);
  useEffect(() => {
    const node = canvasRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          isVisibleRef.current = entry.isIntersecting;
        }
      },
      { threshold: 0.05 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<ParticleState[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const controlsRef = useRef<WindTunnelControls>(initialControls);
  const forceBaselineRef = useRef<{ drag: number; lift: number } | null>(null);
  const solverStateRef = useRef<{
    changedAt: number;
    lastDrag: number | null;
    lastLift: number | null;
    stableSamples: number;
    state: SolverState;
  }>({ changedAt: 0, lastDrag: null, lastLift: null, stableSamples: 0, state: "warming" });
  const fluidFrameRef = useRef<FluidFrameState>(createEmptyFluidFrame());
  const hoverRef = useRef<{ active: boolean; nx: number; ny: number }>({ active: false, nx: 0, ny: 0 });
  const pausedRef = useRef(false);
  // Persistent, slowly-adapting Cp range so the surface pressure tint does not
  // flash/jump while the solver warms up. Each frame eases the live min/max
  // toward the running envelope instead of rescaling from scratch.
  const cpRangeRef = useRef<{ min: number; max: number } | null>(null);

  const [controls, setControls] = useState<WindTunnelControls>(() => initialControls);
  const [readout, setReadout] = useState<{ drag: number; lift: number; reynolds: number; live: boolean; fps: number; solverState: SolverState; modeDragDelta: number; modeDeltaNoise: boolean } | null>(null);
  const [forceBaseline, setForceBaseline] = useState<{ drag: number; lift: number } | null>(null);
  const [hoverData, setHoverData] = useState<{
    speed: number;
    speedMs: number;
    pressure: number;
    vorticity: number;
    distance: number | null;
    inside: boolean;
    nx: number;
    ny: number;
  } | null>(null);
  const [profile, setProfile] = useState<WindProfileData | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [modelViewerReady, setModelViewerReady] = useState(false);
  const hasCuratedSvg = Boolean(constructorSlug && CURATED_SVG_SILHOUETTES.has(constructorSlug));
  const solverSignature = useMemo(() => JSON.stringify([
    controls.airspeed,
    controls.yawDeg,
    controls.airfoilAngleDeg,
    controls.windSourceY,
    controls.drsOpen,
    controls.groundMode,
    controls.wheelMode,
    controls.silhouetteMode,
    constructorSlug,
  ]), [
    controls.airspeed,
    controls.yawDeg,
    controls.airfoilAngleDeg,
    controls.windSourceY,
    controls.drsOpen,
    controls.groundMode,
    controls.wheelMode,
    controls.silhouetteMode,
    constructorSlug,
  ]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    pausedRef.current = paused || reducedMotion;
  }, [paused, reducedMotion]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(query.matches);
      setPaused(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Keyboard shortcuts for the wind tunnel (focus-scoped to the panel root).
  // Space toggles pause; arrows nudge airspeed / yaw; R resets controls.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, select, textarea")) return;
      switch (event.key) {
        case " ":
        case "Spacebar":
          event.preventDefault();
          setPaused((prev) => !prev);
          break;
        case "ArrowUp":
          event.preventDefault();
          setControls((prev) => ({ ...prev, airspeed: Math.min(140, prev.airspeed + 5) }));
          break;
        case "ArrowDown":
          event.preventDefault();
          setControls((prev) => ({ ...prev, airspeed: Math.max(20, prev.airspeed - 5) }));
          break;
        case "ArrowRight":
          event.preventDefault();
          setControls((prev) => ({ ...prev, yawDeg: Math.min(15, prev.yawDeg + 1) }));
          break;
        case "ArrowLeft":
          event.preventDefault();
          setControls((prev) => ({ ...prev, yawDeg: Math.max(-15, prev.yawDeg - 1) }));
          break;
        case "r":
        case "R":
          event.preventDefault();
          setPaused(false);
          setControls(() => buildDefaultControls(constructorSlug));
          break;
        default:
          break;
      }
    }
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [constructorSlug]);

  useEffect(() => {
    setControls((prev) => ({
      ...prev,
      silhouetteMode: buildDefaultControls(constructorSlug).silhouetteMode,
    }));
  }, [constructorSlug]);

  useEffect(() => {
    if (!modelFile) {
      setModelViewerReady(false);
      return;
    }
    let cancelled = false;
    setModelViewerReady(false);
    ensureModelViewerLoaded(2)
      .then(() => {
        if (!cancelled) setModelViewerReady(true);
      })
      .catch(() => {
        if (!cancelled) setModelViewerReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelFile]);

  useEffect(() => {
    if (controls.silhouetteMode !== "svg" || hasCuratedSvg) return;
    setControls((prev) => (
      prev.silhouetteMode === "svg"
        ? { ...prev, silhouetteMode: "procedural" }
        : prev
    ));
  }, [controls.silhouetteMode, hasCuratedSvg]);

  useEffect(() => {
    forceBaselineRef.current = forceBaseline;
  }, [forceBaseline]);

  function resetSolverSettlement() {
    solverStateRef.current = {
      changedAt: performance.now(),
      lastDrag: null,
      lastLift: null,
      stableSamples: 0,
      state: "warming",
    };
    forceBaselineRef.current = null;
    setForceBaseline(null);
    cpRangeRef.current = null;
  }

  function updateSolverState(frame: typeof fluidFrameRef.current, now: number): SolverState {
    const ageMs = now - frame.lastFrameAt;
    if (!frame.ready) {
      solverStateRef.current.state = "warming";
      return "warming";
    }
    if (ageMs > 1000) {
      solverStateRef.current.state = "stale";
      return "stale";
    }

    const state = solverStateRef.current;
    if (now - state.changedAt < 900 || state.lastDrag == null || state.lastLift == null) {
      state.lastDrag = frame.drag;
      state.lastLift = frame.lift;
      state.state = "warming";
      return state.state;
    }

    const dragTolerance = Math.max(0.004, Math.abs(frame.drag) * 0.006);
    const liftTolerance = Math.max(0.002, Math.abs(frame.lift) * 0.02);
    const stable = Math.abs(frame.drag - state.lastDrag) <= dragTolerance
      && Math.abs(frame.lift - state.lastLift) <= liftTolerance;
    state.stableSamples = stable ? state.stableSamples + 1 : 0;
    state.lastDrag = frame.drag;
    state.lastLift = frame.lift;
    state.state = state.stableSamples >= 3 && now - state.changedAt > 2000 ? "settled" : "stabilizing";
    return state.state;
  }

  useEffect(() => {
    resetSolverSettlement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solverSignature]);

  // Load constructor-specific silhouette JSON. Mode switcher controls
  // whether we use the procedural F1 outline (default), a hand-curated SVG,
  // or the GLB-derived column-envelope polygon. Procedural always works
  // even when no GLB / SVG exists for the constructor.
  useEffect(() => {
    let cancelled = false;
    setProfileMissing(false);

    if (controls.silhouetteMode === "procedural") {
      const aeroProfile = AERO_PROFILE_BY_CONSTRUCTOR[constructorSlug ?? ""] ?? DEFAULT_AERO_PROFILE;
      const built = buildProceduralSilhouette({
        accentColor,
        drsOpen: controls.drsOpen,
        rearWingHeight: aeroProfile.rearWingHeight,
        noseHeight: aeroProfile.noseHeight,
      });
      setProfile(mapBuiltProfile(built, "procedural"));
      return;
    }

    if (controls.silhouetteMode === "airfoil") {
      const built = buildAirfoilSilhouette({ angleDeg: controls.airfoilAngleDeg });
      setProfile(mapBuiltProfile(built, "airfoil"));
      return;
    }

    if (controls.silhouetteMode === "svg" && constructorSlug) {
      if (!hasCuratedSvg) {
        setProfile(null);
        setProfileMissing(true);
        return;
      }
      // Try the curated SVG endpoint. We expect a polyline manifest file
      // sitting alongside the SVG: `/data/silhouettes/<slug>.json` with
      // `{ polygon, wheelArches, aspect, details }`. If absent, we mark
      // missing and the user must switch modes or add the file.
      setProfile(null);
      fetch(`/data/silhouettes/${constructorSlug}.json`)
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (cancelled) return;
          if (payload && Array.isArray(payload.polygon) && payload.polygon.length >= 16) {
            const aspect = typeof payload.aspect === "number" ? payload.aspect : computeAspect(payload.polygon);
            const polygon = controls.drsOpen
              ? applyDrsOpenToPolygon(payload.polygon as Array<[number, number]>)
              : (payload.polygon as Array<[number, number]>);
            setProfile({
              polygon: remapToTunnelFrame(polygon, aspect),
              wheelArches: remapWheelArches(payload.wheelArches, aspect),
              aspect,
              details: remapProfileDetails(payload.details, aspect),
              source: "svg",
            });
            setProfileMissing(false);
          } else {
            setProfileMissing(true);
          }
        })
        .catch(() => {
          if (!cancelled) setProfileMissing(true);
        });
      return () => { cancelled = true; };
    }

    if (controls.silhouetteMode === "glb" && constructorSlug) {
      setProfile(null);
      fetch(`/data/wind-profiles/${constructorSlug}.json`)
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (cancelled) return;
          if (payload && Array.isArray(payload.polygon) && payload.polygon.length >= 16) {
            const aspect = typeof payload.aspect === "number" ? payload.aspect : computeAspect(payload.polygon);
            setProfile({
              polygon: remapToTunnelFrame(payload.polygon, aspect),
              wheelArches: remapWheelArches(payload.wheelArches, aspect),
              aspect,
              source: "glb",
            });
            setProfileMissing(false);
          } else {
            setProfileMissing(true);
          }
        })
        .catch(() => {
          if (!cancelled) setProfileMissing(true);
        });
      return () => { cancelled = true; };
    }

    setProfileMissing(true);
    return () => { cancelled = true; };
  }, [controls.silhouetteMode, controls.drsOpen, controls.airfoilAngleDeg, constructorSlug, accentColor, hasCuratedSvg]);

  // Build the obstacle mask on the solver grid. Empty until the profile loads.
  const mask = useMemo(() => {
    if (!profile) return new Uint8Array(SOLVER_NX * SOLVER_NY);
    return buildMask(profile.polygon, profile.wheelArches, SOLVER_NX, SOLVER_NY);
  }, [profile]);

  const componentZones = useMemo(() => {
    if (!profile) return [];
    return buildFlowComponentZones(profile);
  }, [profile]);

  // Initialize / reinitialize the worker once we have a profile.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./fluid-solver.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return;
    }
    workerRef.current = worker;
    fluidFrameRef.current = createEmptyFluidFrame();
    worker.postMessage({ type: "init", airspeed: controls.airspeed, mask, wheels: profile.wheelArches, components: componentZones });

    function handleMessage(event: MessageEvent) {
      if (cancelled) return;
      const data = event.data;
      if (!data || data.type !== "frame") return;
      fluidFrameRef.current = {
        u: new Float32Array(data.u),
        v: new Float32Array(data.v),
        speed: new Float32Array(data.speed),
        pressure: new Float32Array(data.pressure),
        bodyDistance: data.bodyDistance ? new Float32Array(data.bodyDistance) : null,
        bodyNormalX: data.bodyNormalX ? new Float32Array(data.bodyNormalX) : null,
        bodyNormalY: data.bodyNormalY ? new Float32Array(data.bodyNormalY) : null,
        bodyMask: data.bodyMask ? new Uint8Array(data.bodyMask) : null,
        wheelMask: data.wheelMask ? new Uint8Array(data.wheelMask) : null,
        wake: data.wake ? new Float32Array(data.wake) : null,
        ground: data.ground ? new Float32Array(data.ground) : null,
        componentZones: normalizeDebugZones(data.components),
        bodyInfluenceRadius: Number.isFinite(data.bodyInfluenceRadius) ? data.bodyInfluenceRadius : 46,
        drag: data.drag ?? 0,
        lift: data.lift ?? 0,
        modeDragFactor: Number.isFinite(data.modeDragFactor) ? data.modeDragFactor : 1,
        modeDragFactorStatic: Number.isFinite(data.modeDragFactorStatic) ? data.modeDragFactorStatic : 1,
        ready: true,
        lastFrameAt: performance.now(),
        frameIndex: data.frameIndex ?? 0,
      };
    }
    worker.addEventListener("message", handleMessage);

    let stop = false;
    const tick = () => {
      if (stop || !worker) return;
      if (pausedRef.current) {
        window.setTimeout(tick, 80);
        return;
      }
      const latestControls = controlsRef.current;
      worker.postMessage({
        type: "tick",
        airspeed: latestControls.airspeed,
        yawDeg: latestControls.yawDeg,
        windSourceY: latestControls.windSourceY,
        drsOpen: latestControls.drsOpen,
        groundMode: latestControls.groundMode,
        wheelMode: latestControls.wheelMode,
        diagnostic: latestControls.overlayMode === "diagnostic",
        subSteps: 1,
      });
      window.setTimeout(tick, 32);
    };
    tick();

    return () => {
      cancelled = true;
      stop = true;
      worker?.removeEventListener("message", handleMessage);
      worker?.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Push fresh mask whenever the silhouette changes.
  useEffect(() => {
    if (workerRef.current) workerRef.current.postMessage({ type: "set-mask", mask, wheels: profile?.wheelArches ?? [], components: componentZones });
    fluidFrameRef.current = createEmptyFluidFrame();
    resetSolverSettlement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mask, profile, componentZones]);

  // Initialise the small smoke pool. Ribbon and Technical views use fixed
  // field samples instead of random particle noise. The quality preset caps
  // the particle budget; the slider fine-tunes within it.
  useEffect(() => {
    const budget = QUALITY_PRESETS[controls.quality].particles;
    const count = Math.min(controls.particles, budget);
    const list: ParticleState[] = [];
    for (let i = 0; i < count; i += 1) {
      const trail = new Float32Array(TRAIL_LENGTH * 2);
      const x = Math.random() * 0.05;
      const y = spawnParticleY(controls.windSourceY, 0.66);
      for (let t = 0; t < TRAIL_LENGTH; t += 1) {
        trail[t * 2] = x;
        trail[t * 2 + 1] = y;
      }
      list.push({ x, y, age: Math.random() * 200, trail, trailHead: 0 });
    }
    particlesRef.current = list;
  }, [controls.particles, controls.windSourceY, controls.quality]);

  // Pointer hover handlers for the live readout.
  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!controlsRef.current.probeEnabled) {
      hoverRef.current = { active: false, nx: 0, ny: 0 };
      setHoverData(null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    hoverRef.current = { active: true, nx, ny };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ny = (event.clientY - rect.top) / rect.height;
    setControls((prev) => ({ ...prev, windSourceY: Math.max(0.08, Math.min(0.88, ny)) }));
  }

  function handlePointerLeave() {
    hoverRef.current = { active: false, nx: 0, ny: 0 };
    setHoverData(null);
  }

  // Main render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const overlayCanvas = flowOverlayRef.current;
    const overlayCtx = overlayCanvas?.getContext("2d") ?? null;

    const animationStartedAt = performance.now();
    let frameTickCount = 0;
    let lastFpsRead = animationStartedAt;
    let measuredFps = 0;
    let lastForceRead = performance.now();
    let lastHoverRead = performance.now();
    const flowBounds = profile
      ? profile.polygon.reduce((bounds, [x, y]) => ({
        minX: Math.min(bounds.minX, x),
        maxX: Math.max(bounds.maxX, x),
        minY: Math.min(bounds.minY, y),
        maxY: Math.max(bounds.maxY, y),
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
      : null;

    function clearStage() {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(STAGE_WIDTH * dpr);
      const targetH = Math.round(STAGE_HEIGHT * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      if (overlayCanvas && (overlayCanvas.width !== targetW || overlayCanvas.height !== targetH)) {
        overlayCanvas.width = targetW;
        overlayCanvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (overlayCtx) {
        overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        overlayCtx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      }
      // Subtle vertical gradient for the tunnel volume.
      const grad = ctx.createLinearGradient(0, 0, 0, STAGE_HEIGHT);
      grad.addColorStop(0, "#08101e");
      grad.addColorStop(0.45, "#0a121f");
      grad.addColorStop(1, "#040611");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    }

    function drawAxes() {
      if (!ctx) return;
      ctx.strokeStyle = "rgba(120, 138, 168, 0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= STAGE_WIDTH; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, STAGE_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y <= STAGE_HEIGHT; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(STAGE_WIDTH, y + 0.5);
        ctx.stroke();
      }
    }

    function drawRollingRoad(elapsedMs: number) {
      if (!ctx) return;
      const floorY = STAGE_HEIGHT - 14;
      // Asphalt strip.
      const grad = ctx.createLinearGradient(0, floorY, 0, STAGE_HEIGHT);
      grad.addColorStop(0, "rgba(38, 46, 60, 0.92)");
      grad.addColorStop(1, "rgba(8, 11, 18, 0.94)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, floorY, STAGE_WIDTH, 14);
      // Animated dashes whose offset advances at airspeed proportional rate.
      ctx.fillStyle = "rgba(180, 200, 225, 0.42)";
      const dashSpacing = 38;
      const dashLen = 22;
      const speedFactor = controls.groundMode === "rolling" ? controls.airspeed : 0;
      const offset = (elapsedMs * speedFactor * 0.012) % dashSpacing;
      for (let x = -offset; x < STAGE_WIDTH; x += dashSpacing) {
        ctx.fillRect(x, floorY + 5, dashLen, 2);
      }
      // Floor highlight rim.
      ctx.fillStyle = "rgba(160, 180, 220, 0.12)";
      ctx.fillRect(0, floorY - 1, STAGE_WIDTH, 1);
    }

    function clamp(value: number, min: number, max: number) {
      return Math.max(min, Math.min(max, value));
    }

    function clampFlowY(value: number) {
      return clamp(value, 0.04, 0.94);
    }

    function sampleField(nx: number, ny: number) {
      const frame = fluidFrameRef.current;
      if (frame.ready && frame.u && frame.v) {
        const gx = clamp(nx * (SOLVER_NX - 1), 0, SOLVER_NX - 1);
        const gy = clamp(ny * (SOLVER_NY - 1), 0, SOLVER_NY - 1);
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const x1 = Math.min(SOLVER_NX - 1, x0 + 1);
        const y1 = Math.min(SOLVER_NY - 1, y0 + 1);
        const tx = gx - x0;
        const ty = gy - y0;
        const i00 = y0 * SOLVER_NX + x0;
        const i10 = y0 * SOLVER_NX + x1;
        const i01 = y1 * SOLVER_NX + x0;
        const i11 = y1 * SOLVER_NX + x1;
        const mix = (values: Float32Array | null | undefined, fallback: number) => {
          if (!values) return fallback;
          const a = values[i00] * (1 - tx) + values[i10] * tx;
          const b = values[i01] * (1 - tx) + values[i11] * tx;
          return a * (1 - ty) + b * ty;
        };
        const fu = mix(frame.u, 0);
        const fv = mix(frame.v, 0);
        return {
          u: fu,
          v: fv,
          speed: mix(frame.speed, Math.hypot(fu, fv)),
          pressure: mix(frame.pressure, 0),
        };
      }
      return null;
    }

    function streamlineSeeds() {
      const rakeShift = (controls.windSourceY - 0.48) * 0.18;
      return STREAMLINE_SEEDS.map((seed) => clampFlowY(seed + rakeShift));
    }

    function traceRibbonPath(laneY: number) {
      const yawRad = (controls.yawDeg * Math.PI) / 180;
      const points: Array<{ x: number; y: number; speed: number }> = [];
      let x = -0.035;
      let y = clampFlowY(laneY);
      const stepBase = 0.0068 + Math.min(0.0026, controls.airspeed / 52000);

      for (let i = 0; i < 190; i += 1) {
        if (x >= 0 && x <= 1 && pointInsideProfile(x, y)) break;
        const sample = sampleField(x, y);
        const speed = sample?.speed ?? 1;
        points.push({ x, y, speed });
        if (x > 1.06 || y < -0.04 || y > 1.04) break;

        const u = sample ? sample.u : Math.cos(yawRad);
        const v = sample ? sample.v : Math.sin(yawRad);
        const magnitude = Math.max(0.045, Math.hypot(u, v));
        if (sample && magnitude <= 0.055 && x > 0.12) break;
        const localStep = stepBase + Math.min(0.006, Math.max(0, speed) * 0.0025);
        const nextX = x + (u / magnitude) * localStep;
        const nextY = clampFlowY(y + (v / magnitude) * localStep * STREAMLINE_Y_GAIN);
        if (segmentHitsProfile(x, y, nextX, nextY)) break;
        x = nextX;
        y = nextY;
      }
      return points;
    }

    function strokeStreamline(
      target: CanvasRenderingContext2D,
      points: Array<{ x: number; y: number; speed: number }>,
      laneIndex: number,
      elapsedMs: number,
      overlay = false,
    ) {
      if (points.length < 2) return;
      const avgSpeed = points.reduce((total, point) => total + Math.max(0, Math.min(1.8, point.speed)), 0) / points.length;
      const speedTone = Math.max(0, Math.min(1, avgSpeed * 0.58));
      const passes = overlay ? 2 : 3;
      for (let pass = 0; pass < passes; pass += 1) {
        const glowPass = pass === 0;
        const corePass = pass === passes - 1;
        const alpha = glowPass
          ? (overlay ? 0.030 : 0.052) + speedTone * 0.035
          : corePass
            ? 0.18 + speedTone * 0.16
            : 0.16 + speedTone * 0.12;
        target.strokeStyle = glowPass
          ? `rgba(45, 141, 255, ${alpha.toFixed(3)})`
          : corePass
            ? `rgba(232, 249, 255, ${alpha.toFixed(3)})`
            : `rgba(${Math.round(102 + speedTone * 86)}, ${Math.round(196 + speedTone * 34)}, 255, ${alpha.toFixed(3)})`;
        target.lineWidth = glowPass ? (overlay ? 4.8 : 8.5) : corePass ? (overlay ? 0.9 : 1.1) : 2.0;
        target.setLineDash([]);
        target.beginPath();
        let drawing = false;
        for (const point of points) {
          if (pointInsideProfile(point.x, point.y)) {
            if (drawing) target.stroke();
            drawing = false;
            target.beginPath();
            continue;
          }
          const px = point.x * STAGE_WIDTH;
          const py = point.y * STAGE_HEIGHT;
          if (!drawing) {
            target.moveTo(px, py);
            drawing = true;
          } else {
            target.lineTo(px, py);
          }
        }
        if (drawing) target.stroke();
      }

      const beadT = (elapsedMs * controls.airspeed * 0.000045 + laneIndex * 0.113) % 1;
      const bead = points[Math.max(0, Math.min(points.length - 1, Math.floor(beadT * (points.length - 1))))];
      if (bead && !pointInsideProfile(bead.x, bead.y)) {
        target.fillStyle = `rgba(220, 248, 255, ${(0.18 + speedTone * 0.16).toFixed(3)})`;
        target.beginPath();
        target.arc(bead.x * STAGE_WIDTH, bead.y * STAGE_HEIGHT, overlay ? 1.7 : 2.2, 0, Math.PI * 2);
        target.fill();
      }
    }

    function drawRibbonFlow(elapsedMs: number) {
      if (!ctx || controls.overlayMode !== "ribbon") return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalCompositeOperation = "lighter";

      streamlineSeeds().forEach((laneY, laneIndex) => {
        const points = traceRibbonPath(laneY);
        strokeStreamline(ctx, points, laneIndex, elapsedMs);
      });
      ctx.restore();
    }

    function pointInsideProfile(nx: number, ny: number) {
      if (!profile) return false;
      for (const arch of profile.wheelArches) {
        const dx = (nx - arch.cx) * (STAGE_WIDTH / STAGE_HEIGHT);
        const dy = ny - arch.cy;
        if (Math.hypot(dx, dy) < arch.r * 1.40) return true;
      }
      if (pointInNormalizedPolygon(nx, ny, profile.polygon)) return true;
      return distanceToNormalizedPolygon(nx, ny, profile.polygon) < 0.018;
    }

    function segmentHitsProfile(x0: number, y0: number, x1: number, y1: number) {
      if (!profile) return false;
      const checks = Math.max(2, Math.ceil(Math.hypot((x1 - x0) * STAGE_WIDTH, (y1 - y0) * STAGE_HEIGHT) / 7));
      for (let i = 1; i <= checks; i += 1) {
        const t = i / checks;
        if (pointInsideProfile(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return true;
      }
      return false;
    }

    function drawRibbonFlowOverlay(elapsedMs: number) {
      if (!overlayCtx || controls.overlayMode !== "ribbon" || !modelFile || !modelViewerReady) return;
      overlayCtx.save();
      overlayCtx.lineCap = "round";
      overlayCtx.lineJoin = "round";
      overlayCtx.globalCompositeOperation = "lighter";

      streamlineSeeds().forEach((laneY, laneIndex) => {
        const points = traceRibbonPath(laneY);
        strokeStreamline(overlayCtx, points, laneIndex, elapsedMs, true);
      });
      overlayCtx.setLineDash([]);
      overlayCtx.restore();
    }

    function drawSmokeFlow() {
      if (pausedRef.current) return;
      const target = modelFile && modelViewerReady && overlayCtx ? overlayCtx : ctx;
      if (!target || controls.overlayMode !== "smoke") return;
      const particles = particlesRef.current;
      const yawRad = (controls.yawDeg * Math.PI) / 180;
      const yawCos = Math.cos(yawRad);
      const yawSin = Math.sin(yawRad);
      const baseStep = (controls.airspeed / 80) * 0.0072;
      target.save();
      target.globalCompositeOperation = "lighter";
      target.filter = "blur(1.2px)";
      target.lineCap = "round";
      target.lineJoin = "round";

      const pickWheelSmokeSeed = () => {
        if (controls.wheelMode !== "rotating" || !profile?.wheelArches.length) return null;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const arch = profile.wheelArches[Math.floor(Math.random() * profile.wheelArches.length)];
          const side = Math.random() < 0.5 ? -1 : 1;
          const downstream = Math.random() < 0.72;
          const x = downstream
            ? arch.cx + arch.r * (1.18 + Math.random() * 0.84)
            : arch.cx - arch.r * (1.65 + Math.random() * 0.72);
          const y = clampFlowY(arch.cy + side * arch.r * (0.62 + Math.random() * 0.95));
          if (!pointInsideProfile(x, y)) return { x, y };
        }
        return null;
      };

      const resetParticle = (particle: ParticleState) => {
        const wheelSeed = Math.random() < 0.34 ? pickWheelSmokeSeed() : null;
        particle.x = wheelSeed?.x ?? (-0.05 + Math.random() * 0.05);
        particle.y = wheelSeed?.y ?? spawnParticleY(controls.windSourceY, 0.66);
        particle.age = 170 + Math.random() * 90;
        for (let t = 0; t < TRAIL_LENGTH; t += 1) {
          particle.trail[t * 2] = particle.x;
          particle.trail[t * 2 + 1] = particle.y;
        }
      };

      for (const particle of particles) {
        const sample = sampleField(particle.x, particle.y);
        const mag = sample ? Math.max(0.04, Math.hypot(sample.u, sample.v)) : 1;
        const u = sample && sample.speed > 0.018 ? (sample.u / mag) * baseStep : baseStep * yawCos;
        const v = sample && sample.speed > 0.018 ? (sample.v / mag) * baseStep * STREAMLINE_Y_GAIN : baseStep * yawSin;
        if (
          particle.age <= 0
          || particle.x > 1.05
          || particle.x < -0.08
          || particle.y < -0.04
          || particle.y > 1.04
          || pointInsideProfile(particle.x, particle.y)
        ) {
          resetParticle(particle);
          continue;
        }
        particle.trail[particle.trailHead * 2] = particle.x;
        particle.trail[particle.trailHead * 2 + 1] = particle.y;
        particle.trailHead = (particle.trailHead + 1) % TRAIL_LENGTH;
        const nextX = particle.x + u;
        const nextY = clampFlowY(particle.y + v + (Math.random() - 0.5) * 0.0010);
        if (segmentHitsProfile(particle.x, particle.y, nextX, nextY)) {
          resetParticle(particle);
          continue;
        }
        particle.x = nextX;
        particle.y = nextY;
        particle.age -= 1;
        const intensity = Math.min(1, sample ? sample.speed * 0.55 : 0.34);
        const alpha = 0.026 + intensity * 0.045;
        target.strokeStyle = `rgba(130, 190, 220, ${alpha.toFixed(3)})`;
        target.lineWidth = 4.4 + intensity * 5.2;
        target.beginPath();
        for (let t = 0; t < TRAIL_LENGTH; t += 1) {
          const ringIdx = (particle.trailHead + t) % TRAIL_LENGTH;
          const px = particle.trail[ringIdx * 2] * STAGE_WIDTH;
          const py = particle.trail[ringIdx * 2 + 1] * STAGE_HEIGHT;
          if (t === 0) target.moveTo(px, py);
          else target.lineTo(px, py);
        }
        target.stroke();
      }
      target.restore();
    }

    function drawVectorField() {
      const target = modelFile && modelViewerReady && overlayCtx ? overlayCtx : ctx;
      if (!target || (controls.overlayMode !== "technical" && !controls.vectorsOn)) return;
      const frame = fluidFrameRef.current;
      if (!frame.ready || !frame.u || !frame.v) return;
      target.save();
      target.lineCap = "round";
      target.lineJoin = "round";
      for (let y = 54; y < STAGE_HEIGHT - 56; y += 48) {
        for (let x = 84; x < STAGE_WIDTH - 34; x += 72) {
          if (pointInsideProfile(x / STAGE_WIDTH, y / STAGE_HEIGHT)) continue;
          const sample = sampleField(x / STAGE_WIDTH, y / STAGE_HEIGHT);
          if (!sample || sample.speed <= 0.03) continue;
          const len = Math.min(22, 7 + sample.speed * 7);
          const angle = Math.atan2(sample.v, sample.u);
          const x2 = x + Math.cos(angle) * len;
          const y2 = y + Math.sin(angle) * len;
          const alpha = Math.min(0.48, 0.16 + sample.speed * 0.16);
          target.strokeStyle = `rgba(145, 210, 255, ${alpha.toFixed(3)})`;
          target.lineWidth = 1;
          target.beginPath();
          target.moveTo(x, y);
          target.lineTo(x2, y2);
          target.stroke();
          target.beginPath();
          target.moveTo(x2, y2);
          target.lineTo(x2 - Math.cos(angle - 0.45) * 5, y2 - Math.sin(angle - 0.45) * 5);
          target.moveTo(x2, y2);
          target.lineTo(x2 - Math.cos(angle + 0.45) * 5, y2 - Math.sin(angle + 0.45) * 5);
          target.stroke();
        }
      }
      target.restore();
    }

    function drawSeparationMarkers() {
      if (!controls.separationOn || !profile) return;
      const target = modelFile && modelViewerReady && overlayCtx ? overlayCtx : ctx;
      if (!target) return;
      const frame = fluidFrameRef.current;
      if (!frame.ready || !frame.u) return;
      const polygon = profile.polygon;
      if (polygon.length < 6) return;
      // Walk the upper envelope (the first ~55% of the ordered polygon is the
      // top surface in our tracer output). At each vertex sample the streamwise
      // velocity just outside the surface; the first transition to reversed
      // flow marks boundary-layer separation, which we flag with a ring.
      const upperLen = Math.max(3, Math.floor(polygon.length * 0.55));
      target.save();
      let prevReversed = false;
      let marks = 0;
      for (let i = 1; i < upperLen && marks < 4; i += 1) {
        const [x, y] = polygon[i];
        const sample = sampleField(x, Math.max(0, y - 0.03));
        if (!sample) continue;
        const reversed = sample.u < -0.01;
        if (reversed && !prevReversed) {
          const px = x * STAGE_WIDTH;
          const py = y * STAGE_HEIGHT;
          target.beginPath();
          target.arc(px, py, 5.5, 0, Math.PI * 2);
          target.fillStyle = "rgba(255, 96, 84, 0.92)";
          target.fill();
          target.strokeStyle = "rgba(255, 200, 190, 0.9)";
          target.lineWidth = 1.4;
          target.beginPath();
          target.arc(px, py, 9, 0, Math.PI * 2);
          target.stroke();
          marks += 1;
        }
        prevReversed = reversed;
      }
      target.restore();
    }

    function drawVorticityField() {
      const target = modelFile && modelViewerReady && overlayCtx ? overlayCtx : ctx;
      if (!target || controls.overlayMode !== "technical") return;
      const frame = fluidFrameRef.current;
      if (!frame.ready || !frame.u || !frame.v) return;
      target.save();
      const stepX = 10;
      const stepY = 9;
      const cellW = (stepX / SOLVER_NX) * STAGE_WIDTH + 1;
      const cellH = (stepY / SOLVER_NY) * STAGE_HEIGHT + 1;
      for (let yi = 2; yi < SOLVER_NY - 2; yi += stepY) {
        for (let xi = 2; xi < SOLVER_NX - 2; xi += stepX) {
          if (pointInsideProfile(xi / SOLVER_NX, yi / SOLVER_NY)) continue;
          const dvdx = (frame.v[yi * SOLVER_NX + xi + 1] - frame.v[yi * SOLVER_NX + xi - 1]) * 0.5;
          const dudy = (frame.u[(yi + 1) * SOLVER_NX + xi] - frame.u[(yi - 1) * SOLVER_NX + xi]) * 0.5;
          const curl = dvdx - dudy;
          const p = frame.pressure?.[yi * SOLVER_NX + xi] ?? 0;
          const curlStrength = Math.tanh(Math.abs(curl) * 5);
          const pressureStrength = Math.tanh(Math.abs(p) * 2.6);
          const strength = Math.max(curlStrength, pressureStrength);
          if (strength < 0.065) continue;
          const alpha = Math.min(0.22, 0.030 + strength * 0.14);
          const warm = p > 0 || curl >= 0;
          target.fillStyle = warm
            ? `rgba(255, 142, 82, ${alpha.toFixed(3)})`
            : `rgba(80, 178, 255, ${alpha.toFixed(3)})`;
          target.fillRect((xi / SOLVER_NX) * STAGE_WIDTH, (yi / SOLVER_NY) * STAGE_HEIGHT, cellW, cellH);
        }
      }
      target.restore();
    }

    function drawDiagnosticOverlay() {
      if (controls.overlayMode !== "diagnostic") return;
      const target = overlayCtx ?? ctx;
      if (!target) return;
      const frame = fluidFrameRef.current;
      const bodyMask = frame.bodyMask ?? mask;
      const wheelDebugMask = frame.wheelMask;
      const cellW = STAGE_WIDTH / SOLVER_NX;
      const cellH = STAGE_HEIGHT / SOLVER_NY;
      const influenceRadius = Math.max(1, frame.bodyInfluenceRadius || 46);
      const smooth = (value: number) => {
        const t = Math.max(0, Math.min(1, value));
        return t * t * (3 - 2 * t);
      };

      target.save();
      target.globalCompositeOperation = "source-over";

      if (frame.bodyDistance) {
        for (let yi = 1; yi < SOLVER_NY - 1; yi += 3) {
          for (let xi = 1; xi < SOLVER_NX - 1; xi += 3) {
            const c = yi * SOLVER_NX + xi;
            const distance = frame.bodyDistance[c];
            if (!(distance > 0 && distance < influenceRadius)) continue;
            const t = smooth(1 - distance / influenceRadius);
            if (t < 0.08) continue;
            target.fillStyle = `rgba(76, 178, 255, ${(0.018 + t * 0.125).toFixed(3)})`;
            target.fillRect(xi * cellW, yi * cellH, cellW * 3.2, cellH * 3.2);
          }
        }
      }

      if (frame.ground) {
        for (let yi = 1; yi < SOLVER_NY - 1; yi += 2) {
          for (let xi = 1; xi < SOLVER_NX - 1; xi += 2) {
            const c = yi * SOLVER_NX + xi;
            if (bodyMask[c]) continue;
            const channel = frame.ground[c];
            if (channel <= 0.04) continue;
            const lowPressure = Math.max(0, -(frame.pressure?.[c] ?? 0));
            const alpha = Math.min(0.24, 0.026 + channel * 0.16 + lowPressure * 0.025);
            target.fillStyle = `rgba(54, 224, 190, ${alpha.toFixed(3)})`;
            target.fillRect(xi * cellW, yi * cellH, cellW * 2.2, cellH * 2.2);
          }
        }
      }

      if (frame.wake) {
        for (let yi = 1; yi < SOLVER_NY - 1; yi += 2) {
          for (let xi = 1; xi < SOLVER_NX - 1; xi += 2) {
            const c = yi * SOLVER_NX + xi;
            if (bodyMask[c]) continue;
            const wake = frame.wake[c];
            if (wake <= 0.035) continue;
            const alpha = Math.min(0.26, 0.024 + wake * 0.19);
            target.fillStyle = `rgba(255, 132, 72, ${alpha.toFixed(3)})`;
            target.fillRect(xi * cellW, yi * cellH, cellW * 2.2, cellH * 2.2);
          }
        }
      }

      if (bodyMask.length === SOLVER_NX * SOLVER_NY) {
        for (let yi = 0; yi < SOLVER_NY; yi += 2) {
          for (let xi = 0; xi < SOLVER_NX; xi += 2) {
            const c = yi * SOLVER_NX + xi;
            if (!bodyMask[c]) continue;
            target.fillStyle = wheelDebugMask?.[c]
              ? "rgba(255, 198, 94, 0.35)"
              : "rgba(232, 242, 255, 0.16)";
            target.fillRect(xi * cellW, yi * cellH, cellW * 2.05, cellH * 2.05);
          }
        }
      }

      if (!wheelDebugMask && profile?.wheelArches.length) {
        target.strokeStyle = "rgba(255, 198, 94, 0.48)";
        target.lineWidth = 2;
        for (const arch of profile.wheelArches) {
          target.beginPath();
          target.arc(arch.cx * STAGE_WIDTH, arch.cy * STAGE_HEIGHT, Math.max(8, arch.r * STAGE_HEIGHT), 0, Math.PI * 2);
          target.stroke();
        }
      }

      const zones = frame.componentZones.length ? frame.componentZones : componentZones;
      for (const zone of zones) {
        const px = zone.x * STAGE_WIDTH;
        const py = zone.y * STAGE_HEIGHT;
        const rx = Math.max(8, zone.radiusX * STAGE_WIDTH);
        const ry = Math.max(6, zone.radiusY * STAGE_HEIGHT);
        target.strokeStyle = zone.kind === "rearWing" ? "rgba(255, 232, 168, 0.74)" : "rgba(74, 222, 128, 0.70)";
        target.fillStyle = zone.kind === "rearWing" ? "rgba(255, 232, 168, 0.46)" : "rgba(74, 222, 128, 0.42)";
        target.lineWidth = 1.3;
        target.beginPath();
        target.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
        target.stroke();
        target.beginPath();
        target.arc(px, py, 3.4, 0, Math.PI * 2);
        target.fill();
      }

      if (frame.bodyDistance && frame.bodyNormalX && frame.bodyNormalY) {
        target.strokeStyle = "rgba(226, 242, 255, 0.66)";
        target.fillStyle = "rgba(226, 242, 255, 0.72)";
        target.lineWidth = 1;
        for (let yi = 5; yi < SOLVER_NY - 5; yi += 10) {
          for (let xi = 5; xi < SOLVER_NX - 5; xi += 10) {
            const c = yi * SOLVER_NX + xi;
            const distance = frame.bodyDistance[c];
            if (!(distance > 1.2 && distance < 8.5) || bodyMask[c]) continue;
            const nx = frame.bodyNormalX[c];
            const ny = frame.bodyNormalY[c];
            if (Math.hypot(nx, ny) < 0.4) continue;
            const x0 = xi * cellW;
            const y0 = yi * cellH;
            const x1 = x0 + nx * 12;
            const y1 = y0 + ny * 12;
            target.beginPath();
            target.moveTo(x0, y0);
            target.lineTo(x1, y1);
            target.stroke();
            target.beginPath();
            target.arc(x1, y1, 1.5, 0, Math.PI * 2);
            target.fill();
          }
        }
      }

      target.fillStyle = "rgba(125, 211, 252, 0.9)";
      for (const seedY of streamlineSeeds()) {
        target.beginPath();
        target.arc(18, seedY * STAGE_HEIGHT, 3.2, 0, Math.PI * 2);
        target.fill();
      }

      target.restore();
    }

    function silhouettePath(polygon: Array<[number, number]>) {
      if (!ctx) return;
      ctx.beginPath();
      const len = polygon.length;
      if (len === 0) return;
      const first = polygon[0];
      const startX = (first[0] + polygon[len - 1][0]) * 0.5 * STAGE_WIDTH;
      const startY = (first[1] + polygon[len - 1][1]) * 0.5 * STAGE_HEIGHT;
      ctx.moveTo(startX, startY);
      for (let i = 0; i < len; i += 1) {
        const [cx, cy] = polygon[i];
        const [nx, ny] = polygon[(i + 1) % len];
        const midX = (cx + nx) * 0.5 * STAGE_WIDTH;
        const midY = (cy + ny) * 0.5 * STAGE_HEIGHT;
        ctx.quadraticCurveTo(cx * STAGE_WIDTH, cy * STAGE_HEIGHT, midX, midY);
      }
      ctx.closePath();
    }

    function strokePolyline(points: Array<[number, number]>) {
      if (!ctx || points.length < 2) return;
      ctx.beginPath();
      for (let i = 0; i < points.length; i += 1) {
        const px = points[i][0] * STAGE_WIDTH;
        const py = points[i][1] * STAGE_HEIGHT;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    function pressureAtSegment(nx: number, ny: number) {
      const frame = fluidFrameRef.current;
      if (!frame.ready || !frame.pressure) return 0;
      const xi = Math.max(0, Math.min(SOLVER_NX - 1, Math.floor(nx * SOLVER_NX)));
      const yi = Math.max(0, Math.min(SOLVER_NY - 1, Math.floor(ny * SOLVER_NY)));
      const samples = [
        frame.pressure[yi * SOLVER_NX + xi],
        frame.pressure[Math.max(0, yi - 1) * SOLVER_NX + xi],
        frame.pressure[Math.min(SOLVER_NY - 1, yi + 1) * SOLVER_NX + xi],
      ];
      let total = 0;
      let count = 0;
      for (const s of samples) {
        if (Number.isFinite(s)) { total += s; count += 1; }
      }
      return count ? total / count : 0;
    }

    function drawGroundShadow() {
      if (!ctx || !profile) return;
      // Compute polygon bbox, drop a soft elliptical shadow under it.
      let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of profile.polygon) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      const cx = (minX + maxX) * 0.5 * STAGE_WIDTH;
      const halfW = (maxX - minX) * 0.55 * STAGE_WIDTH;
      const cy = maxY * STAGE_HEIGHT + 6;
      const grad = ctx.createRadialGradient(cx, cy, halfW * 0.1, cx, cy, halfW);
      grad.addColorStop(0, "rgba(0, 0, 0, 0.6)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, halfW, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawInletStreaks(elapsedMs: number) {
      if (!ctx) return;
      const speed = controls.airspeed;
      const offset = (elapsedMs * speed * 0.010) % 28;
      ctx.save();
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      for (const lane of INLET_MARKERS) {
        const y = lane * STAGE_HEIGHT;
        const x0 = 18 + offset;
        const x1 = x0 + 42;
        ctx.strokeStyle = "rgba(150, 200, 255, 0.16)";
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.moveTo(x1, y);
        ctx.lineTo(x1 - 7, y - 4);
        ctx.moveTo(x1, y);
        ctx.lineTo(x1 - 7, y + 4);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawWindSource() {
      if (!ctx) return;
      const y = controls.windSourceY * STAGE_HEIGHT;
      const yawOffset = Math.sin((controls.yawDeg * Math.PI) / 180) * STAGE_WIDTH * 0.14;
      ctx.save();
      ctx.strokeStyle = "rgba(125, 211, 252, 0.72)";
      ctx.fillStyle = "rgba(125, 211, 252, 0.12)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(24, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(39, y);
      ctx.lineTo(86, y + yawOffset * 0.06);
      ctx.lineTo(78, y + yawOffset * 0.06 - 5);
      ctx.moveTo(86, y + yawOffset * 0.06);
      ctx.lineTo(78, y + yawOffset * 0.06 + 5);
      ctx.stroke();
      ctx.font = "700 10px IBM Plex Mono, Consolas, monospace";
      ctx.fillStyle = "rgba(220, 242, 254, 0.9)";
      ctx.fillText("WIND RAKE", 44, y + 4);
      ctx.restore();
    }

    function drawSilhouette(elapsedMs: number) {
      if (!ctx || !profile) return;
      const polygon = profile.polygon;
      if (!polygon.length) return;
      if (modelFile && modelViewerReady && controls.silhouetteMode !== "airfoil") return;

      const bodyBounds = profileBounds(polygon);
      const bodyTop = bodyBounds.minY * STAGE_HEIGHT;
      const bodyBottom = bodyBounds.maxY * STAGE_HEIGHT;
      const bodySpan = Math.max(1, bodyBottom - bodyTop);
      const accent = hexToRgb(accentColor);

      // Two-tone livery: place an accent-tinted gloss band keyed off the
      // stripe detail's average y (fall back to 0.45 of the body bbox).
      const stripeDetail = profile.details?.find((detail) => detail.kind === "stripe");
      const stripeAvgY = stripeDetail && stripeDetail.points.length
        ? stripeDetail.points.reduce((sum, [, y]) => sum + y, 0) / stripeDetail.points.length
        : bodyBounds.minY + (bodyBounds.maxY - bodyBounds.minY) * 0.45;
      const bandT = Math.max(0.08, Math.min(0.92, (stripeAvgY * STAGE_HEIGHT - bodyTop) / bodySpan));

      ctx.save();
      // Glossy paint with vertical gradient.
      ctx.shadowColor = "rgba(8, 12, 20, 0.55)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      const paint = ctx.createLinearGradient(0, bodyTop, 0, bodyBottom);
      paint.addColorStop(0, "rgba(28, 36, 50, 0.95)");
      paint.addColorStop(Math.max(0, bandT - 0.14), "rgba(17, 24, 38, 0.96)");
      paint.addColorStop(bandT, `rgba(${Math.round(14 + accent.r * 0.30)}, ${Math.round(18 + accent.g * 0.30)}, ${Math.round(28 + accent.b * 0.30)}, 0.96)`);
      paint.addColorStop(Math.min(1, bandT + 0.16), "rgba(11, 16, 27, 0.97)");
      paint.addColorStop(1, "rgba(7, 11, 19, 0.98)");
      ctx.fillStyle = paint;
      silhouettePath(polygon);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Rim-light along the upper outline.
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(180, 215, 255, 0.42)";
      ctx.lineWidth = 1.8;
      const upperLen = Math.floor(polygon.length * 0.55);
      ctx.beginPath();
      ctx.moveTo(polygon[0][0] * STAGE_WIDTH, polygon[0][1] * STAGE_HEIGHT);
      for (let i = 1; i < upperLen; i += 1) {
        ctx.lineTo(polygon[i][0] * STAGE_WIDTH, polygon[i][1] * STAGE_HEIGHT);
      }
      ctx.stroke();
      ctx.restore();

      // Cockpit shading: a slightly darker inset fill under the halo arc.
      const haloDetail = profile.details?.find((detail) => detail.kind === "halo");
      if (haloDetail && haloDetail.points.length >= 2) {
        const drop = bodySpan * 0.16;
        ctx.save();
        silhouettePath(polygon);
        ctx.clip();
        ctx.beginPath();
        const haloPts = haloDetail.points;
        ctx.moveTo(haloPts[0][0] * STAGE_WIDTH, haloPts[0][1] * STAGE_HEIGHT);
        for (let i = 1; i < haloPts.length; i += 1) {
          ctx.lineTo(haloPts[i][0] * STAGE_WIDTH, haloPts[i][1] * STAGE_HEIGHT);
        }
        for (let i = haloPts.length - 1; i >= 0; i -= 1) {
          ctx.lineTo(haloPts[i][0] * STAGE_WIDTH, haloPts[i][1] * STAGE_HEIGHT + drop);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(2, 4, 9, 0.42)";
        ctx.fill();
        ctx.restore();
      }

      // Detail polylines: stripe / halo / wings / sidepod / beam wing.
      if (profile.details) {
        for (const detail of profile.details) {
          if (detail.kind === "stripe") {
            ctx.strokeStyle = `${accentColor}cc`;
            ctx.lineWidth = 1.6;
            strokePolyline(detail.points);
          } else if (detail.kind === "halo") {
            ctx.strokeStyle = "rgba(220, 232, 255, 0.65)";
            ctx.lineWidth = 3;
            strokePolyline(detail.points);
          } else if (detail.kind === "rearWing") {
            ctx.strokeStyle = "rgba(220, 232, 255, 0.55)";
            ctx.lineWidth = 2.2;
            strokePolyline(detail.points);
          } else if (detail.kind === "frontWing") {
            ctx.strokeStyle = "rgba(200, 220, 250, 0.45)";
            ctx.lineWidth = 1.6;
            strokePolyline(detail.points);
          } else if (detail.kind === "sidepod") {
            // Shaded inset stroke: a soft dark underline plus a thin light edge.
            ctx.save();
            ctx.lineCap = "round";
            ctx.strokeStyle = "rgba(2, 5, 10, 0.55)";
            ctx.lineWidth = 4;
            strokePolyline(detail.points);
            ctx.strokeStyle = "rgba(160, 195, 235, 0.30)";
            ctx.lineWidth = 1.2;
            strokePolyline(detail.points);
            ctx.restore();
          } else if (detail.kind === "beamWing") {
            // Convention: last two points form the DRS flap (leading point
            // first); the preceding points are the lower beam wing element.
            const pts = detail.points;
            ctx.strokeStyle = "rgba(220, 232, 255, 0.50)";
            ctx.lineWidth = 2;
            if (pts.length > 2) {
              strokePolyline(pts.slice(0, pts.length - 2));
            }
            if (pts.length >= 2) {
              const lead = pts[pts.length - 2];
              let trail = pts[pts.length - 1];
              if (controls.drsOpen) {
                // Rotate the flap ~20deg open about its leading point.
                const angle = (-20 * Math.PI) / 180;
                const dx = (trail[0] - lead[0]) * STAGE_WIDTH;
                const dy = (trail[1] - lead[1]) * STAGE_HEIGHT;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                trail = [
                  lead[0] + (dx * cos - dy * sin) / STAGE_WIDTH,
                  lead[1] + (dx * sin + dy * cos) / STAGE_HEIGHT,
                ];
              }
              ctx.strokeStyle = controls.drsOpen ? `${accentColor}cc` : "rgba(220, 232, 255, 0.50)";
              ctx.lineWidth = 2;
              strokePolyline([lead, trail]);
            }
          }
        }
      }

      if (controls.overlayMode === "technical") {
        const pressures: number[] = new Array(polygon.length).fill(0);
        let pMin = Infinity;
        let pMax = -Infinity;
        for (let i = 0; i < polygon.length; i += 1) {
          const [nx, ny] = polygon[i];
          const pv = pressureAtSegment(nx, ny);
          pressures[i] = pv;
          if (pv < pMin) pMin = pv;
          if (pv > pMax) pMax = pv;
        }
        // Ease the live frame extremes into a persistent range so colours stay
        // stable during warm-up instead of rescaling every frame. The range can
        // expand quickly (so genuine peaks register) but contracts slowly.
        const prev = cpRangeRef.current;
        if (!prev) {
          cpRangeRef.current = { min: pMin, max: pMax };
        } else {
          const expand = 0.5;
          const contract = 0.04;
          cpRangeRef.current = {
            min: pMin < prev.min ? prev.min + (pMin - prev.min) * expand : prev.min + (pMin - prev.min) * contract,
            max: pMax > prev.max ? prev.max + (pMax - prev.max) * expand : prev.max + (pMax - prev.max) * contract,
          };
        }
        const smoothedMin = cpRangeRef.current.min;
        const range = (cpRangeRef.current.max - smoothedMin) || 1;
        ctx.lineCap = "round";
        ctx.lineWidth = 3.2;
        for (let i = 0; i < polygon.length; i += 1) {
          const [x1, y1] = polygon[i];
          const [x2, y2] = polygon[(i + 1) % polygon.length];
          const t = Math.max(0, Math.min(1, (pressures[i] - smoothedMin) / range));
          const r = Math.round(60 + (235 - 60) * t);
          const g = Math.round(160 + (90 - 160) * t);
          const b = Math.round(220 + (40 - 220) * t);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
          ctx.beginPath();
          ctx.moveTo(x1 * STAGE_WIDTH, y1 * STAGE_HEIGHT);
          ctx.lineTo(x2 * STAGE_WIDTH, y2 * STAGE_HEIGHT);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = `${accentColor}aa`;
        ctx.lineWidth = 1.6;
        silhouettePath(polygon);
        ctx.stroke();
      }
      ctx.restore();

      // Wheels: solid dark fills with a thin team-colour rim, plus a
      // rotation pulse when wheels are spinning.
      ctx.save();
      for (const arch of profile.wheelArches) {
        const cx = arch.cx * STAGE_WIDTH;
        const cy = arch.cy * STAGE_HEIGHT;
        const r = Math.max(10, arch.r * STAGE_HEIGHT);
        const tireGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        tireGrad.addColorStop(0, "rgba(48, 52, 60, 1)");
        tireGrad.addColorStop(1, "rgba(8, 9, 13, 1)");
        ctx.fillStyle = tireGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        // Brake glow: a subtle hot-disc gradient inside the arch. Intensity
        // rises as airspeed drops (braking into a corner reads hotter).
        const glow = Math.max(0, Math.min(1, 1 - controls.airspeed / 140));
        if (glow > 0.05 && controls.wheelMode === "rotating") {
          const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r * 0.55);
          glowGrad.addColorStop(0, `rgba(255, 96, 28, ${0.34 * glow})`);
          glowGrad.addColorStop(0.6, `rgba(214, 48, 18, ${0.16 * glow})`);
          glowGrad.addColorStop(1, "rgba(120, 16, 8, 0)");
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = `${accentColor}88`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (controls.wheelMode === "rotating") {
          ctx.strokeStyle = "rgba(220, 232, 255, 0.45)";
          ctx.lineWidth = 1;
          const phase = (elapsedMs * controls.airspeed * 0.00012) % (Math.PI * 2);
          for (let i = 0; i < 5; i += 1) {
            const angle = phase + (i / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * r * 0.85, cy + Math.sin(angle) * r * 0.85);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    function drawHoverProbe() {
      if (!ctx) return;
      if (!controls.probeEnabled) return;
      const hover = hoverRef.current;
      if (!hover.active) return;
      const px = hover.nx * STAGE_WIDTH;
      const py = hover.ny * STAGE_HEIGHT;
      ctx.save();
      ctx.strokeStyle = "rgba(255, 232, 168, 0.55)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(STAGE_WIDTH, py);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, STAGE_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 232, 168, 0.85)";
      ctx.fill();
      ctx.restore();
    }

    function frame() {
      if (!isVisibleRef.current) {
        animationRef.current = requestAnimationFrame(frame);
        return;
      }
      const now = performance.now();
      const elapsed = pausedRef.current ? 0 : now - animationStartedAt;
      frameTickCount += 1;
      if (now - lastFpsRead > 500) {
        measuredFps = (frameTickCount * 1000) / (now - lastFpsRead);
        frameTickCount = 0;
        lastFpsRead = now;
      }
      clearStage();
      drawAxes();
      drawRollingRoad(elapsed);
      drawInletStreaks(elapsed);
      drawWindSource();
      if (profile) {
        drawGroundShadow();
        drawVorticityField();
        drawRibbonFlow(elapsed);
        drawSmokeFlow();
        drawSilhouette(elapsed);
        drawVectorField();
        drawSeparationMarkers();
        drawDiagnosticOverlay();
        drawRibbonFlowOverlay(elapsed);
      }
      drawHoverProbe();

      if (now - lastForceRead > 750) {
        lastForceRead = now;
        const f = fluidFrameRef.current;
        const reynolds = (controls.airspeed * 5.5) / 1.5e-5;
        const live = now - f.lastFrameAt < 600 && f.ready;
        const solverState = updateSolverState(f, now);
        if (solverState === "settled" && f.ready && !forceBaselineRef.current && Math.abs(f.drag) > 0.001) {
          const baseline = { drag: f.drag, lift: f.lift };
          forceBaselineRef.current = baseline;
          setForceBaseline(baseline);
        }
        const modeDragDelta = f.modeDragFactorStatic > 0
          ? (f.modeDragFactor / f.modeDragFactorStatic - 1)
          : 0;
        const modeDeltaNoise = Math.abs(modeDragDelta) < 0.008;
        setReadout({ drag: f.drag, lift: f.lift, reynolds, live, fps: measuredFps, solverState, modeDragDelta, modeDeltaNoise });
      }
      if (now - lastHoverRead > 80) {
        lastHoverRead = now;
        const hover = hoverRef.current;
        if (!controls.probeEnabled) {
          setHoverData(null);
        } else if (hover.active) {
          const sample = sampleField(hover.nx, hover.ny);
          if (sample) {
            const xi = Math.max(0, Math.min(SOLVER_NX - 1, Math.floor(hover.nx * SOLVER_NX)));
            const yi = Math.max(0, Math.min(SOLVER_NY - 1, Math.floor(hover.ny * SOLVER_NY)));
            const f = fluidFrameRef.current;
            // Curl / vorticity = dv/dx - du/dy. Central difference where possible.
            let vorticity = 0;
            if (f.ready && f.u && f.v) {
              const xL = Math.max(0, xi - 1);
              const xR = Math.min(SOLVER_NX - 1, xi + 1);
              const yU = Math.max(0, yi - 1);
              const yD = Math.min(SOLVER_NY - 1, yi + 1);
              const dvdx = (f.v[yi * SOLVER_NX + xR] - f.v[yi * SOLVER_NX + xL]) * 0.5;
              const dudy = (f.u[yD * SOLVER_NX + xi] - f.u[yU * SOLVER_NX + xi]) * 0.5;
              vorticity = dvdx - dudy;
            }
            // Distance to nearest body cell, in normalized units (0..1).
            let distance: number | null = null;
            let inside = false;
            if (mask && mask.length === SOLVER_NX * SOLVER_NY) {
              if (mask[yi * SOLVER_NX + xi]) {
                inside = true;
                distance = 0;
              } else {
                const radius = 24;
                let bestSq = Infinity;
                for (let ry = -radius; ry <= radius; ry += 1) {
                  const yy = yi + ry;
                  if (yy < 0 || yy >= SOLVER_NY) continue;
                  for (let rx = -radius; rx <= radius; rx += 1) {
                    const xx = xi + rx;
                    if (xx < 0 || xx >= SOLVER_NX) continue;
                    if (mask[yy * SOLVER_NX + xx]) {
                      const d = rx * rx + ry * ry;
                      if (d < bestSq) bestSq = d;
                    }
                  }
                }
                distance = bestSq < Infinity ? Math.sqrt(bestSq) / SOLVER_NX : null;
              }
            }
            setHoverData({
              speed: sample.speed,
              speedMs: sample.speed * controls.airspeed,
              pressure: sample.pressure,
              vorticity,
              distance,
              inside,
              nx: hover.nx,
              ny: hover.ny,
            });
          }
        }
      }
      animationRef.current = requestAnimationFrame(frame);
    }

    frame();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [accentColor, controls, profile, modelFile, modelViewerReady, mask, componentZones]);

  const aeroProfile = AERO_PROFILE_BY_CONSTRUCTOR[constructorSlug ?? ""] ?? DEFAULT_AERO_PROFILE;
  const dragDelta = forceBaseline && readout ? readout.drag - forceBaseline.drag : 0;
  const liftDelta = forceBaseline && readout ? readout.lift - forceBaseline.lift : 0;
  const estimatedCd = controls.silhouetteMode === "airfoil"
    ? 0.08 + Math.abs(controls.airfoilAngleDeg) * 0.012 + Math.abs(controls.yawDeg) * 0.003
    : aeroProfile.cd * (controls.drsOpen ? 0.9 : 1) * (1 + Math.abs(controls.yawDeg) * 0.004);
  const estimatedCl = controls.silhouetteMode === "airfoil"
    ? 0.12 * controls.airfoilAngleDeg
    : aeroProfile.cl * (controls.drsOpen ? 0.92 : 1) * (1 + Math.abs(controls.yawDeg) * 0.006);
  const estimatedCy = Math.sin((controls.yawDeg * Math.PI) / 180) * (controls.silhouetteMode === "airfoil" ? 0.7 : 1.4);
  // Isolated rolling-road + rotating-wheel drag treatment relative to an
  // all-fixed tunnel (fixed floor + stationary wheels). The solver applies
  // these multipliers inside the blockage-dominated raw drag, where the swing
  // is invisible; here we surface the analytic % so the toggles read clearly.
  // Guarded against the convergence residual (~0.6% drag tolerance): anything
  // under the noise floor is labelled instead of shown as a misleading number.
  const floorDeltaPct = readout ? readout.modeDragDelta * 100 : 0;
  const floorDeltaBelowNoise = readout ? readout.modeDeltaNoise : true;
  const activeFlowView = FLOW_VIEW_META[controls.overlayMode];

  return (
    <div className="wind-tunnel" data-constructor={constructorSlug ?? "default"} ref={rootRef} tabIndex={0}>
      <div className="wind-tunnel__header">
        <p className="eyebrow">Wind tunnel · geometry field</p>
        <h3>Airflow simulation around {modelTitle}</h3>
        <p className="wind-tunnel__copy">
          {SOLVER_NX} × {SOLVER_NY} illustrative geometry field running in a Web Worker.
          Ribbon, Technical, and Smoke views sample the same live u/v field. This is not validated CFD; forces and coefficients are educational estimates.
        </p>
        <div className="wind-tunnel__header-actions">
          <button
            type="button"
            className="wind-tunnel__action-button"
            aria-pressed={paused || reducedMotion}
            disabled={reducedMotion}
            onClick={() => setPaused((prev) => !prev)}
          >
            {paused || reducedMotion ? "Paused" : "Pause"}
          </button>
          <button
            type="button"
            className="wind-tunnel__action-button"
            onClick={() => { setPaused(false); setControls(() => buildDefaultControls(constructorSlug)); }}
          >
            Reset
          </button>
          <span className="wind-tunnel__shortcut-hint">Space pause · ↑↓ airspeed · ←→ yaw · R reset</span>
        </div>
      </div>

      <div className="wind-tunnel__stage">
        <canvas
          ref={canvasRef}
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          className="wind-tunnel__canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
        {modelFile && modelViewerReady && controls.silhouetteMode !== "airfoil" ? createElement("model-viewer", {
          key: `${modelFile}-wind-tunnel`,
          className: "wind-tunnel__model-layer",
          src: modelFile,
          alt: `${modelTitle} side-on wind tunnel model`,
          scale: modelScale,
          reveal: "auto",
          loading: "lazy",
          "camera-orbit": "90deg 88deg 6m",
          "camera-target": "0m 0.22m 0m",
          "field-of-view": "24deg",
          "min-camera-orbit": "auto auto 4m",
          "max-camera-orbit": "auto auto 14m",
          exposure: "1.08",
          "shadow-intensity": "0",
          "shadow-softness": "0",
          "tone-mapping": "commerce",
          "environment-image": "neutral",
          "interaction-prompt": "none",
          "disable-pan": true,
          "disable-zoom": true,
          "touch-action": "none",
          onLoad: (event: Event) => {
            const node = event.currentTarget as { jumpCameraToGoal?: () => void };
            node.jumpCameraToGoal?.();
          },
        }) : null}
        <canvas
          ref={flowOverlayRef}
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          className="wind-tunnel__flow-overlay"
          aria-hidden="true"
        />
        {!profile && profileMissing ? (
          <div className="wind-tunnel__overlay">
            <p>Silhouette not available for this constructor yet.</p>
            <p className="wind-tunnel__overlay-sub">
              Switch to Procedural or Airfoil mode for the live solver while this constructor-specific outline is prepared.
            </p>
          </div>
        ) : null}
        {profile && !fluidFrameRef.current.ready ? (
          <div className="wind-tunnel__overlay wind-tunnel__overlay--soft">
            <p>Solver warming up...</p>
          </div>
        ) : null}
        {paused || reducedMotion ? (
          <div className="wind-tunnel__overlay wind-tunnel__overlay--soft">
            <p>{reducedMotion ? "Motion reduced" : "Paused"}</p>
            <p className="wind-tunnel__overlay-sub">{reducedMotion ? "The solver is paused while reduced motion is enabled." : "Press Space or Resume to continue the solver."}</p>
          </div>
        ) : null}
        <div className="wind-tunnel__stage-hint">
          {controls.overlayMode === "diagnostic"
            ? "Diagnostic · mask / sdf / wake / floor"
            : <>Rake {Math.round(controls.windSourceY * 100)}% · Probe {controls.probeEnabled ? "armed" : "off"}</>}
        </div>
        {controls.probeEnabled && hoverData ? (
          <div
            className="wind-tunnel__hover"
            style={{
              left: `${Math.min(78, Math.max(2, hoverData.nx * 100 + 2))}%`,
              top: `${Math.min(70, Math.max(2, hoverData.ny * 100 - 14))}%`,
            }}
          >
            <span>U <strong>{hoverData.speedMs.toFixed(1)} m/s</strong></span>
            <span>Cp <strong>{hoverData.pressure.toFixed(3)}</strong></span>
            <span>ω <strong>{hoverData.vorticity.toFixed(3)}</strong></span>
            <span>
              {hoverData.inside
                ? <em>inside body</em>
                : <>d <strong>{hoverData.distance == null ? "-" : `${(hoverData.distance * 100).toFixed(1)}%`}</strong></>}
            </span>
          </div>
        ) : null}
      </div>

      <div className="wind-tunnel__instrument-rail">
        <div className="wind-tunnel__readout" aria-label="Wind tunnel readout">
          <span className={`wind-tunnel__live${readout?.live ? " wind-tunnel__live--on" : ""}`}>{readout?.live ? "live" : "idle"}</span>
          <span className={`wind-tunnel__solver-state wind-tunnel__solver-state--${readout?.solverState ?? "warming"}`}>
            {readout?.solverState ?? "warming"}
          </span>
          <span>Drag est <strong>{readout ? formatForce(readout.drag) : "-"}</strong></span>
          <span>Lift est <strong>{readout ? formatForce(readout.lift) : "-"}</strong></span>
          <span>Cd est <strong>{estimatedCd.toFixed(2)}</strong></span>
          <span>Cl est <strong>{estimatedCl.toFixed(2)}</strong></span>
          <span>Cy est <strong>{estimatedCy.toFixed(2)}</strong></span>
          <span>ΔD est <strong>{readout ? signed(dragDelta) : "-"}</strong></span>
          <span>ΔL est <strong>{readout ? signed(liftDelta) : "-"}</strong></span>
          <span
            className={`wind-tunnel__floor-delta${floorDeltaBelowNoise ? " wind-tunnel__floor-delta--noise" : floorDeltaPct < 0 ? " wind-tunnel__floor-delta--gain" : " wind-tunnel__floor-delta--loss"}`}
            title={`Isolated drag change from ${controls.groundMode === "rolling" ? "rolling road" : "fixed floor"} + ${controls.wheelMode === "rotating" ? "rotating wheels" : "stationary wheels"} vs an all-fixed reference. Estimate, not validated CFD.`}
          >
            Floor Δ <strong>{readout ? (floorDeltaBelowNoise ? "within noise" : `${floorDeltaPct > 0 ? "+" : ""}${floorDeltaPct.toFixed(1)}%`) : "-"}</strong>
          </span>
          <span>Re <strong>{readout?.reynolds ? `${(readout.reynolds / 1e6).toFixed(2)}M` : "-"}</strong></span>
          <span>FPS <strong>{readout?.fps ? readout.fps.toFixed(0) : "-"}</strong></span>
        </div>
        <div className="wind-tunnel__flow-status">
          <span>Flow view <strong>{activeFlowView.label}</strong></span>
          <span>{activeFlowView.description}</span>
          <span>{activeFlowView.low} → {activeFlowView.high}</span>
        </div>
      </div>

      <div className="wind-tunnel__mode" aria-label="Silhouette source">
        {(["procedural", "airfoil", "svg", "glb"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={mode === "svg" && !hasCuratedSvg}
            aria-pressed={controls.silhouetteMode === mode}
            className={`wind-tunnel__mode-button${mode === "glb" ? " wind-tunnel__mode-button--subtle" : ""}${controls.silhouetteMode === mode ? " wind-tunnel__mode-button--active" : ""}`}
            onClick={() => {
              if (mode === "svg" && !hasCuratedSvg) return;
              setControls((prev) => ({ ...prev, silhouetteMode: mode }));
            }}
            title={mode === "procedural"
              ? "Hand-tuned canonical F1 outline (always available)"
              : mode === "airfoil"
                ? "NACA-style wing section for validating angle-of-attack flow"
                : mode === "svg"
                  ? hasCuratedSvg ? "Detailed per-constructor silhouette traced 1:1 from the car's 3D model" : "No silhouette is available for this constructor"
                  : "GLB-derived column-envelope hull"}
          >
            {mode === "procedural" ? "Procedural" : mode === "airfoil" ? "Airfoil" : mode === "svg" ? "SVG art" : "GLB hull"}
          </button>
        ))}
        <span className="wind-tunnel__mode-source">
          Silhouette: <strong>{profile?.source ?? "-"}</strong>
        </span>
      </div>

      <div className="wind-tunnel__control-panel">
        <div className="wind-tunnel__controls wind-tunnel__controls--primary">
          <label>
            <span>Airspeed</span>
            <input
              type="range"
              min={20}
              max={140}
              step={5}
              value={controls.airspeed}
              onChange={(event) => setControls((prev) => ({ ...prev, airspeed: Number(event.target.value) }))}
            />
            <strong>{controls.airspeed} m/s</strong>
          </label>
          <label>
            <span>Yaw</span>
            <input
              type="range"
              min={-15}
              max={15}
              step={1}
              value={controls.yawDeg}
              onChange={(event) => setControls((prev) => ({ ...prev, yawDeg: Number(event.target.value) }))}
            />
            <strong>{controls.yawDeg.toFixed(0)}°</strong>
          </label>
          {controls.silhouetteMode === "airfoil" ? (
            <label>
              <span>Airfoil AoA</span>
              <input
                type="range"
                min={-12}
                max={16}
                step={1}
                value={controls.airfoilAngleDeg}
                onChange={(event) => setControls((prev) => ({ ...prev, airfoilAngleDeg: Number(event.target.value) }))}
              />
              <strong>{controls.airfoilAngleDeg.toFixed(0)}°</strong>
            </label>
          ) : null}
          <label>
            <span>Wind rake</span>
            <input
              type="range"
              min={8}
              max={88}
              step={1}
              value={Math.round(controls.windSourceY * 100)}
              onChange={(event) => setControls((prev) => ({ ...prev, windSourceY: Number(event.target.value) / 100 }))}
            />
            <strong>{Math.round(controls.windSourceY * 100)}%</strong>
          </label>
          {controls.silhouetteMode !== "airfoil" ? (
            <label className="wind-tunnel__toggle">
              <input
                type="checkbox"
                checked={controls.drsOpen}
                onChange={(event) => setControls((prev) => ({ ...prev, drsOpen: event.target.checked }))}
              />
              <span>DRS</span>
            </label>
          ) : null}
        </div>

        <div className="wind-tunnel__controls wind-tunnel__controls--secondary">
          <label className="wind-tunnel__toggle">
            <input
              type="checkbox"
              checked={controls.groundMode === "rolling"}
              onChange={(event) => setControls((prev) => ({ ...prev, groundMode: event.target.checked ? "rolling" : "fixed" }))}
            />
            <span>Rolling road</span>
          </label>
          <label className="wind-tunnel__toggle">
            <input
              type="checkbox"
              checked={controls.wheelMode === "rotating"}
              onChange={(event) => setControls((prev) => ({ ...prev, wheelMode: event.target.checked ? "rotating" : "stationary" }))}
            />
            <span>Wheels</span>
          </label>
          <div className="wind-tunnel__flow-view">
            <span>Flow view</span>
            <div className="wind-tunnel__flow-buttons" aria-label="Flow view">
              {(["ribbon", "technical", "diagnostic", "smoke"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={controls.overlayMode === mode}
                  className={`wind-tunnel__flow-button${controls.overlayMode === mode ? " wind-tunnel__flow-button--active" : ""}`}
                  onClick={() => setControls((prev) => ({ ...prev, overlayMode: mode }))}
                >
                  {FLOW_VIEW_META[mode].label}
                </button>
              ))}
            </div>
          </div>
          <label className="wind-tunnel__toggle">
            <input
              type="checkbox"
              checked={controls.probeEnabled}
              onChange={(event) => {
                const enabled = event.target.checked;
                if (!enabled) {
                  hoverRef.current = { active: false, nx: 0, ny: 0 };
                  setHoverData(null);
                }
                setControls((prev) => ({ ...prev, probeEnabled: enabled }));
              }}
            />
            <span>Probe</span>
          </label>
          <label className="wind-tunnel__toggle">
            <input
              type="checkbox"
              checked={controls.vectorsOn}
              onChange={(event) => setControls((prev) => ({ ...prev, vectorsOn: event.target.checked }))}
            />
            <span>Vectors</span>
          </label>
          <label className="wind-tunnel__toggle">
            <input
              type="checkbox"
              checked={controls.separationOn}
              onChange={(event) => setControls((prev) => ({ ...prev, separationOn: event.target.checked }))}
            />
            <span>Separation</span>
          </label>
          <div className="wind-tunnel__flow-view">
            <span>Quality</span>
            <div className="wind-tunnel__flow-buttons" aria-label="Quality preset">
              {(["low", "medium", "high"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={controls.quality === preset}
                  className={`wind-tunnel__flow-button${controls.quality === preset ? " wind-tunnel__flow-button--active" : ""}`}
                  onClick={() => setControls((prev) => ({
                    ...prev,
                    quality: preset,
                    particles: QUALITY_PRESETS[preset].particles,
                  }))}
                >
                  {QUALITY_PRESETS[preset].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function mapBuiltProfile(built: BuiltSilhouette, source: SilhouetteMode): WindProfileData {
  const remapped = remapToTunnelFrame(built.polygon, built.aspect);
  const remappedDetails = built.details.map((detail) => ({
    kind: detail.kind,
    points: remapDetailPoints(detail.points, built.aspect),
  }));
  const remappedArches = built.wheelArches.map((arch) => {
    const point = remapDetailPoints([[arch.cx, arch.cy]], built.aspect)[0];
    const stretch = remappedDetails[0]?.points[0]
      ? (remappedDetails[0].points[0][1] - point[1])
      : 1;
    const radius = arch.r * Math.abs(stretch || 0.5) * 1.4;
    return { cx: point[0], cy: point[1], r: radius };
  });
  return {
    polygon: remapped,
    wheelArches: remappedArches,
    aspect: built.aspect,
    details: remappedDetails,
    source,
  };
}

function buildFlowComponentZones(profile: WindProfileData): FlowComponentZone[] {
  const bounds = profileBounds(profile.polygon);
  const length = Math.max(0.01, bounds.maxX - bounds.minX);
  const height = Math.max(0.01, bounds.maxY - bounds.minY);
  const zones: FlowComponentZone[] = [];

  const rearWing = profile.details?.find((detail) => detail.kind === "rearWing");
  if (rearWing?.points.length) {
    const wingBounds = profileBounds(rearWing.points);
    zones.push({
      kind: "rearWing",
      x: clampUnit(wingBounds.maxX),
      y: clampUnit((wingBounds.minY + wingBounds.maxY) * 0.5),
      radiusX: Math.max(0.018, (wingBounds.maxX - wingBounds.minX) * 0.40),
      radiusY: Math.max(0.025, (wingBounds.maxY - wingBounds.minY) * 0.58),
      strength: 1.0,
    });
  } else {
    zones.push({
      kind: "rearWing",
      x: clampUnit(bounds.maxX),
      y: clampUnit(bounds.minY + height * 0.30),
      radiusX: length * 0.035,
      radiusY: height * 0.15,
      strength: 0.88,
    });
  }

  const floor = profile.details?.find((detail) => detail.kind === "floor");
  const floorExit = floor?.points.reduce<[number, number] | null>((best, point) => (
    !best || point[0] > best[0] ? point : best
  ), null);
  const lowerRear = profile.polygon
    .filter(([x]) => x > bounds.minX + length * 0.68)
    .reduce<[number, number] | null>((best, point) => (
      !best || point[1] > best[1] ? point : best
    ), null);
  const diffuserX = floorExit ? Math.max(floorExit[0], bounds.maxX - length * 0.075) : bounds.maxX - length * 0.045;
  const diffuserY = floorExit && lowerRear
    ? floorExit[1] * 0.72 + lowerRear[1] * 0.28
    : (floorExit?.[1] ?? lowerRear?.[1] ?? bounds.maxY - height * 0.10);
  zones.push({
    kind: "diffuser",
    x: clampUnit(diffuserX),
    y: clampUnit(diffuserY),
    radiusX: length * 0.045,
    radiusY: height * 0.115,
    strength: 0.88,
  });

  return zones;
}

function normalizeDebugZones(input: unknown): FlowComponentZone[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item): FlowComponentZone[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<Record<keyof FlowComponentZone, unknown>>;
    const kind = source.kind === "rearWing" || source.kind === "diffuser" ? source.kind : null;
    const x = Number(source.x);
    const y = Number(source.y);
    const radiusX = Number(source.radiusX);
    const radiusY = Number(source.radiusY);
    const strength = Number(source.strength);
    if (!kind || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radiusX) || !Number.isFinite(radiusY)) {
      return [];
    }
    return [{
      kind,
      x: clampUnit(x),
      y: clampUnit(y),
      radiusX: Math.max(0.001, Math.abs(radiusX)),
      radiusY: Math.max(0.001, Math.abs(radiusY)),
      strength: Number.isFinite(strength) ? Math.max(0.1, Math.min(1.8, strength)) : 1,
    }];
  });
}

function profileBounds(points: Array<[number, number]>) {
  return points.reduce((bounds, [x, y]) => ({
    minX: Math.min(bounds.minX, x),
    maxX: Math.max(bounds.maxX, x),
    minY: Math.min(bounds.minY, y),
    maxY: Math.max(bounds.maxY, y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const expanded = value.length === 3
    ? value.split("").map((c) => c + c).join("")
    : value;
  const num = Number.parseInt(expanded, 16);
  if (!Number.isFinite(num) || expanded.length !== 6) {
    return { r: 255, g: 122, b: 26 };
  }
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function remapProfileDetails(details: unknown, aspect: number): WindProfileData["details"] {
  if (!Array.isArray(details)) return [];
  return details
    .filter((detail): detail is NonNullable<WindProfileData["details"]>[number] => (
      detail
      && typeof detail === "object"
      && ["halo", "frontWing", "floor", "rearWing", "stripe", "sidepod", "beamWing"].includes((detail as { kind?: string }).kind ?? "")
      && Array.isArray((detail as { points?: unknown }).points)
    ))
    .map((detail) => ({
      kind: detail.kind,
      points: remapDetailPoints(detail.points, aspect),
    }));
}

function remapWheelArches(arches: unknown, aspect: number): WheelArch[] {
  if (!Array.isArray(arches)) return [];
  const fit = computeFit(aspect);
  return arches
    .filter((arch): arch is WheelArch => (
      arch
      && typeof arch === "object"
      && typeof (arch as WheelArch).cx === "number"
      && typeof (arch as WheelArch).cy === "number"
      && typeof (arch as WheelArch).r === "number"
    ))
    .map((arch) => {
      const [cx, cy] = remapDetailPoints([[arch.cx, arch.cy]], aspect)[0];
      return { cx, cy, r: arch.r * fit.fracH };
    });
}

/**
 * DRS-open variant of a curated SVG silhouette: shave the rear-wing crest of
 * the body outline so the solver mask loses frontal area at the top-rear,
 * mirroring how the procedural builder trims rwHeight when DRS opens. Points
 * in the rear-upper region (x > 0.93 of the span, top quarter) are pushed
 * down by ~35% of their height above the upper-quartile line.
 */
function applyDrsOpenToPolygon(polygon: Array<[number, number]>): Array<[number, number]> {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const upperQuartileY = minY + spanY * 0.25;
  const rearWingPoints = polygon
    .map(([x, y]) => ({ x, y, tx: (x - minX) / spanX }))
    .filter((point) => point.tx > 0.75 && point.y < upperQuartileY);
  const rearWingMaxTx = rearWingPoints.reduce((max, point) => Math.max(max, point.tx), 0.93);
  const rearWingStartTx = Math.max(0.75, rearWingMaxTx - 0.08);
  return polygon.map(([x, y]) => {
    const tx = (x - minX) / spanX;
    if (tx >= rearWingStartTx && y < upperQuartileY) {
      const lift = upperQuartileY - y;
      return [x, y + lift * 0.35];
    }
    return [x, y];
  });
}

function computeAspect(polygon: Array<[number, number]>): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  return dx / dy;
}

/**
 * Map the constructor polygon (each axis already normalized to 0..1) into
 * the wind-tunnel display band, **preserving the polygon's real aspect
 * ratio**. The car centres horizontally and sits a comfortable distance
 * above the floor band. This replaces the old behaviour where each axis
 * was stretched to fill the band, which produced distorted blobs.
 *
 * Display band: x in [0.06, 0.94], y in [0.18, 0.82]. We fit the longer
 * dimension into its band, then centre the short dimension.
 */
function remapToTunnelFrame(polygon: Array<[number, number]>, aspect: number): Array<[number, number]> {
  if (!polygon.length) return polygon;
  const fit = computeFit(aspect);
  return polygon.map(([x, y]) => [fit.xMin + x * fit.fracW, fit.yMin + y * fit.fracH]);
}

function remapDetailPoints(points: Array<[number, number]>, aspect: number): Array<[number, number]> {
  const fit = computeFit(aspect);
  return points.map(([x, y]) => [fit.xMin + x * fit.fracW, fit.yMin + y * fit.fracH]);
}

function computeFit(aspect: number) {
  const availFracW = 0.88;
  const availFracH = 0.62;
  const availPxW = STAGE_WIDTH * availFracW;
  const availPxH = STAGE_HEIGHT * availFracH;
  let fitW = availPxW;
  let fitH = fitW / aspect;
  if (fitH > availPxH) {
    fitH = availPxH;
    fitW = fitH * aspect;
  }
  const fracW = fitW / STAGE_WIDTH;
  const fracH = fitH / STAGE_HEIGHT;
  const xMin = (1 - fracW) * 0.5;
  // Align the solver silhouette to the visible side-on model layer. The GLB
  // camera frames the car above the rolling-road strip, so the 2D field should
  // follow that model-backed profile instead of a lower road-hugging drawing.
  const yFloor = 0.65;
  const yMin = yFloor - fracH;
  return { fracW, fracH, xMin, yMin };
}

/**
 * Rasterize the silhouette polygon onto the solver grid as a Uint8Array mask.
 */
function buildMask(polygon: Array<[number, number]>, wheelArches: WheelArch[], nx: number, ny: number): Uint8Array {
  const mask = new Uint8Array(nx * ny);
  const xs = polygon.map((p) => p[0] * nx);
  const ys = polygon.map((p) => p[1] * ny);
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, xs, ys) || pointInWheelMask(x + 0.5, y + 0.5, wheelArches, nx, ny)) {
        mask[y * nx + x] = 1;
      }
    }
  }
  return mask;
}

function pointInWheelMask(px: number, py: number, wheelArches: WheelArch[], nx: number, ny: number) {
  for (const arch of wheelArches) {
    const dx = px - arch.cx * nx;
    const dy = py - arch.cy * ny;
    const r = arch.r * ny;
    if (Math.hypot(dx, dy) <= r) return true;
  }
  return false;
}

function pointInPolygon(px: number, py: number, xs: number[], ys: number[]) {
  let inside = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    const xi = xs[i];
    const yi = ys[i];
    const xj = xs[j];
    const yj = ys[j];
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInNormalizedPolygon(px: number, py: number, polygon: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToNormalizedPolygon(px: number, py: number, polygon: Array<[number, number]>) {
  if (polygon.length === 0) return Infinity;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    const d = distanceToDisplaySegment(px, py, ax, ay, bx, by);
    if (d < best) best = d;
  }
  return best;
}

function distanceToDisplaySegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const scaleX = STAGE_WIDTH / STAGE_HEIGHT;
  const apx = (px - ax) * scaleX;
  const apy = py - ay;
  const abx = (bx - ax) * scaleX;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  return Math.hypot(dx, dy);
}

function spawnParticleY(center: number, spread = 0.16) {
  return Math.max(0.02, Math.min(0.98, center + (Math.random() - 0.5) * spread));
}

function signed(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${formatForce(value)}`;
}

function formatForce(value: number) {
  if (!Number.isFinite(value)) return "-";
  return Math.abs(value) < 10 ? value.toFixed(3) : value.toFixed(2);
}
