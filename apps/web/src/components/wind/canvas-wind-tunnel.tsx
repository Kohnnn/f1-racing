"use client";

/**
 * Wind Tunnel V4 (rewritten 2026-05-23).
 *
 * Visual goals:
 * - The streaklines you see are advected through the **live u/v field** the
 *   solver emits. There are no decorative bezier ribbons by default. Each
 *   particle traces a fading 18-sample ribbon so the field reads as flow.
 * - The silhouette uses the constructor's GLB-derived polygon **at its real
 *   aspect ratio**, letterboxed inside the tunnel band rather than stretched.
 * - Pressure (Cp) boundary tint is on by default so the diagram reads as
 *   "where is the air pushing on the body" without the user toggling.
 * - Hover the canvas to read local speed and pressure at the cursor cell.
 * - Pause when offscreen.
 */

import { useEffect, useMemo, useRef, useState } from "react";

type GroundMode = "rolling" | "fixed";
type WheelMode = "rotating" | "stationary";

interface WindTunnelControls {
  airspeed: number;
  yawDeg: number;
  rideHeightMm: number;
  drsOpen: boolean;
  groundMode: GroundMode;
  wheelMode: WheelMode;
  particles: number;
  showStreamlines: boolean;
  showCp: boolean;
}

const DEFAULT_CONTROLS: WindTunnelControls = {
  airspeed: 80,
  yawDeg: 0,
  rideHeightMm: 28,
  drsOpen: false,
  groundMode: "rolling",
  wheelMode: "rotating",
  particles: 360,
  showStreamlines: true,
  showCp: true,
};

const STAGE_WIDTH = 1024;
const STAGE_HEIGHT = 384;
const SOLVER_NX = 320;
const SOLVER_NY = 120;
const TRAIL_LENGTH = 18;

interface ParticleState {
  x: number;
  y: number;
  age: number;
  trail: Float32Array; // [x0, y0, x1, y1, ...] length TRAIL_LENGTH * 2
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

  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<ParticleState[]>([]);
  const workerRef = useRef<Worker | null>(null);
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
  const [readout, setReadout] = useState<{ drag: number; lift: number; reynolds: number; live: boolean } | null>(null);
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

