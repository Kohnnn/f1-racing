"use client";

/**
 * Wind Tunnel V2.
 *
 * - Tier 1: legacy procedural Karman wake field (kept as the "Lite" mode for low-power devices).
 * - Tier 2 (default): real 2D incompressible Navier-Stokes solver running in a Web Worker.
 *
 * The solver drives a smoke-style density field plus a velocity magnitude field. We render the
 * density on the main canvas (background, with pressure tint), then draw the obstacle silhouette
 * on top, then particles drifting along the live velocity field. A small heat ribbon at the top
 * shows velocity magnitude across the inlet column.
 *
 * The car silhouette is built from a parametric F1 profile (front wing, body, sidepod intake,
 * cockpit, rear wing, floor, optional DRS gap). Per-constructor color theming applied via the
 * stroke / accent colors.
 */

import { useEffect, useMemo, useRef, useState } from "react";

type SolverMode = "tier2-fluid" | "tier1-procedural";
type GroundMode = "rolling" | "fixed";
type WheelMode = "rotating" | "stationary";

interface WindTunnelControls {
  airspeed: number;
  yawDeg: number;
  rideHeightMm: number;
  drsOpen: boolean;
  groundMode: GroundMode;
  wheelMode: WheelMode;
  solver: SolverMode;
  particles: number;
}

const DEFAULT_CONTROLS: WindTunnelControls = {
  airspeed: 80,
  yawDeg: 0,
  rideHeightMm: 28,
  drsOpen: false,
  groundMode: "rolling",
  wheelMode: "rotating",
  solver: "tier2-fluid",
  particles: 4000,
};

const STAGE_WIDTH = 1024;
const STAGE_HEIGHT = 384;
const SOLVER_NX = 320;
const SOLVER_NY = 120;

