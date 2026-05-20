"use client";

/**
 * Tier 1 Canvas Wind Tunnel.
 *
 * 2D illustrative airflow over a stylised car silhouette. Streamlines come from a
 * potential-flow ellipsoid plus a downstream Karman wake function; particles drift
 * along that vector field at 60 Hz. Pressure tint is a procedural function of yaw
 * and DRS state. Marked clearly as a visual guide -- not a measured aerodynamic
 * result.
 */

import { useEffect, useMemo, useRef, useState } from "react";

type GroundMode = "rolling" | "fixed";
type WheelMode = "rotating" | "stationary";

interface WindTunnelControls {
  airspeed: number; // m/s
  yawDeg: number;
  rideHeightMm: number;
  drsOpen: boolean;
  groundMode: GroundMode;
  wheelMode: WheelMode;
}

const DEFAULT_CONTROLS: WindTunnelControls = {
  airspeed: 80,
  yawDeg: 0,
  rideHeightMm: 28,
  drsOpen: false,
  groundMode: "rolling",
  wheelMode: "rotating",
};

interface ParticleState {
  x: number;
  y: number;
  speed: number;
  life: number;
}

const WIND_WIDTH = 920;
const WIND_HEIGHT = 360;
const PARTICLE_COUNT = 320;

/**
 * Returns (vx, vy) at world point (x, y) using a potential-flow doublet plus a
 * downstream wake. Inputs are normalised to [-1, 1] horizontally, [-1, 1] vertically.
 */
function fieldVelocity(x: number, y: number, controls: WindTunnelControls) {
  const yawRad = (controls.yawDeg * Math.PI) / 180;
  // Background flow: scaled by airspeed.
  const u0 = (controls.airspeed / 80) * Math.cos(yawRad);
  const v0 = (controls.airspeed / 80) * Math.sin(yawRad);

  // Doublet (the car body) located at origin, deflects flow around an ellipse.
  const a = 0.42; // half body length
  const b = 0.16; // half body height
  const dx = x;
  const dy = y;
  const r2 = (dx * dx) / (a * a) + (dy * dy) / (b * b);
  const insideBody = r2 < 1.0;
  const doubletStrength = 0.7;
  const denom = Math.max(0.05, dx * dx + dy * dy);
  const ud = doubletStrength * ((dx * dx - dy * dy) / (denom * denom));
  const vd = doubletStrength * ((2 * dx * dy) / (denom * denom));

  // Karman wake downstream of the body.
  let uw = 0;
  let vw = 0;
  if (dx > 0.45) {
    const t = (dx - 0.45) * 6;
    const phase = t - performance.now() / 480;
    const intensity = controls.drsOpen ? 0.18 : 0.32;
    uw = -Math.cos(phase) * intensity * Math.exp(-Math.abs(dy) * 6);
    vw = Math.sin(phase) * intensity * Math.exp(-Math.abs(dy) * 6) * (dy < 0 ? -1 : 1);
  }

  // Floor channel acceleration.
  let floor = 0;
  if (Math.abs(dy) < 0.12 && dx > -0.4 && dx < 0.4) {
    floor = (controls.rideHeightMm < 35 ? 0.55 : 0.32) * (1 - Math.abs(dy) / 0.12);
  }

  // Inside the body, freeze particles to keep them from passing through.
  if (insideBody) {
    return { u: 0, v: 0, inside: true } as const;
  }

  return {
    u: u0 + ud + uw + floor,
    v: v0 - vd + vw,
    inside: false,
  } as const;
}

function pressureTint(x: number, y: number, controls: WindTunnelControls) {
  const v = fieldVelocity(x, y, controls);
  if (v.inside) return null;
  const speed = Math.hypot(v.u, v.v);
  // Bernoulli-ish: faster flow → lower pressure (cool blue), slower → higher (warm red).
  const cp = Math.max(-1.5, Math.min(1.2, 1 - speed * speed));
  const t = (cp + 1.5) / 2.7; // 0 = low pressure, 1 = high pressure
  // Blue (low) → orange (high) gradient.
  const r = Math.round(80 + (255 - 80) * t);
  const g = Math.round(150 + (130 - 150) * t);
  const b = Math.round(220 + (60 - 220) * t);
  return `rgba(${r}, ${g}, ${b}, 0.16)`;
}

export interface CanvasWindTunnelProps {
  modelTitle: string;
}

