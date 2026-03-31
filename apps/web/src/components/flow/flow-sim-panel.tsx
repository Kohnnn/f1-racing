"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FLOW_SIMULATION_DEFAULTS } from "@/lib/flow/defaults";
import { analyzeMaskImageData, formatMetricValue, indexAt, type FlowMetrics } from "@/lib/flow/field";
import { ProjectedFlowSolver, type FlowSnapshot } from "@/lib/flow/lbm";
import type { FlowCarEntry } from "@/lib/flow/types";

type FlowMode = "streamlines" | "velocity" | "wake";

const GRID_W = 256;
const GRID_H = 144;
const SOLVER_STEPS_PER_FRAME = 4;
const STREAMLINES_PER_ROW = 14;
const STREAMLINE_SEED_X = 2;
const STREAMLINE_MAX_STEPS = GRID_W * 2;
const STREAMLINE_MIN_SPEED = 0.001;
const METRIC_UPDATE_INTERVAL = 6;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function speedToInflow(speedMps: number) {
  return 0.04 + ((speedMps - 20) / 40) * 0.055;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  snap: FlowSnapshot,
  mode: FlowMode,
  cw: number,
  ch: number,
) {
  const fw = snap.width;
  const fh = snap.height;
  const sx = cw / fw;
  const sy = ch / fh;
  const inflowSpeed = snap.inflowVelocity * 2.8;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const imgData = ctx.createImageData(cw, ch);
  const px = imgData.data;

  for (let py = 0; py < ch; py += 1) {
    for (let px2 = 0; px2 < cw; px2 += 1) {
      const gx = Math.min(fw - 1, Math.floor(px2 / sx));
      const gy = Math.min(fh - 1, Math.floor(py / sy));
      const sIdx = indexAt(gx, gy, fw);
      const pIdx = (py * cw + px2) * 4;

      if (snap.obstacle[sIdx]) {
        px[pIdx] = 0; px[pIdx + 1] = 0; px[pIdx + 2] = 0; px[pIdx + 3] = 0;
        continue;
      }

      const speed = snap.speed[sIdx];
      const wake = snap.wake[sIdx];
      const sNorm = clamp(speed / inflowSpeed, 0, 1);
      const wNorm = clamp(wake, 0, 1);

      let r: number, gv: number, b: number;

      if (mode === "wake") {
        if (wNorm < 0.04) {
          r = 248; gv = 244; b = 240;
        } else {
          const t = (wNorm - 0.04) / 0.96;
          r = Math.round(248 - t * 120);
          gv = Math.round(244 - t * 130);
          b = Math.round(240 - t * 160);
        }
      } else if (mode === "velocity") {
        if (sNorm < 0.25) {
          const t = sNorm / 0.25;
          r = Math.round(8 + t * 40);
          gv = Math.round(30 + t * 80);
          b = Math.round(100 + t * 80);
        } else {
          const t = (sNorm - 0.25) / 0.75;
          r = Math.round(48 + t * 20);
          gv = Math.round(110 + t * 110);
          b = Math.round(180 + t * 40);
        }
      } else {
        r = 248; gv = 244; b = 240;
      }

      px[pIdx] = r; px[pIdx + 1] = gv; px[pIdx + 2] = b; px[pIdx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  ctx.restore();
}

function catmullRom(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function drawStreamlines(
  ctx: CanvasRenderingContext2D,
  snap: FlowSnapshot,
  cw: number,
  ch: number,
  inflowSpeed: number,
) {
  const fw = snap.width;
  const fh = snap.height;
  const sx = cw / fw;
  const sy = ch / fh;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 1.2;

  const nRows = STREAMLINES_PER_ROW;
  const yStep = (fh - 10) / (nRows + 1);
  const step = 1.5;
  const seedX = clamp(STREAMLINE_SEED_X, 1, fw - 2);

  const slowColor: [number, number, number] = [45, 65, 100];
  const fastColor: [number, number, number] = [90, 135, 185];

  for (let row = 1; row <= nRows; row++) {
    const startY = Math.round(row * yStep);
    if (snap.obstacle[indexAt(seedX, startY, fw)] > 0) continue;

    const rawPts: Array<[number, number]> = [[seedX, startY]];
    const rawSpd: number[] = [0];
    let cx = seedX;
    let cy = startY;

    for (let traceStep = 0; traceStep < STREAMLINES_MAX_STEPS; traceStep += 1) {
      const sampleX = clamp(Math.round(cx), 0, fw - 1);
      const sampleY = clamp(Math.round(cy), 0, fh - 1);
      const idx = indexAt(sampleX, sampleY, fw);
      if (snap.obstacle[idx] > 0) break;

      const vx = snap.velocityX[idx];
      const vy = snap.velocityY[idx];
      const spd = Math.hypot(vx, vy);
      if (!Number.isFinite(spd) || spd < STREAMLINE_MIN_SPEED) break;

      cx += (vx / spd) * step;
      cy += (vy / spd) * step;
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) break;

      rawPts.push([cx, cy]);
      rawSpd.push(spd);

      if (cx < 1 || cx >= fw - 1 || cy < 1 || cy >= fh - 1) break;
    }

    if (rawPts.length < 5) continue;

    const nSegs = 8;
    const totalLen = rawPts.length;

    for (let seg = 0; seg < totalLen - 1; seg++) {
      const p0 = rawPts[Math.max(0, seg - 1)];
      const p1 = rawPts[seg];
      const p2 = rawPts[Math.min(totalLen - 1, seg + 1)];
      const p3 = rawPts[Math.min(totalLen - 1, seg + 2)];

      const spd1 = rawSpd[seg] ?? 0;
      const spd2 = rawSpd[Math.min(seg + 1, totalLen - 1)] ?? 0;
      const spdNorm1 = clamp(spd1 / (inflowSpeed * 2.8), 0, 1);
      const spdNorm2 = clamp(spd2 / (inflowSpeed * 2.8), 0, 1);

      for (let sub = 0; sub < nSegs; sub++) {
        const t = sub / nSegs;
        const pt = catmullRom(p0, p1, p2, p3, t);
        const ptNext = catmullRom(p0, p1, p2, p3, (sub + 1) / nSegs);

        const spdNorm = spdNorm1 + (spdNorm2 - spdNorm1) * t;
        const r = Math.round(slowColor[0] + (fastColor[0] - slowColor[0]) * spdNorm);
        const g = Math.round(slowColor[1] + (fastColor[1] - slowColor[1]) * spdNorm);
        const b = Math.round(slowColor[2] + (fastColor[2] - slowColor[2]) * spdNorm);

        ctx.strokeStyle = `rgba(${r},${g},${b},0.42)`;
        ctx.beginPath();
        ctx.moveTo(pt[0] * sx, pt[1] * sy);
        ctx.lineTo(ptNext[0] * sx, ptNext[1] * sy);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

const STREAMLINES_MAX_STEPS = 512;

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  maskImage: HTMLImageElement,
  cw: number,
  ch: number,
) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.24;
  ctx.filter = "brightness(0.05) saturate(0.6)";
  ctx.shadowColor = "rgba(15, 23, 42, 0.34)";
  ctx.shadowBlur = 26;
  ctx.drawImage(maskImage, 0, 0, cw, ch);
  ctx.restore();

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.98;
  ctx.filter = "brightness(0.08) saturate(0.8)";
  ctx.drawImage(maskImage, 0, 0, cw, ch);
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, carName: string, speedMps: number, mode: FlowMode) {
  ctx.save();
  const ink = mode === "velocity" ? "rgba(255,255,255,0.72)" : "rgba(25,32,43,0.72)";
  const subInk = mode === "velocity" ? "rgba(255,255,255,0.42)" : "rgba(25,32,43,0.44)";
  ctx.fillStyle = ink;
  ctx.font = "600 12px Aptos, Segoe UI, sans-serif";
  ctx.fillText(`${carName} · ${speedMps} m/s`, 18, 28);
  ctx.fillStyle = subInk;
  ctx.font = "400 10px Aptos, Segoe UI, sans-serif";
  ctx.fillText("Relative D2Q9 projected flow", 18, 46);
  ctx.restore();
}

interface FlowSimPanelProps {
  car: FlowCarEntry;
  mode: FlowMode;
  speedMps: number;
  isPlaying: boolean;
  onMetrics?: (metrics: FlowMetrics) => void;
}

export function FlowSimPanel({ car, mode, speedMps, isPlaying, onMetrics }: FlowSimPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const solverRef = useRef<ProjectedFlowSolver | null>(null);
  const maskImageRef = useRef<HTMLImageElement | null>(null);
  const maskDataRef = useRef<ReturnType<typeof analyzeMaskImageData> | null>(null);
  const frameRef = useRef<number | null>(null);
  const metricFrameRef = useRef(0);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    setError(null);
    solverRef.current = null;
    maskImageRef.current = null;
    maskDataRef.current = null;
    metricFrameRef.current = 0;

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      maskImageRef.current = img;

      const rc = document.createElement("canvas");
      rc.width = GRID_W;
      rc.height = GRID_H;
      const rctx = rc.getContext("2d", { willReadFrequently: true });
      if (!rctx) { setError("Canvas not available."); return; }

      rctx.clearRect(0, 0, GRID_W, GRID_H);
      rctx.drawImage(img, 0, 0, GRID_W, GRID_H);
      const id = rctx.getImageData(0, 0, GRID_W, GRID_H);

      try {
        const md = analyzeMaskImageData(id);
        maskDataRef.current = md;
        const solver = new ProjectedFlowSolver(md, speedToInflow(speedMps));
        solver.warmup(250);
        solverRef.current = solver;
        metricFrameRef.current = 0;
        const snap = solver.getSnapshot();
        setMetrics(snap.metrics);
        onMetrics?.(snap.metrics);
        setIsReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Solver init failed.");
      }
    };

    img.onerror = () => {
      if (!cancelled) setError(`Failed to load mask: ${car.topMaskPath}`);
    };

    img.src = car.topMaskPath;
    return () => { cancelled = true; };
  }, [car]);

  useEffect(() => {
    if (!isReady || !solverRef.current) return;

    const solver = solverRef.current;
    const nextInflow = speedToInflow(speedMps);
    if (Math.abs(solver.getSnapshot().inflowVelocity - nextInflow) < 1e-6) return;

    try {
      solver.reset(nextInflow);
      solver.warmup(250);
      metricFrameRef.current = 0;
      setMetrics(solver.getSnapshot().metrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Solver reset failed.");
    }
  }, [isReady, speedMps]);

  function setMetrics(m: FlowMetrics) {
    onMetrics?.(m);
  }

  useEffect(() => {
    if (!canvasRef.current || !solverRef.current || !maskDataRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      try {
        const solver = solverRef.current;
        const maskDt = maskDataRef.current;
        const maskImage = maskImageRef.current;
        if (!solver || !maskDt || !maskImage) return;

        if (isPlaying) {
          solver.step(SOLVER_STEPS_PER_FRAME);
          metricFrameRef.current = (metricFrameRef.current + 1) % METRIC_UPDATE_INTERVAL;
        }

        const snap = solver.getSnapshot();
        if (!isPlaying || metricFrameRef.current === 0) {
          setMetrics(snap.metrics);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground(ctx, snap, mode, canvas.width, canvas.height);
        if (mode === "streamlines") {
          drawStreamlines(ctx, snap, canvas.width, canvas.height, snap.inflowVelocity);
        }
        drawSilhouette(ctx, maskImage, canvas.width, canvas.height);
        drawLabel(ctx, car.name, speedMps, mode);
      } catch (err) {
        console.error("Render error:", err);
      }

      frameRef.current = window.requestAnimationFrame(render);
    };

    frameRef.current = window.requestAnimationFrame(render);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [isPlaying, mode, isReady, speedMps, car.name]);

  return (
    <div className="flow-sim-panel">
      <div className="flow-sim-panel__canvas-wrap">
        {error ? <div className="flow-empty">{error}</div> : null}
        {!error && !isReady ? <div className="flow-empty">Loading {car.name}...</div> : null}
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          style={{ width: "100%", height: "auto", display: "block", borderRadius: "16px" }}
        />
      </div>
    </div>
  );
}
