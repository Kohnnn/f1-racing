"use client";

import { useEffect, useRef } from "react";

interface ReplayTelemetryStripProps {
  driver: {
    abbr: string;
    color: string;
    speed: number | null;
    throttle?: number | null;
    brake?: number | null;
    gear?: number | null;
    rpm?: number | null;
    drs?: number | null;
    compound: string | null;
    tyreAge: number | null;
    lap: number | null;
    intervalLabel: string;
    lastLapLabel: string | null;
  };
}

const SPARK_LEN = 60;

interface SparklineProps {
  value: number | null | undefined;
  max: number;
  color: string;
  label: string;
  driverKey: string;
  format?: (value: number) => string;
}

/**
 * Lightweight rolling sparkline. Each strip keeps a per-driver per-channel
 * ring buffer of the last `SPARK_LEN` values and re-renders into a tiny SVG
 * polyline. Memory footprint is tiny (60 numbers × 5 channels × ~5 drivers).
 */
function Sparkline({ value, max, color, label, driverKey, format }: SparklineProps) {
  const buffer = useRef<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = typeof value === "number" && Number.isFinite(value) ? value : 0;
    const previous = buffer.current;
    const updated = previous.length >= SPARK_LEN
      ? [...previous.slice(-SPARK_LEN + 1), next]
      : [...previous, next];
    buffer.current = updated;
    if (containerRef.current) {
      containerRef.current.dataset.refresh = String(performance.now());
    }
  }, [value, driverKey, label]);

  const points = buffer.current;
  const polyPoints = points
    .map((v, idx) => {
      const x = (idx / Math.max(1, SPARK_LEN - 1)) * 100;
      const y = 100 - Math.max(0, Math.min(1, v / max)) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const fillPoints = points.length
    ? `0,100 ${polyPoints} 100,100`
    : "";
  const display = typeof value === "number" && Number.isFinite(value)
    ? format
      ? format(value)
      : `${Math.round(value)}`
    : "-";

  return (
    <div className="telemetry-spark" ref={containerRef}>
      <span className="telemetry-spark__label">{label}</span>
      <div className="telemetry-spark__viewport">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {fillPoints ? (
            <polygon points={fillPoints} fill={`${color}26`} />
          ) : null}
          {polyPoints ? (
            <polyline
              points={polyPoints}
              fill="none"
              stroke={color}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
      </div>
      <strong className="telemetry-spark__value">{display}</strong>
    </div>
  );
}

export function ReplayTelemetryStrip({ driver }: ReplayTelemetryStripProps) {
  return (
    <article className="replay-telemetry-strip">
      <div className="replay-telemetry-strip__top">
        <div className="replay-telemetry-strip__driver">
          <span className="replay-telemetry-strip__color" style={{ backgroundColor: driver.color }} />
          <div>
            <strong>{driver.abbr}</strong>
            <span>{driver.intervalLabel}</span>
          </div>
        </div>

        <div className="replay-telemetry-strip__summary">
          <div className="replay-telemetry-strip__summary-item replay-telemetry-strip__summary-item--primary">
            <span>Speed</span>
            <strong>{driver.speed !== null ? `${Math.round(driver.speed)} km/h` : "-"}</strong>
          </div>
          <div className="replay-telemetry-strip__summary-item">
            <span>Tyre</span>
            <strong>{driver.compound ? `${driver.compound.slice(0, 1)}${driver.tyreAge !== null ? ` · ${driver.tyreAge}` : ""}` : "-"}</strong>
          </div>
          <div className="replay-telemetry-strip__summary-item">
            <span>Last lap</span>
            <strong>{driver.lastLapLabel || "-"}</strong>
          </div>
        </div>
      </div>

      <div className="telemetry-strip-sparklines">
        <Sparkline
          driverKey={driver.abbr}
          label="Speed"
          value={driver.speed}
          max={360}
          color="#71c1ff"
          format={(v) => `${Math.round(v)} km/h`}
        />
        <Sparkline
          driverKey={driver.abbr}
          label="Throttle"
          value={driver.throttle}
          max={100}
          color="#22c55e"
          format={(v) => `${Math.round(v)}%`}
        />
        <Sparkline
          driverKey={driver.abbr}
          label="Brake"
          value={driver.brake}
          max={100}
          color="#ef4444"
          format={(v) => `${Math.round(v)}%`}
        />
        <Sparkline
          driverKey={driver.abbr}
          label="RPM"
          value={driver.rpm}
          max={15000}
          color="#ff7a1a"
          format={(v) => `${(Math.round(v / 100) / 10).toFixed(1)}k`}
        />
      </div>

      <div className="replay-telemetry-strip__metrics replay-telemetry-strip__metrics--compact">
        <div className="replay-telemetry-strip__metric">
          <span>Gear</span>
          <strong>{driver.gear ?? "-"}</strong>
        </div>

        <div className="replay-telemetry-strip__metric">
          <span>DRS</span>
          <strong>{(driver.drs ?? 0) >= 10 ? "Open" : "Closed"}</strong>
        </div>

        <div className="replay-telemetry-strip__metric">
          <span>Lap</span>
          <strong>{driver.lap ?? "-"}</strong>
        </div>
      </div>
    </article>
  );
}