export function CanvasWindTunnel({ modelTitle }: CanvasWindTunnelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<ParticleState[]>([]);
  const animationRef = useRef<number | null>(null);
  const [controls, setControls] = useState<WindTunnelControls>(DEFAULT_CONTROLS);

  // Stable seed for initial particle layout.
  useMemo(() => {
    const list: ParticleState[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      list.push({
        x: Math.random() * 2 - 1.2,
        y: (Math.random() - 0.5) * 1.4,
        speed: 0,
        life: Math.random() * 90,
      });
    }
    particlesRef.current = list;
    return list;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function toScreen(x: number, y: number) {
      return {
        sx: WIND_WIDTH / 2 + x * (WIND_WIDTH / 2.4),
        sy: WIND_HEIGHT / 2 + y * (WIND_HEIGHT / 2.2),
      };
    }

    function draw() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(WIND_WIDTH * dpr);
      const targetH = Math.round(WIND_HEIGHT * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Soft trails: paint a low-alpha background over the previous frame.
      ctx.fillStyle = "rgba(7, 9, 15, 0.18)";
      ctx.fillRect(0, 0, WIND_WIDTH, WIND_HEIGHT);

      // Pressure heat-tint band sampled on a coarse grid behind the particles.
      const cellW = 32;
      const cellH = 32;
      for (let cx = 0; cx < WIND_WIDTH; cx += cellW) {
        for (let cy = 0; cy < WIND_HEIGHT; cy += cellH) {
          const wx = (cx - WIND_WIDTH / 2) / (WIND_WIDTH / 2.4);
          const wy = (cy - WIND_HEIGHT / 2) / (WIND_HEIGHT / 2.2);
          const tint = pressureTint(wx, wy, controls);
          if (!tint) continue;
          ctx.fillStyle = tint;
          ctx.fillRect(cx, cy, cellW + 1, cellH + 1);
        }
      }

      // Car silhouette: stylised side-profile ellipse plus a wing.
      ctx.save();
      const center = toScreen(0, 0);
      ctx.translate(center.sx, center.sy);
      ctx.rotate((controls.yawDeg * Math.PI) / 180 / 4);
      ctx.fillStyle = "rgba(247, 250, 255, 0.94)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.beginPath();
      ctx.ellipse(0, 6, 200, 36, 0, 0, Math.PI * 2);
      ctx.fill();
      // Front wing block.
      ctx.fillStyle = "rgba(255, 122, 26, 0.85)";
      ctx.fillRect(-220, -4, 30, 14);
      // Rear wing.
      ctx.fillStyle = controls.drsOpen ? "rgba(34, 197, 94, 0.85)" : "rgba(255, 122, 26, 0.85)";
      ctx.fillRect(186, -32, 28, 24);
      // Floor line.
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.fillRect(-180, 24, 360, 4);
      ctx.restore();

      // Update + draw particles.
      const particles = particlesRef.current;
      for (const particle of particles) {
        const v = fieldVelocity(particle.x, particle.y, controls);
        if (v.inside || particle.life <= 0 || particle.x > 1.4) {
          particle.x = -1.25 + (Math.random() - 0.5) * 0.2;
          particle.y = (Math.random() - 0.5) * 1.4;
          particle.life = 80 + Math.random() * 60;
          particle.speed = 0;
          continue;
        }
        const stepScale = 0.018;
        particle.x += v.u * stepScale;
        particle.y += v.v * stepScale;
        particle.speed = Math.hypot(v.u, v.v);
        particle.life -= 1;

        const screen = toScreen(particle.x, particle.y);
        const intensity = Math.min(1, particle.speed * 0.85);
        const alpha = 0.35 + 0.55 * intensity;
        ctx.fillStyle = `rgba(${Math.round(120 + 135 * intensity)}, ${Math.round(190 + 30 * intensity)}, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(screen.sx, screen.sy, 1.1 + intensity * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [controls]);

  return (
    <div className="wind-tunnel">
      <div className="wind-tunnel__header">
        <div>
          <p className="eyebrow">Canvas wind tunnel · Tier 1</p>
          <h3>Airflow sketch around {modelTitle}</h3>
          <p className="wind-tunnel__copy">
            Streamlines, particle drift, and pressure tint over a stylised side profile. Visual guide only — not a measured aerodynamic result. Tier 2 LBM solver coming next.
          </p>
        </div>
      </div>

      <div className="wind-tunnel__stage">
        <canvas ref={canvasRef} width={WIND_WIDTH} height={WIND_HEIGHT} className="wind-tunnel__canvas" />
        <div className="wind-tunnel__legend">
          <span><span className="wind-tunnel__chip wind-tunnel__chip--low" /> Low pressure</span>
          <span><span className="wind-tunnel__chip wind-tunnel__chip--high" /> High pressure</span>
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
      </div>
    </div>
  );
}