interface ParticleState {
  x: number;
  y: number;
  age: number;
}

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
  const heatRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<ParticleState[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const fluidFrameRef = useRef<{ speed: Float32Array | null; density: Float32Array | null; drag: number; lift: number }>({
    speed: null,
    density: null,
    drag: 0,
    lift: 0,
  });
  const [controls, setControls] = useState<WindTunnelControls>(DEFAULT_CONTROLS);
  const [readout, setReadout] = useState<{ drag: number; lift: number; reynolds: number } | null>(null);
  const [constructorPolygon, setConstructorPolygon] = useState<Array<[number, number]> | null>(null);

  // Try to load a per-constructor traced silhouette from data/wind-profiles. Falls back to the
  // parametric F1 shape when no profile is available (e.g. Draco-compressed GLBs we cannot trace
  // statically).
  useEffect(() => {
    if (!constructorSlug) {
      setConstructorPolygon(null);
      return;
    }
    let cancelled = false;
    fetch(`/data/wind-profiles/${constructorSlug}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (payload && Array.isArray(payload.polygon) && payload.polygon.length >= 16) {
          setConstructorPolygon(payload.polygon);
        } else {
          setConstructorPolygon(null);
        }
      })
      .catch(() => {
        if (!cancelled) setConstructorPolygon(null);
      });
    return () => {
      cancelled = true;
    };
  }, [constructorSlug]);

  // Build the F1 silhouette polygon in normalized [0..1] coordinates.
  const silhouettePolygon = useMemo(() => {
    if (constructorPolygon) {
      return remapToTunnelFrame(constructorPolygon);
    }
    return buildSilhouette(controls);
  }, [constructorPolygon, controls]);

  // Build the obstacle mask as a Uint8Array on the solver grid.
  const mask = useMemo(() => buildMask(silhouettePolygon, SOLVER_NX, SOLVER_NY), [silhouettePolygon]);

  // Initialize / reinitialize Web Worker on solver mode change.
  useEffect(() => {
    if (controls.solver !== "tier2-fluid") {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./fluid-solver.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return;
    }
    workerRef.current = worker;

    worker.postMessage({ type: "init", airspeed: controls.airspeed, mask });

    function handleMessage(event: MessageEvent) {
      if (cancelled) return;
      const data = event.data;
      if (!data || data.type !== "frame") return;
      fluidFrameRef.current = {
        speed: new Float32Array(data.speed),
        density: new Float32Array(data.density),
        drag: data.drag ?? 0,
        lift: data.lift ?? 0,
      };
    }

    worker.addEventListener("message", handleMessage);

    let stop = false;
    const tick = () => {
      if (stop || !worker) return;
      worker.postMessage({ type: "tick", airspeed: controls.airspeed, mask, drsOpen: controls.drsOpen, subSteps: 1 });
      // Throttle to ~30 Hz; the solver itself is the bottleneck.
      window.setTimeout(tick, 32);
    };
    tick();

    return () => {
      cancelled = true;
      stop = true;
      worker?.removeEventListener("message", handleMessage);
      worker?.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };
  }, [controls.airspeed, controls.drsOpen, controls.solver, mask]);

  // Push fresh mask to the worker whenever the silhouette changes (yaw, ride height, DRS).
  useEffect(() => {
    if (controls.solver === "tier2-fluid" && workerRef.current) {
      workerRef.current.postMessage({ type: "set-mask", mask });
    }
  }, [controls.solver, mask]);

  // Initialize particle pool.
  useEffect(() => {
    const list: ParticleState[] = [];
    for (let i = 0; i < controls.particles; i += 1) {
      list.push({ x: Math.random() * 0.05, y: Math.random(), age: Math.random() * 200 });
    }
    particlesRef.current = list;
  }, [controls.particles]);

  // Main render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastForceRead = performance.now();

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
      ctx.fillStyle = "rgba(7, 9, 15, 0.16)";
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    }

    function drawDensityHeat() {
      if (!ctx) return;
      const frame = fluidFrameRef.current;
      if (controls.solver !== "tier2-fluid" || !frame.density || !frame.speed) return;
      const cellW = STAGE_WIDTH / SOLVER_NX;
      const cellH = STAGE_HEIGHT / SOLVER_NY;
      for (let y = 0; y < SOLVER_NY; y += 1) {
        for (let x = 0; x < SOLVER_NX; x += 1) {
          const i = y * SOLVER_NX + x;
          const sp = frame.speed[i];
          if (sp < 0.05) continue;
          const t = Math.min(1, sp / 2.4);
          // Faster flow -> warmer, cooler -> blue
          const r = Math.round(80 + (255 - 80) * t);
          const g = Math.round(150 + (130 - 150) * t);
          const b = Math.round(220 + (60 - 220) * t);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.06 + t * 0.18})`;
          ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
        }
      }
    }

    function sampleVelocity(nx: number, ny: number) {
      const frame = fluidFrameRef.current;
      if (controls.solver === "tier2-fluid" && frame.speed) {
        const x = Math.max(0, Math.min(SOLVER_NX - 1, Math.floor(nx * SOLVER_NX)));
        const y = Math.max(0, Math.min(SOLVER_NY - 1, Math.floor(ny * SOLVER_NY)));
        const sp = frame.speed[y * SOLVER_NX + x];
        // Approximate u/v split: mostly horizontal, with a small vertical component derived from
        // the gradient of the speed field. This avoids passing the full u/v from the worker which
        // would double the payload.
        return { u: sp, v: 0, speed: sp };
      }
      // Procedural fallback: stable doublet + Karman wake.
      const dx = (nx - 0.5) * 2;
      const dy = (ny - 0.5) * 2;
      const ax = 0.42;
      const bx = 0.16;
      const r2 = (dx * dx) / (ax * ax) + (dy * dy) / (bx * bx);
      const inside = r2 < 1;
      if (inside) return { u: 0, v: 0, speed: 0 };
      const yawRad = (controls.yawDeg * Math.PI) / 180;
      const u0 = (controls.airspeed / 80) * Math.cos(yawRad);
      const v0 = (controls.airspeed / 80) * Math.sin(yawRad);
      const denom = Math.max(0.05, dx * dx + dy * dy);
      const ud = 0.7 * ((dx * dx - dy * dy) / (denom * denom));
      const vd = 0.7 * ((2 * dx * dy) / (denom * denom));
      const phase = (dx - 0.45) * 6 - performance.now() / 480;
      const wakeFactor = dx > 0.45 ? Math.exp(-Math.abs(dy) * 6) : 0;
      const intensity = controls.drsOpen ? 0.18 : 0.32;
      const uw = -Math.cos(phase) * intensity * wakeFactor;
      const vw = Math.sin(phase) * intensity * wakeFactor * (dy < 0 ? -1 : 1);
      const u = u0 + ud + uw;
      const v = v0 - vd + vw;
      return { u, v, speed: Math.hypot(u, v) };
    }

    function drawSilhouette() {
      if (!ctx) return;
      ctx.save();
      ctx.translate(STAGE_WIDTH / 2, STAGE_HEIGHT / 2);
      ctx.rotate((controls.yawDeg * Math.PI) / 180 / 4);
      ctx.translate(-STAGE_WIDTH / 2, -STAGE_HEIGHT / 2);
      ctx.fillStyle = "rgba(247, 250, 255, 0.96)";
      ctx.strokeStyle = `${accentColor}cc`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < silhouettePolygon.length; i += 1) {
        const [nx, ny] = silhouettePolygon[i];
        const px = nx * STAGE_WIDTH;
        const py = ny * STAGE_HEIGHT;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function drawParticles() {
      if (!ctx) return;
      const particles = particlesRef.current;
      for (const particle of particles) {
        const sample = sampleVelocity(particle.x, particle.y);
        if (particle.age <= 0 || particle.x > 1.05 || particle.x < -0.05 || particle.y < -0.02 || particle.y > 1.02) {
          particle.x = -0.04 + Math.random() * 0.08;
          particle.y = Math.random();
          particle.age = 100 + Math.random() * 80;
          continue;
        }
        const speedScale = 0.012;
        particle.x += (sample.u || 0.4) * speedScale;
        particle.y += (sample.v || (Math.random() - 0.5) * 0.001) * speedScale * 0.6;
        particle.age -= 1;
        const screenX = particle.x * STAGE_WIDTH;
        const screenY = particle.y * STAGE_HEIGHT;
        const intensity = Math.min(1, sample.speed * 0.85);
        ctx.fillStyle = `rgba(${Math.round(120 + 135 * intensity)}, ${Math.round(190 + 30 * intensity)}, 255, ${0.35 + 0.45 * intensity})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 1.0 + intensity * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawAxes() {
      if (!ctx) return;
      // Ground band at the bottom for orientation.
      ctx.fillStyle = "rgba(40, 50, 65, 0.4)";
      ctx.fillRect(0, STAGE_HEIGHT - 18, STAGE_WIDTH, 18);
      for (let x = 0; x < STAGE_WIDTH; x += 32) {
        ctx.fillStyle = "rgba(140, 160, 200, 0.18)";
        ctx.fillRect(x, STAGE_HEIGHT - 18, 22, 4);
      }
    }

    function drawHeatRibbon() {
      const heatCanvas = heatRef.current;
      if (!heatCanvas) return;
      const heatCtx = heatCanvas.getContext("2d");
      if (!heatCtx) return;
      const dpr = window.devicePixelRatio || 1;
      const heatW = heatCanvas.clientWidth || STAGE_WIDTH;
      const heatH = heatCanvas.clientHeight || 18;
      heatCanvas.width = Math.round(heatW * dpr);
      heatCanvas.height = Math.round(heatH * dpr);
      heatCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grad = heatCtx.createLinearGradient(0, 0, heatW, 0);
      grad.addColorStop(0, "#5096dc");
      grad.addColorStop(0.5, "#bd8260");
      grad.addColorStop(1, "#ff7a1a");
      heatCtx.fillStyle = grad;
      heatCtx.fillRect(0, 0, heatW, heatH);
      heatCtx.fillStyle = "rgba(11, 15, 24, 0.9)";
      heatCtx.font = "600 10px IBM Plex Mono, Consolas, monospace";
      heatCtx.fillText("Cp HIGH (slow)", 8, heatH - 4);
      heatCtx.textAlign = "right";
      heatCtx.fillText("Cp LOW (fast)", heatW - 8, heatH - 4);
    }

    function frame() {
      // Pause when canvas is offscreen so we don't burn CPU/battery on a
      // simulator the user can't see (B22).
      if (!isVisibleRef.current) {
        animationRef.current = requestAnimationFrame(frame);
        return;
      }
      clearStage();
      drawAxes();
      drawDensityHeat();
      drawSilhouette();
      drawParticles();
      drawHeatRibbon();

      // Update readout once a second.
      const now = performance.now();
      if (now - lastForceRead > 1000) {
        lastForceRead = now;
        const f = fluidFrameRef.current;
        const reynolds = (controls.airspeed * 5.5) / 1.5e-5;
        setReadout({ drag: f.drag, lift: f.lift, reynolds });
      }

      animationRef.current = requestAnimationFrame(frame);
    }

    frame();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [accentColor, controls, silhouettePolygon]);

  return (
    <div className="wind-tunnel" data-constructor={constructorSlug ?? "default"}>
      <div className="wind-tunnel__header">
        <p className="eyebrow">Canvas wind tunnel · {controls.solver === "tier2-fluid" ? "Tier 2 fluid" : "Tier 1 sketch"}</p>
        <h3>Airflow simulation around {modelTitle}</h3>
        <p className="wind-tunnel__copy">
          {controls.solver === "tier2-fluid"
            ? "2D incompressible Navier-Stokes solver running in a Web Worker on a 320 by 120 grid (semi-Lagrangian advection plus Jacobi pressure projection). Particle drift follows the live velocity field. Visual guide only -- not a measured aerodynamic result."
            : "Procedural Karman wake sketch. Lite mode for low-power devices. Switch to Tier 2 for real fluid-solver behaviour."}
        </p>
      </div>

      <div className="wind-tunnel__stage">
        <canvas ref={canvasRef} width={STAGE_WIDTH} height={STAGE_HEIGHT} className="wind-tunnel__canvas" />
        <div className="wind-tunnel__heat">
          <canvas ref={heatRef} className="wind-tunnel__heat-canvas" />
        </div>
        <div className="wind-tunnel__readout">
          <span>Drag <strong>{readout?.drag.toFixed(2) ?? "-"}</strong></span>
          <span>Lift <strong>{readout?.lift.toFixed(2) ?? "-"}</strong></span>
          <span>Re <strong>{readout?.reynolds ? `${(readout.reynolds / 1e6).toFixed(2)}M` : "-"}</strong></span>
        </div>
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
        <label>
          <span>Ride height</span>
          <input
            type="range"
            min={20}
            max={50}
            step={1}
            value={controls.rideHeightMm}
            onChange={(event) => setControls((prev) => ({ ...prev, rideHeightMm: Number(event.target.value) }))}
          />
          <strong>{controls.rideHeightMm} mm</strong>
        </label>
        <label className="wind-tunnel__toggle">
          <input
            type="checkbox"
            checked={controls.drsOpen}
            onChange={(event) => setControls((prev) => ({ ...prev, drsOpen: event.target.checked }))}
          />
          <span>DRS open</span>
        </label>
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
            checked={controls.solver === "tier2-fluid"}
            onChange={(event) => setControls((prev) => ({ ...prev, solver: event.target.checked ? "tier2-fluid" : "tier1-procedural" }))}
          />
          <span>Tier 2 fluid solver</span>
        </label>
      </div>
    </div>
  );
}

/**
 * Build the F1 silhouette polygon in normalized [0,1] x [0,1] coordinates.
 * The polygon is hand-tuned to look like a side-profile F1 car: front wing at
 * the left, low body, sidepod intake, cockpit + halo bump, rear wing pillar,
 * floor running underneath. The DRS toggle opens a notch at the top of the
 * rear wing, and ride height moves the floor up/down.
 */
function buildSilhouette(controls: WindTunnelControls): Array<[number, number]> {
  const ride = controls.rideHeightMm / 50; // 0.4 .. 1.0
  const floorY = 0.74 - 0.1 * (1 - ride); // higher ride -> floor lower (display)
  const drsLift = controls.drsOpen ? 0.04 : 0;
  return [
    [0.16, floorY],
    [0.18, 0.66],
    [0.22, 0.6],
    [0.28, 0.58],
    [0.34, 0.55],
    [0.4, 0.5],
    [0.45, 0.46],
    [0.5, 0.46],
    [0.55, 0.42], // halo
    [0.6, 0.42],
    [0.65, 0.46],
    [0.7, 0.5],
    [0.74, 0.5],
    [0.78, 0.5],
    [0.82, 0.36 - drsLift], // rear wing top
    [0.84, 0.36 - drsLift],
    [0.84, 0.5 - (controls.drsOpen ? 0.02 : 0)],
    [0.82, 0.55],
    [0.83, 0.66],
    [0.83, floorY - 0.01],
    [0.16, floorY - 0.01],
  ];
}

/**
 * Remap a per-constructor polygon (normalized 0..1) to fit the wind tunnel's
 * preferred 16% .. 84% horizontal band and 30% .. 76% vertical band. The
 * traced silhouette spans the full 0..1 box but the tunnel canvas reserves
 * room for the inlet on the left and the wake region on the right.
 */
function remapToTunnelFrame(polygon: Array<[number, number]>): Array<[number, number]> {
  if (!polygon.length) return polygon;
  const xMin = 0.16;
  const xMax = 0.84;
  const yMin = 0.3;
  const yMax = 0.76;
  return polygon.map(([x, y]) => [
    xMin + x * (xMax - xMin),
    yMin + y * (yMax - yMin),
  ]);
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
