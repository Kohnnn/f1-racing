"use client";

import { useState } from "react";
import { FLOW_SIMULATION_DEFAULTS } from "@/lib/flow/defaults";
import { formatMetricValue, type FlowMetrics } from "@/lib/flow/field";
import type { FlowCarEntry } from "@/lib/flow/types";
import { FlowSimPanel } from "./flow-sim-panel";

type FlowMode = "streamlines" | "velocity" | "wake";

const FLOW_MODE_LABELS: Array<{ id: FlowMode; label: string }> = [
  { id: "streamlines", label: "Streamlines" },
  { id: "velocity", label: "Velocity" },
  { id: "wake", label: "Wake" },
];

interface FlowCompareViewProps {
  cars: FlowCarEntry[];
}

function MetricChip({
  label,
  values,
  metricId,
  car,
  cars,
}: {
  label: string;
  values: Record<string, number>;
  metricId: keyof FlowMetrics;
  car: FlowCarEntry;
  cars: FlowCarEntry[];
}) {
  const entries = Object.entries(values);
  const winner = entries.reduce((a, b) => (a[1] < b[1] ? a : b));

  return (
    <div className="metric-chip flow-metric-card">
      <span>{label}</span>
      <div className="flow-compare-metrics">
        {entries.map(([carId, val]) => {
          const c = cars.find((x) => x.id === carId);
          const isWinner = carId === winner[0];
          return (
            <strong key={carId} className={isWinner ? "flow-metric-winner" : ""}>
              <span className="flow-metric-car">{c?.name ?? carId}</span>
              <span>{formatMetricValue(metricId, val, car)}</span>
            </strong>
          );
        })}
      </div>
    </div>
  );
}

export function FlowCompareView({ cars }: FlowCompareViewProps) {
  const [mode, setMode] = useState<FlowMode>("velocity");
  const [speedMps, setSpeedMps] = useState(FLOW_SIMULATION_DEFAULTS.speedPresetsMps[1] ?? 40);
  const [isPlaying, setIsPlaying] = useState(true);

  const [metricsA, setMetricsA] = useState<FlowMetrics | null>(null);
  const [metricsB, setMetricsB] = useState<FlowMetrics | null>(null);

  const metricsA_ = metricsA ?? { wakeWidth: 0, wakeLength: 0, wakeArea: 0, dragProxy: 0 };
  const metricsB_ = metricsB ?? { wakeWidth: 0, wakeLength: 0, wakeArea: 0, dragProxy: 0 };

  const carA = cars[0];
  const carB = cars[1] ?? cars[0];

  return (
    <section className="panel flow-compare">
      <div className="section-header flow-compare__header">
        <div>
          <p className="eyebrow">Side-by-side compare</p>
          <h2>Two cars, one solver, same framing — fair relative read.</h2>
        </div>
        <div className="flow-compare-controls">
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

      <div className="flow-compare-grid">
        <div className="flow-compare-panel">
          <div className="flow-compare-panel__label">
            <span>{carA.year ?? "Current"} · {carA.era}</span>
            <strong>{carA.name}</strong>
          </div>
          <FlowSimPanel
            car={carA}
            mode={mode}
            speedMps={speedMps}
            isPlaying={isPlaying}
            onMetrics={setMetricsA}
          />
        </div>

        <div className="flow-compare-divider" />

        <div className="flow-compare-panel">
          <div className="flow-compare-panel__label">
            <span>{carB.year ?? "Current"} · {carB.era}</span>
            <strong>{carB.name}</strong>
          </div>
          <FlowSimPanel
            car={carB}
            mode={mode}
            speedMps={speedMps}
            isPlaying={isPlaying}
            onMetrics={setMetricsB}
          />
        </div>
      </div>

      <div className="metric-grid flow-compare-metric-grid">
        <MetricChip
          label="Wake width"
          values={{ [carA.id]: metricsA_.wakeWidth, [carB.id]: metricsB_.wakeWidth }}
          metricId="wakeWidth"
          car={carA}
          cars={cars}
        />
        <MetricChip
          label="Wake length"
          values={{ [carA.id]: metricsA_.wakeLength, [carB.id]: metricsB_.wakeLength }}
          metricId="wakeLength"
          car={carA}
          cars={cars}
        />
        <MetricChip
          label="Wake area"
          values={{ [carA.id]: metricsA_.wakeArea, [carB.id]: metricsB_.wakeArea }}
          metricId="wakeArea"
          car={carA}
          cars={cars}
        />
        <MetricChip
          label="Drag proxy"
          values={{ [carA.id]: metricsA_.dragProxy, [carB.id]: metricsB_.dragProxy }}
          metricId="dragProxy"
          car={carA}
          cars={cars}
        />
      </div>
    </section>
  );
}
