"use client";

/**
 * Wind Tunnel V5 (rewritten 2026-05-24).
 *
 * Mode switcher: silhouette source can be procedural (always-an-F1-shape),
 * SVG (hand-curated per constructor), or GLB-derived (column-envelope).
 * The procedural mode is now default because the GLB extraction loses
 * cockpit / wing detail and the SVG art catalog is not yet authored.
 *
 * Renderer polish:
 * - Dark glossy paint with rim-light and team-colour accent stripe.
 * - Ground shadow ellipse beneath the body.
 * - Animated rolling-road dashes whose speed scales with airspeed.
 * - 7 thicker inlet streaklines from the left edge in addition to the
 *   particle field, so the wind reads as wind even at low particle counts.
 * - Wake-instability puff downstream of the tail.
 * - Frame-rate counter in the readout.
 * - Stage canvas height bumped to 460.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { buildAirfoilSilhouette, buildProceduralSilhouette } from "./procedural-silhouette";

type GroundMode = "rolling" | "fixed";
type WheelMode = "rotating" | "stationary";
type SilhouetteMode = "procedural" | "airfoil" | "svg" | "glb";

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
  showStreamlines: boolean;
  showCp: boolean;
  silhouetteMode: SilhouetteMode;
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
  particles: 320,
  showStreamlines: true,
  showCp: true,
  silhouetteMode: "procedural",
};

const STAGE_WIDTH = 1024;
const STAGE_HEIGHT = 460;
const SOLVER_NX = 320;
const SOLVER_NY = 144;
const TRAIL_LENGTH = 18;

const INLET_LANES = [0.20, 0.30, 0.40, 0.48, 0.58, 0.66, 0.76];

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
  details?: Array<{ kind: "halo" | "frontWing" | "floor" | "rearWing" | "stripe"; points: Array<[number, number]> }>;
  source: SilhouetteMode;
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

export interface CanvasWindTunnelProps {
  modelTitle: string;
  accentColor?: string;
  constructorSlug?: string;
}

export function CanvasWindTunnel({ modelTitle, accentColor = "#ff7a1a", constructorSlug }: CanvasWindTunnelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const controlsRef = useRef<WindTunnelControls>(DEFAULT_CONTROLS);
  const forceBaselineRef = useRef<{ drag: number; lift: number } | null>(null);
  const fluidFrameRef = useRef<{
    u: Float32Array | null;
    v: Float32Array | null;
    speed: Float32Array | null;
    pressure: Float32Array | null;
    drag: number;
    lift: number;
    ready: boolean;
    lastFrameAt: number;
  }>({ u: null, v: null, speed: null, pressure: null, drag: 0, lift: 0, ready: false, lastFrameAt: 0 });
  const hoverRef = useRef<{ active: boolean; nx: number; ny: number }>({ active: false, nx: 0, ny: 0 });

  const [controls, setControls] = useState<WindTunnelControls>(DEFAULT_CONTROLS);
  const [readout, setReadout] = useState<{ drag: number; lift: number; reynolds: number; live: boolean; fps: number } | null>(null);
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

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    forceBaselineRef.current = forceBaseline;
  }, [forceBaseline]);

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
            setProfile({
              polygon: remapToTunnelFrame(payload.polygon, aspect),
              wheelArches: Array.isArray(payload.wheelArches) ? payload.wheelArches : [],
              aspect,
              details: Array.isArray(payload.details) ? payload.details : [],
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
              wheelArches: Array.isArray(payload.wheelArches) ? payload.wheelArches : [],
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
  }, [controls.silhouetteMode, controls.drsOpen, controls.airfoilAngleDeg, constructorSlug, accentColor]);

  // Build the obstacle mask on the solver grid. Empty until the profile loads.
  const mask = useMemo(() => {
    if (!profile) return new Uint8Array(SOLVER_NX * SOLVER_NY);
    return buildMask(profile.polygon, SOLVER_NX, SOLVER_NY);
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
    fluidFrameRef.current = { u: null, v: null, speed: null, pressure: null, drag: 0, lift: 0, ready: false, lastFrameAt: 0 };
    worker.postMessage({ type: "init", airspeed: controls.airspeed, mask });

    function handleMessage(event: MessageEvent) {
      if (cancelled) return;
      const data = event.data;
      if (!data || data.type !== "frame") return;
      fluidFrameRef.current = {
        u: new Float32Array(data.u),
        v: new Float32Array(data.v),
        speed: new Float32Array(data.speed),
        pressure: new Float32Array(data.pressure),
        drag: data.drag ?? 0,
        lift: data.lift ?? 0,
        ready: true,
        lastFrameAt: performance.now(),
      };
    }
    worker.addEventListener("message", handleMessage);

    let stop = false;
    const tick = () => {
      if (stop || !worker) return;
      const latestControls = controlsRef.current;
      worker.postMessage({
        type: "tick",
        airspeed: latestControls.airspeed,
        yawDeg: latestControls.yawDeg,
        windSourceY: latestControls.windSourceY,
        groundMode: latestControls.groundMode,
        wheelMode: latestControls.wheelMode,
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
    if (workerRef.current) workerRef.current.postMessage({ type: "set-mask", mask });
    fluidFrameRef.current = { u: null, v: null, speed: null, pressure: null, drag: 0, lift: 0, ready: false, lastFrameAt: 0 };
    forceBaselineRef.current = null;
    setForceBaseline(null);
  }, [mask]);

  // Initialise particle pool. Each particle has a fading trail so the field
  // reads as streaklines instead of dust.
  useEffect(() => {
    const list: ParticleState[] = [];
    for (let i = 0; i < controls.particles; i += 1) {
      const trail = new Float32Array(TRAIL_LENGTH * 2);
      const x = Math.random() * 0.05;
      const y = spawnParticleY(controls.windSourceY);
      for (let t = 0; t < TRAIL_LENGTH; t += 1) {
        trail[t * 2] = x;
        trail[t * 2 + 1] = y;
      }
      list.push({ x, y, age: Math.random() * 200, trail, trailHead: 0 });
    }
    particlesRef.current = list;
  }, [controls.particles, controls.windSourceY]);

  // Pointer hover handlers for the live readout.
  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
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

    const animationStartedAt = performance.now();
    let frameTickCount = 0;
    let lastFpsRead = animationStartedAt;
    let measuredFps = 0;
    let lastForceRead = performance.now();
    let lastHoverRead = performance.now();

    function clearStage() {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(STAGE_WIDTH * dpr);
      const targetH = Math.round(STAGE_HEIGHT * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    function sampleField(nx: number, ny: number) {
      const frame = fluidFrameRef.current;
      if (frame.ready && frame.u && frame.v) {
        const xi = Math.max(0, Math.min(SOLVER_NX - 1, Math.floor(nx * SOLVER_NX)));
        const yi = Math.max(0, Math.min(SOLVER_NY - 1, Math.floor(ny * SOLVER_NY)));
        const i = yi * SOLVER_NX + xi;
        return {
          u: frame.u[i],
          v: frame.v[i],
          speed: frame.speed?.[i] ?? Math.hypot(frame.u[i], frame.v[i]),
          pressure: frame.pressure?.[i] ?? 0,
        };
      }
      return null;
    }

    function drawStreaklines() {
      if (!ctx || !controls.showStreamlines) return;
      const particles = particlesRef.current;
      const yawRad = (controls.yawDeg * Math.PI) / 180;
      const yawCos = Math.cos(yawRad);
      const yawSin = Math.sin(yawRad);
      const baseStep = (controls.airspeed / 80) * 0.0085;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const particle of particles) {
        const sample = sampleField(particle.x, particle.y);
        const u = sample ? sample.u * 0.012 : baseStep * yawCos;
        const v = sample ? sample.v * 0.012 : baseStep * yawSin;
        if (
          particle.age <= 0
          || particle.x > 1.05
          || particle.x < -0.05
          || particle.y < -0.02
          || particle.y > 1.02
          || (sample && sample.speed === 0)
        ) {
          particle.x = -0.04 + Math.random() * 0.08;
          particle.y = spawnParticleY(controls.windSourceY);
          particle.age = 220 + Math.random() * 120;
          for (let t = 0; t < TRAIL_LENGTH; t += 1) {
            particle.trail[t * 2] = particle.x;
            particle.trail[t * 2 + 1] = particle.y;
          }
          continue;
        }
        particle.trail[particle.trailHead * 2] = particle.x;
        particle.trail[particle.trailHead * 2 + 1] = particle.y;
        particle.trailHead = (particle.trailHead + 1) % TRAIL_LENGTH;
        particle.x += u;
        particle.y += v;
        particle.age -= 1;
        const intensity = Math.min(1, sample ? sample.speed * 0.85 : 0.4);
        const alpha = (0.32 + 0.45 * intensity).toFixed(3);
        const r = Math.round(120 + 110 * intensity);
        const g = Math.round(200 + 35 * intensity);
        const b = 255;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.lineWidth = 0.9 + intensity * 1.1;
        ctx.beginPath();
        for (let t = 0; t < TRAIL_LENGTH; t += 1) {
          const ringIdx = (particle.trailHead + t) % TRAIL_LENGTH;
          const px = particle.trail[ringIdx * 2] * STAGE_WIDTH;
          const py = particle.trail[ringIdx * 2 + 1] * STAGE_HEIGHT;
          if (t === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
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
      const dashOffset = (elapsedMs * speed * 0.014) % 36;
      ctx.save();
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.setLineDash([18, 18]);
      ctx.lineDashOffset = -dashOffset;
      for (const lane of INLET_LANES) {
        ctx.strokeStyle = "rgba(150, 200, 255, 0.42)";
        ctx.beginPath();
        ctx.moveTo(0, lane * STAGE_HEIGHT);
        ctx.lineTo(STAGE_WIDTH * 0.16, lane * STAGE_HEIGHT);
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
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(STAGE_WIDTH, y + yawOffset);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(24, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = "700 10px IBM Plex Mono, Consolas, monospace";
      ctx.fillStyle = "rgba(220, 242, 254, 0.9)";
      ctx.fillText("WIND RAKE", 44, y + 4);
      ctx.restore();
    }

    function drawWakePuff(elapsedMs: number) {
      if (!ctx || !profile) return;
      let maxX = -Infinity, midY = 0, midCount = 0;
      for (const [x, y] of profile.polygon) {
        if (x > maxX) maxX = x;
        midY += y; midCount += 1;
      }
      midY /= Math.max(1, midCount);
      const cx = maxX * STAGE_WIDTH;
      const cy = midY * STAGE_HEIGHT;
      const phase = (elapsedMs * 0.0025) % (Math.PI * 2);
      ctx.save();
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255, 188, 120, 0.32)";
      const wakeWidth = STAGE_WIDTH * 0.10;
      for (let i = 0; i < 4; i += 1) {
        const t = (elapsedMs * 0.001 + i * 0.4) % 4;
        const xOff = wakeWidth * (t / 4);
        const yOff = Math.sin(phase + i) * 8;
        ctx.beginPath();
        ctx.arc(cx + xOff + 18, cy + yOff, 6 + i * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawSilhouette() {
      if (!ctx || !profile) return;
      const polygon = profile.polygon;
      if (!polygon.length) return;

      ctx.save();
      // Glossy paint with vertical gradient.
      ctx.shadowColor = "rgba(8, 12, 20, 0.55)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      const paint = ctx.createLinearGradient(0, 0, 0, STAGE_HEIGHT);
      paint.addColorStop(0, "rgba(28, 36, 50, 0.95)");
      paint.addColorStop(0.55, "rgba(15, 22, 36, 0.96)");
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

      // Team-colour accent stripe down the body.
      if (profile.details) {
        for (const detail of profile.details) {
          if (detail.kind === "stripe") {
            ctx.strokeStyle = `${accentColor}cc`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            for (let i = 0; i < detail.points.length; i += 1) {
              const [x, y] = detail.points[i];
              const px = x * STAGE_WIDTH;
              const py = y * STAGE_HEIGHT;
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
          } else if (detail.kind === "halo") {
            ctx.strokeStyle = "rgba(220, 232, 255, 0.65)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let i = 0; i < detail.points.length; i += 1) {
              const [x, y] = detail.points[i];
              const px = x * STAGE_WIDTH;
              const py = y * STAGE_HEIGHT;
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
          } else if (detail.kind === "rearWing") {
            ctx.strokeStyle = "rgba(220, 232, 255, 0.55)";
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            for (let i = 0; i < detail.points.length; i += 1) {
              const [x, y] = detail.points[i];
              const px = x * STAGE_WIDTH;
              const py = y * STAGE_HEIGHT;
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
        }
      }

      if (controls.showCp) {
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
        const range = pMax - pMin || 1;
        ctx.lineCap = "round";
        ctx.lineWidth = 3.2;
        for (let i = 0; i < polygon.length; i += 1) {
          const [x1, y1] = polygon[i];
          const [x2, y2] = polygon[(i + 1) % polygon.length];
          const t = (pressures[i] - pMin) / range;
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
        ctx.strokeStyle = `${accentColor}88`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (controls.wheelMode === "rotating") {
          ctx.strokeStyle = "rgba(220, 232, 255, 0.45)";
          ctx.lineWidth = 1;
          const phase = (performance.now() * controls.airspeed * 0.00012) % (Math.PI * 2);
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

    function drawLegend() {
      if (!ctx) return;
      const x = 16;
      const y = STAGE_HEIGHT - 78;
      ctx.fillStyle = "rgba(8, 12, 20, 0.8)";
      ctx.fillRect(x, y, 220, 60);
      ctx.strokeStyle = "rgba(120, 140, 170, 0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, 220, 60);
      ctx.font = "600 11px IBM Plex Mono, Consolas, monospace";
      ctx.fillStyle = "rgba(220, 230, 250, 0.95)";
      ctx.fillText("Streaklines · live u/v field", x + 10, y + 16);
      ctx.fillText("Boundary tint · pressure (Cp)", x + 10, y + 32);
      const scaleX = x + 10;
      const scaleY = y + 40;
      const scaleW = 200;
      const scaleH = 8;
      const grad = ctx.createLinearGradient(scaleX, scaleY, scaleX + scaleW, scaleY);
      grad.addColorStop(0, "rgba(60,160,220,1)");
      grad.addColorStop(1, "rgba(235,90,40,1)");
      ctx.fillStyle = grad;
      ctx.fillRect(scaleX, scaleY, scaleW, scaleH);
      ctx.fillStyle = "rgba(160, 180, 210, 0.85)";
      ctx.font = "10px IBM Plex Mono, Consolas, monospace";
      ctx.fillText("low Cp", scaleX, scaleY + scaleH + 11);
      ctx.textAlign = "right";
      ctx.fillText("high Cp", scaleX + scaleW, scaleY + scaleH + 11);
      ctx.textAlign = "start";
    }

    function frame() {
      if (!isVisibleRef.current) {
        animationRef.current = requestAnimationFrame(frame);
        return;
      }
      const now = performance.now();
      const elapsed = now - animationStartedAt;
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
        drawStreaklines();
        drawWakePuff(elapsed);
        drawSilhouette();
      }
      drawHoverProbe();
      drawLegend();

      if (now - lastForceRead > 750) {
        lastForceRead = now;
        const f = fluidFrameRef.current;
        const reynolds = (controls.airspeed * 5.5) / 1.5e-5;
        const live = now - f.lastFrameAt < 600 && f.ready;
        if (f.ready && !forceBaselineRef.current && Math.abs(f.drag) > 0.001) {
          const baseline = { drag: f.drag, lift: f.lift };
          forceBaselineRef.current = baseline;
          setForceBaseline(baseline);
        }
        setReadout({ drag: f.drag, lift: f.lift, reynolds, live, fps: measuredFps });
      }
      if (now - lastHoverRead > 80) {
        lastHoverRead = now;
        const hover = hoverRef.current;
        if (hover.active) {
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
  }, [accentColor, controls, profile]);

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

  return (
    <div className="wind-tunnel" data-constructor={constructorSlug ?? "default"}>
      <div className="wind-tunnel__header">
        <p className="eyebrow">Wind tunnel · 2D Navier-Stokes</p>
        <h3>Airflow simulation around {modelTitle}</h3>
        <p className="wind-tunnel__copy">
          {SOLVER_NX} × {SOLVER_NY} grid, semi-Lagrangian advection with {20} Jacobi pressure projections per tick,
          running in a Web Worker. Streaklines are particles advected through the live u/v field; boundary tint is the pressure (Cp) at the surface.
          Visual guide for intuition: controls alter the obstacle and inlet field, but coefficients remain illustrative.
        </p>
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
        <div className="wind-tunnel__stage-hint">Click the canvas to place the wind rake · hover to probe U/Cp/vorticity</div>
        <div className="wind-tunnel__readout">
          <span className={`wind-tunnel__live${readout?.live ? " wind-tunnel__live--on" : ""}`}>{readout?.live ? "live" : "idle"}</span>
          <span>Drag <strong>{readout?.drag.toFixed(2) ?? "-"}</strong></span>
          <span>Lift <strong>{readout?.lift.toFixed(2) ?? "-"}</strong></span>
          <span>Cd <strong>{estimatedCd.toFixed(2)}</strong></span>
          <span>Cl <strong>{estimatedCl.toFixed(2)}</strong></span>
          <span>Cy <strong>{estimatedCy.toFixed(2)}</strong></span>
          <span>ΔD <strong>{readout ? signed(dragDelta) : "-"}</strong></span>
          <span>ΔL <strong>{readout ? signed(liftDelta) : "-"}</strong></span>
          <span>Re <strong>{readout?.reynolds ? `${(readout.reynolds / 1e6).toFixed(2)}M` : "-"}</strong></span>
          <span>FPS <strong>{readout?.fps ? readout.fps.toFixed(0) : "-"}</strong></span>
        </div>
        {hoverData ? (
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

      <div className="wind-tunnel__mode" role="tablist" aria-label="Silhouette source">
        {(["procedural", "airfoil", "svg", "glb"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={controls.silhouetteMode === mode}
            className={`wind-tunnel__mode-button${controls.silhouetteMode === mode ? " wind-tunnel__mode-button--active" : ""}`}
            onClick={() => setControls((prev) => ({ ...prev, silhouetteMode: mode }))}
            title={mode === "procedural"
              ? "Hand-tuned canonical F1 outline (always available)"
              : mode === "airfoil"
                ? "NACA-style wing section for validating angle-of-attack flow"
                : mode === "svg"
                  ? "Hand-curated per-constructor SVG"
                  : "GLB-derived column-envelope hull"}
          >
            {mode === "procedural" ? "Procedural" : mode === "airfoil" ? "Airfoil" : mode === "svg" ? "SVG art" : "GLB hull"}
          </button>
        ))}
        <span className="wind-tunnel__mode-source">
          Silhouette: <strong>{profile?.source ?? "-"}</strong>
        </span>
      </div>

      <div className="wind-tunnel__controls">
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
        <label>
          <span>Particles</span>
          <input
            type="range"
            min={0}
            max={1200}
            step={20}
            value={controls.particles}
            onChange={(event) => setControls((prev) => ({ ...prev, particles: Number(event.target.value) }))}
          />
          <strong>{controls.particles}</strong>
        </label>
        {controls.silhouetteMode !== "airfoil" ? (
          <label className="wind-tunnel__toggle">
            <input
              type="checkbox"
              checked={controls.drsOpen}
              onChange={(event) => setControls((prev) => ({ ...prev, drsOpen: event.target.checked }))}
            />
            <span>DRS open</span>
          </label>
        ) : null}
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
          <span>Wheels rotating</span>
        </label>
        <label className="wind-tunnel__toggle">
          <input
            type="checkbox"
            checked={controls.showStreamlines}
            onChange={(event) => setControls((prev) => ({ ...prev, showStreamlines: event.target.checked }))}
          />
          <span>Streaklines</span>
        </label>
        <label className="wind-tunnel__toggle">
          <input
            type="checkbox"
            checked={controls.showCp}
            onChange={(event) => setControls((prev) => ({ ...prev, showCp: event.target.checked }))}
          />
          <span>Pressure (live)</span>
        </label>
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
  // Sit the silhouette so its floor (y=1 in source) ends a hair above the
  // rolling-road band at y ≈ 0.92 of the canvas.
  const yFloor = 0.90;
  const yMin = yFloor - fracH;
  return { fracW, fracH, xMin, yMin };
}

/**
 * Rasterize the silhouette polygon onto the solver grid as a Uint8Array mask.
 */
function buildMask(polygon: Array<[number, number]>, nx: number, ny: number): Uint8Array {
  const mask = new Uint8Array(nx * ny);
  const xs = polygon.map((p) => p[0] * nx);
  const ys = polygon.map((p) => p[1] * ny);
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, xs, ys)) {
        mask[y * nx + x] = 1;
      }
    }
  }
  return mask;
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

function spawnParticleY(center: number) {
  const spread = 0.16;
  return Math.max(0.02, Math.min(0.98, center + (Math.random() - 0.5) * spread));
}

function signed(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