  // Load constructor-specific silhouette JSON. We never fall back to a
  // parametric F1 cartoon -- if the profile is missing we tell the user.
  useEffect(() => {
    if (!constructorSlug) {
      setProfile(null);
      setProfileMissing(true);
      return;
    }
    let cancelled = false;
    setProfileMissing(false);
    setProfile(null);
    fetch(`/data/wind-profiles/${constructorSlug}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (payload && Array.isArray(payload.polygon) && payload.polygon.length >= 16) {
          const aspect = typeof payload.aspect === "number" ? payload.aspect : computeAspect(payload.polygon);
          const remapped = remapToTunnelFrame(payload.polygon, aspect);
          setProfile({
            polygon: remapped,
            wheelArches: Array.isArray(payload.wheelArches) ? payload.wheelArches : [],
            aspect,
          });
          setProfileMissing(false);
        } else {
          setProfileMissing(true);
        }
      })
      .catch(() => {
        if (!cancelled) setProfileMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [constructorSlug]);

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
      worker.postMessage({
        type: "tick",
        airspeed: controls.airspeed,
        mask,
        drsOpen: controls.drsOpen,
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
  }, [mask]);

  // Initialise particle pool. Each particle has a fading trail so the field
  // reads as streaklines instead of dust.
  useEffect(() => {
    const list: ParticleState[] = [];
    for (let i = 0; i < controls.particles; i += 1) {
      const trail = new Float32Array(TRAIL_LENGTH * 2);
      const x = Math.random() * 0.05;
      const y = Math.random();
      for (let t = 0; t < TRAIL_LENGTH; t += 1) {
        trail[t * 2] = x;
        trail[t * 2 + 1] = y;
      }
      list.push({ x, y, age: Math.random() * 200, trail, trailHead: 0 });
    }
    particlesRef.current = list;
  }, [controls.particles]);

  // Pointer hover handlers for the live readout.
  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    hoverRef.current = { active: true, nx, ny };
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
      ctx.fillStyle = "#070912";
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    }

    function drawAxes() {
      if (!ctx) return;
      ctx.strokeStyle = "rgba(120, 138, 168, 0.06)";
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
      ctx.fillStyle = "rgba(40, 50, 65, 0.6)";
      ctx.fillRect(0, STAGE_HEIGHT - 12, STAGE_WIDTH, 12);
      ctx.fillStyle = "rgba(140, 160, 200, 0.14)";
      for (let x = 0; x < STAGE_WIDTH; x += 28) {
        ctx.fillRect(x, STAGE_HEIGHT - 12, 18, 2);
      }
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
          particle.y = Math.random();
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

    function drawSilhouette() {
      if (!ctx || !profile) return;
      const polygon = profile.polygon;
      if (!polygon.length) return;

      ctx.save();
      ctx.shadowColor = "rgba(140, 200, 255, 0.18)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "rgba(247, 250, 255, 0.94)";
      silhouettePath(polygon);
      ctx.fill();
      ctx.shadowBlur = 0;

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
        ctx.lineWidth = 2.6;
        for (let i = 0; i < polygon.length; i += 1) {
          const [x1, y1] = polygon[i];
          const [x2, y2] = polygon[(i + 1) % polygon.length];
          const t = (pressures[i] - pMin) / range; // 0 = suction, 1 = stagnation
          const r = Math.round(60 + (235 - 60) * t);
          const g = Math.round(160 + (90 - 160) * t);
          const b = Math.round(220 + (40 - 220) * t);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.62)`;
          ctx.beginPath();
          ctx.moveTo(x1 * STAGE_WIDTH, y1 * STAGE_HEIGHT);
          ctx.lineTo(x2 * STAGE_WIDTH, y2 * STAGE_HEIGHT);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = `${accentColor}cc`;
        ctx.lineWidth = 2;
        silhouettePath(polygon);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = `${accentColor}aa`;
      for (const arch of profile.wheelArches) {
        ctx.beginPath();
        ctx.arc(arch.cx * STAGE_WIDTH, arch.cy * STAGE_HEIGHT, arch.r * STAGE_HEIGHT, 0, Math.PI * 2);
        ctx.stroke();
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
      clearStage();
      drawAxes();
      if (profile) {
        drawStreaklines();
        drawSilhouette();
      }
      drawHoverProbe();
      drawLegend();

      const now = performance.now();
      if (now - lastForceRead > 750) {
        lastForceRead = now;
        const f = fluidFrameRef.current;
        const reynolds = (controls.airspeed * 5.5) / 1.5e-5;
        const live = now - f.lastFrameAt < 600 && f.ready;
        setReadout({ drag: f.drag, lift: f.lift, reynolds, live });
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

  return (
    <div className="wind-tunnel" data-constructor={constructorSlug ?? "default"}>
      <div className="wind-tunnel__header">
        <p className="eyebrow">Wind tunnel · 2D Navier-Stokes</p>
        <h3>Airflow simulation around {modelTitle}</h3>
        <p className="wind-tunnel__copy">
          {SOLVER_NX} × {SOLVER_NY} grid, semi-Lagrangian advection with {20} Jacobi pressure projections per tick,
          running in a Web Worker. Streaklines are particles advected through the live u/v field; boundary tint is the pressure (Cp) at the surface.
          Visual guide for intuition, not a measured aerodynamic result.
        </p>
      </div>

      <div className="wind-tunnel__stage">
        <canvas
          ref={canvasRef}
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          className="wind-tunnel__canvas"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
        {!profile && profileMissing ? (
          <div className="wind-tunnel__overlay">
            <p>Silhouette not available for this constructor yet.</p>
            <p className="wind-tunnel__overlay-sub">
              Run <code>node pipeline/export/src/build-wind-profiles.mjs</code> after dropping the GLB into <code>apps/web/public/models/</code>.
            </p>
          </div>
        ) : null}
        {profile && !fluidFrameRef.current.ready ? (
          <div className="wind-tunnel__overlay wind-tunnel__overlay--soft">
            <p>Solver warming up...</p>
          </div>
        ) : null}
        <div className="wind-tunnel__readout">
          <span className={`wind-tunnel__live${readout?.live ? " wind-tunnel__live--on" : ""}`}>{readout?.live ? "live" : "idle"}</span>
          <span>Drag <strong>{readout?.drag.toFixed(2) ?? "-"}</strong></span>
          <span>Lift <strong>{readout?.lift.toFixed(2) ?? "-"}</strong></span>
          <span>Re <strong>{readout?.reynolds ? `${(readout.reynolds / 1e6).toFixed(2)}M` : "-"}</strong></span>
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
  // The on-canvas drawing space is STAGE_WIDTH x STAGE_HEIGHT (1024 x 384).
  // We want the silhouette to render at its real aspect inside that frame.
  // Available band spans 88% width, 60% height.
  const stageAspect = STAGE_WIDTH / STAGE_HEIGHT; // 2.667
  const availFracW = 0.88;
  const availFracH = 0.6;
  const availPxW = STAGE_WIDTH * availFracW;
  const availPxH = STAGE_HEIGHT * availFracH;
  // Real-world physical aspect of the car (length / height). We want
  // physical_aspect == width_px / height_px on screen. Solve for the
  // largest fit:
  let fitW = availPxW;
  let fitH = fitW / aspect;
  if (fitH > availPxH) {
    fitH = availPxH;
    fitW = fitH * aspect;
  }
  const fracW = fitW / STAGE_WIDTH;
  const fracH = fitH / STAGE_HEIGHT;
  const xMin = (1 - fracW) * 0.5;
  const yMin = 0.78 - fracH;
  return polygon.map(([x, y]) => [xMin + x * fracW, yMin + y * fracH]);
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
