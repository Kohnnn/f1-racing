"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { FLOW_SIMULATION_DEFAULTS } from "@/lib/flow/defaults";
import { analyzeMaskImageData, formatMetricValue, indexAt, type FlowMetrics } from "@/lib/flow/field";
import { ProjectedFlowSolver, type FlowSnapshot } from "@/lib/flow/lbm";
import type { FlowCarEntry } from "@/lib/flow/types";

type FlowMode = "streamlines" | "velocity" | "wake";

interface ProjectedFlowLabProps {
  cars: FlowCarEntry[];
  defaultCarId?: string;
}

const FLOW_MODE_LABELS: Array<{ id: FlowMode; label: string; description: string }> = [
  {
    id: "streamlines",
    label: "Streamlines",
    description: "Thin curves split around the car — each one is a real pathline traced through the solved velocity field.",
  },
  {
    id: "velocity",
    label: "Velocity",
    description: "Pixel-level speed map: deep blue near the car body where air slows, bright cyan in the free stream.",
  },
  {
    id: "wake",
    label: "Wake",
    description: "The low-energy wake region in warm tones — the disturbed air trail that causes drag.",
  },
];

const GRID_W = 256;
const GRID_H = 144;
const SOLVER_STEPS_PER_FRAME = 4;
const STREAMLINES_PER_ROW = 14;
const STREAMLINE_SEED_X = 2;
const STREAMLINE_MAX_STEPS = GRID_W * 2;
const STREAMLINE_MIN_SPEED = 0.001;
const METRIC_UPDATE_INTERVAL = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
        // Car body: leave as transparent — silhouette drawn separately
        px[pIdx] = 0;
        px[pIdx + 1] = 0;
        px[pIdx + 2] = 0;
        px[pIdx + 3] = 0;
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
        // Blue=slow near car, cyan=fast free-stream
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
        // Streamlines: clean light background
        r = 248; gv = 244; b = 240;
      }

      px[pIdx] = r;
      px[pIdx + 1] = gv;
      px[pIdx + 2] = b;
      px[pIdx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  ctx.restore();
}

function drawStreamlines(
  ctx: CanvasRenderingContext2D,
  snap: FlowSnapshot,
  cw: number,
  ch: number,
) {
  const fw = snap.width;
  const fh = snap.height;
  const sx = cw / fw;
  const sy = ch / fh;

  ctx.save();
  ctx.strokeStyle = "rgba(60, 80, 110, 0.45)";
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";

  const step = 1.5;
  const nRows = STREAMLINES_PER_ROW;
  const yStep = (fh - 10) / (nRows + 1);
  const seedX = clamp(STREAMLINE_SEED_X, 1, fw - 2);

  for (let row = 1; row <= nRows; row++) {
    const startY = Math.round(row * yStep);
    if (snap.obstacle[indexAt(seedX, startY, fw)] > 0) continue;

    const pts: Array<[number, number]> = [[seedX, startY]];
    let cx = seedX;
    let cy = startY;

    for (let traceStep = 0; traceStep < STREAMLINE_MAX_STEPS; traceStep += 1) {
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

      pts.push([cx, cy]);

      if (cx < 1 || cx >= fw - 1 || cy < 1 || cy >= fh - 1) break;
    }

    if (pts.length < 3) continue;

    ctx.beginPath();
    ctx.moveTo(pts[0][0] * sx, pts[0][1] * sy);
    for (let i = 1; i < pts.length - 1; i += 1) {
      const cpX = pts[i][0] * sx;
      const cpY = pts[i][1] * sy;
      const endX = ((pts[i][0] + pts[i + 1][0]) / 2) * sx;
      const endY = ((pts[i][1] + pts[i + 1][1]) / 2) * sy;
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
    }

    const lastPoint = pts[pts.length - 1];
    ctx.lineTo(lastPoint[0] * sx, lastPoint[1] * sy);
    ctx.stroke();
  }

  ctx.restore();
}

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

function drawLabel(ctx: CanvasRenderingContext2D, speedMps: number, mode: FlowMode) {
  ctx.save();
  const ink = mode === "velocity" ? "rgba(255, 255, 255, 0.72)" : "rgba(25, 32, 43, 0.72)";
  const subInk = mode === "velocity" ? "rgba(255, 255, 255, 0.42)" : "rgba(25, 32, 43, 0.44)";
  ctx.fillStyle = ink;
  ctx.font = "600 12px Aptos, Segoe UI, sans-serif";
  ctx.fillText(`${speedMps} m/s`, 20, 30);
  ctx.fillStyle = subInk;
  ctx.font = "400 10px Aptos, Segoe UI, sans-serif";
  ctx.fillText("Relative D2Q9 projected flow", 20, 48);
  ctx.restore();
}

export function ProjectedFlowLab({ cars, defaultCarId }: ProjectedFlowLabProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const solverRef = useRef<ProjectedFlowSolver | null>(null);
  const maskImageRef = useRef<HTMLImageElement | null>(null);
  const maskDataRef = useRef<ReturnType<typeof analyzeMaskImageData> | null>(null);
  const frameRef = useRef<number | null>(null);
  const metricFrameRef = useRef(0);

  const [activeCarId, setActiveCarId] = useState<string>(defaultCarId ?? cars[0]?.id ?? "");
  const [mode, setMode] = useState<FlowMode>("velocity");
  const [speedMps, setSpeedMps] = useState<number>(FLOW_SIMULATION_DEFAULTS.speedPresetsMps[1] ?? 40);
  const [isPlaying, setIsPlaying] = useState(true);
  const [metrics, setMetrics] = useState<FlowMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const car = useMemo(
    () => cars.find((entry) => entry.id === activeCarId) ?? cars[0] ?? null,
    [activeCarId, cars],
  );

  const viewerHref = useMemo(() => {
    if (!car) {
      return "/cars/current-spec";
    }
    const params = new URLSearchParams({
      season: String(car.year ?? 2025),
      constructor: car.constructorSlug,
    });
    return `/cars/current-spec?${params.toString()}`;
  }, [car]);

  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  useEffect(() => {
    if (!car) {
      return;
    }

    let cancelled = false;
    setIsReady(false);
    setError(null);
    setMetrics(null);
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
        setMetrics(solver.getSnapshot().metrics);
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
    if (!isReady || !solverRef.current) {
      return;
    }

    const solver = solverRef.current;
    const nextInflow = speedToInflow(speedMps);
    if (Math.abs(solver.getSnapshot().inflowVelocity - nextInflow) < 1e-6) {
      return;
    }

    try {
      solver.reset(nextInflow);
      solver.warmup(250);
      metricFrameRef.current = 0;
      setMetrics(solver.getSnapshot().metrics);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Solver reset failed.");
    }
  }, [isReady, speedMps]);

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
          drawStreamlines(ctx, snap, canvas.width, canvas.height);
        }
        drawSilhouette(ctx, maskImage, canvas.width, canvas.height);
        drawLabel(ctx, speedMps, mode);
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
  }, [isPlaying, mode, isReady, speedMps]);

  const activeMode = useMemo(
    () => FLOW_MODE_LABELS.find((c) => c.id === mode) ?? FLOW_MODE_LABELS[0],
    [mode],
  );

  const metricCards = useMemo(() => {
    if (!metrics || !car) return [];
    return [
      {
        id: "wakeWidth" as const,
        label: "Wake width",
        value: formatMetricValue("wakeWidth", metrics.wakeWidth, car),
        description: "Lateral spread of the low-energy wake at a fixed sample plane behind the car.",
      },
      {
        id: "wakeLength" as const,
        label: "Wake length",
        value: formatMetricValue("wakeLength", metrics.wakeLength, car),
        description: "Distance the centerline deficit persists before the field recovers.",
      },
      {
        id: "wakeArea" as const,
        label: "Wake area",
        value: formatMetricValue("wakeArea", metrics.wakeArea, car),
        description: "Low-velocity footprint normalized against the silhouette area.",
      },
      {
        id: "dragProxy" as const,
        label: "Drag proxy",
        value: formatMetricValue("dragProxy", metrics.dragProxy, car),
        description: "Integrated wake deficit from the solved field, for same-setup comparisons.",
      },
    ];
  }, [car, metrics]);

  if (!car) {
    return null;
  }

  return (
    <section className="panel flow-lab">
      <div className="section-header flow-lab__header">
        <div>
          <p className="eyebrow">Projected flow compare</p>
          <h2>Keep one solver box and swap the car beneath it.</h2>
        </div>
        <a className="button button--secondary" href={viewerHref}>
          Open current GLB page
        </a>
      </div>

      {cars.length > 1 ? (
        <div className="flow-car-selector" aria-label="Available flow subjects" role="tablist">
          {cars.map((entry) => {
            const isActive = entry.id === car.id;
            return (
              <button
                key={entry.id}
                aria-selected={isActive}
                className={`flow-car-chip${isActive ? " flow-car-chip--active" : ""}`}
                onClick={() => setActiveCarId(entry.id)}
                role="tab"
                type="button"
              >
                <span>{entry.year ?? "Current"} · {entry.era}</span>
                <strong>{entry.name}</strong>
                <p>{entry.notes[0]}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flow-lab__hero-grid">
        <div className="flow-stage">
          <div className="flow-toolbar">
            <div className="flow-toolbar__group">
              {FLOW_MODE_LABELS.map((entry) => (
                <button
                  key={entry.id}
                  className={`flow-toggle${mode === entry.id ? " flow-toggle--active" : ""}`}
                  onClick={() => setMode(entry.id)}
                  type="button"
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <div className="flow-toolbar__group flow-toolbar__group--compact">
              <button className="flow-toggle" onClick={() => setIsPlaying((v) => !v)} type="button">
                {isPlaying ? "Pause" : "Play"}
              </button>
            </div>
          </div>

          <div className="flow-canvas-wrap">
            {error ? <div className="flow-empty">{error}</div> : null}
            {!error && !isReady ? <div className="flow-empty">Initializing the fluid solver...</div> : null}
            <canvas
              className="flow-canvas"
              ref={canvasRef}
              width={960}
              height={540}
              style={{ width: "100%", height: "auto", display: "block", borderRadius: "16px" }}
            />
          </div>

          <div className="flow-stage__footer">
            <div className="flow-stage__summary">
              <span className="flow-stage__eyebrow">{car.year ?? "Current"} · {car.era}</span>
              <strong>{car.name} · {activeMode.label}</strong>
              <p>{activeMode.description}</p>
            </div>
            <label className="flow-speed">
              <span>Speed</span>
              <input
                type="range"
                min={FLOW_SIMULATION_DEFAULTS.speedPresetsMps[0] ?? 20}
                max={FLOW_SIMULATION_DEFAULTS.speedPresetsMps[2] ?? 60}
                step={5}
                value={speedMps}
                onChange={(e) => setSpeedMps(Number(e.target.value))}
                aria-label="Flow speed"
              />
              <strong>{speedMps} m/s</strong>
            </label>
          </div>
        </div>

        <div className="flow-inspector">
          <div className="flow-model-card">
            <div className="flow-model-card__media">
              {createElement("model-viewer", {
                src: car.publicModelPath,
                alt: car.name,
                exposure: "1.05",
                "shadow-intensity": "1",
                "camera-controls": true,
                "camera-orbit": "35deg 70deg 2.6m",
                "camera-target": "0m 0.3m 0m",
                "interaction-prompt": "auto",
                "environment-image": "neutral",
                style: {
                  width: "100%",
                  height: "100%",
                  background: "radial-gradient(circle at top, rgba(255,255,255,0.98), rgba(230,222,215,0.82) 58%, rgba(220,210,200,0.96))",
                },
              })}
            </div>
            <div className="flow-model-card__copy">
              <p className="eyebrow">3D source</p>
              <h3>{car.name}</h3>
              <p>
                {car.notes[0]} The live GLB viewer stays separate from the projected-flow field, so the page can
                swap cars without changing the solver framing.
              </p>
            </div>
          </div>

          <div className="flow-callout">
            <p className="eyebrow">Method + framing</p>
            <h3>Same solver, same camera box</h3>
            <ul className="summary-list">
              <li><strong>Era</strong><span>{car.year ?? "Current"} · {car.era}</span></li>
              <li><strong>Grid</strong><span>{GRID_W} x {GRID_H} top-view cells</span></li>
              <li><strong>Mask</strong><span>{car.topMaskPath}</span></li>
              <li><strong>Source</strong><span>{car.sourceModelPath}</span></li>
            </ul>
            <p className="flow-callout__note">{car.notes[1] ?? "Derived masks keep the compare surface lightweight and repeatable."}</p>
          </div>
        </div>
      </div>

      <div className="metric-grid flow-metric-grid">
        {metricCards.map((m) => (
          <article className="metric-chip flow-metric-card" key={m.id}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <p>{m.description}</p>
          </article>
        ))}
      </div>

      <div className="panel-grid panel-grid--two flow-note-grid">
        <article className="panel panel--nested">
          <p className="eyebrow">Good for</p>
          <h3>Shape-to-shape compare</h3>
          <p>
            Swap between registered cars and keep the same inflow, framing, and metric math for fair relative reads.
          </p>
        </article>
        <article className="panel panel--nested">
          <p className="eyebrow">Limits</p>
          <h3>Not real CFD</h3>
          <p>
            Relative metrics and visual storytelling only. No real Cd, downforce, or underfloor physics.
          </p>
        </article>
      </div>
    </section>
  );
}
