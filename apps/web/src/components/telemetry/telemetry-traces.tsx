import { formatDeltaMs } from "@f1-racing/telemetry-utils";
import type { ComparePack } from "@/lib/data";

interface TelemetryTracesProps {
  compare: ComparePack;
}

type TraceKey = "speed" | "throttle" | "brake" | "rpm" | "gear";

const TRACE_META: Array<{ key: TraceKey; label: string; color: string; max: number }> = [
  { key: "speed", label: "Speed", color: "#3d87b7", max: 360 },
  { key: "throttle", label: "Throttle", color: "#c54f2a", max: 100 },
  { key: "brake", label: "Brake", color: "#6c8a35", max: 100 },
  { key: "rpm", label: "RPM", color: "#8a57c6", max: 15000 },
  { key: "gear", label: "Gear", color: "#5c6474", max: 8 },
];

function buildPoints(points: Array<{ ratio: number; [key: string]: number | null }>, key: TraceKey, max: number) {
  return points
    .map((point) => {
      const x = point.ratio * 1000;
      const raw = Number(point[key] ?? 0);
      const y = 200 - Math.max(0, Math.min(max, raw)) / max * 180;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TelemetryTraces({ compare }: TelemetryTracesProps) {
  if (!compare.telemetry) {
    return null;
  }

  const left = compare.telemetry.left;
  const right = compare.telemetry.right;
  const speedDelta = (right.points.at(-1)?.speed ?? 0) - (left.points.at(-1)?.speed ?? 0);
  const annotations = compare.annotations ?? [];

  return (
    <section className="panel telemetry-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Telemetry traces</p>
          <h2>{left.driverCode} vs {right.driverCode}</h2>
        </div>
      </div>

      <div className="telemetry-legend">
        <span className="telemetry-legend__driver telemetry-legend__driver--left">{left.driverCode}</span>
        <span className="telemetry-legend__driver telemetry-legend__driver--right">{right.driverCode}</span>
      </div>

      <div className="telemetry-grid">
        {TRACE_META.map((trace) => (
          <article className="panel panel--nested telemetry-card" key={trace.key}>
            <div className="telemetry-card__header">
              <div>
                <p className="eyebrow">{trace.label}</p>
                <h3>{trace.key === "speed" ? `${trace.label} trace` : `${trace.label} usage`}</h3>
              </div>
              <span className="telemetry-card__metric">max {trace.max}</span>
            </div>
            <svg viewBox="0 0 1000 220" className="telemetry-chart" role="img" aria-label={`${trace.label} comparison chart`}>
              <rect x="0" y="0" width="1000" height="220" rx="24" className="telemetry-chart__bg" />
              <line x1="0" y1="200" x2="1000" y2="200" className="telemetry-chart__axis" />
              <line x1="0" y1="110" x2="1000" y2="110" className="telemetry-chart__grid" />
              <polyline points={buildPoints(left.points, trace.key, trace.max)} className={`telemetry-chart__trace telemetry-chart__trace--left telemetry-chart__trace--${trace.key}`} />
              <polyline points={buildPoints(right.points, trace.key, trace.max)} className={`telemetry-chart__trace telemetry-chart__trace--right telemetry-chart__trace--${trace.key}`} />
              {compare.deltaSections.map((section, index) => (
                <rect
                  key={`${trace.key}-${index}`}
                  x={section.from * 1000}
                  y={18}
                  width={(section.to - section.from) * 1000}
                  height={12}
                  className={`telemetry-chart__band ${section.leader === left.driverCode ? "telemetry-chart__band--left" : "telemetry-chart__band--right"}`}
                />
              ))}
              {annotations.map((annotation, index) => {
                const x = ((annotation.from + annotation.to) / 2) * 1000;
                return (
                  <g key={`${trace.key}-event-${index}`}>
                    <line x1={x} y1={30} x2={x} y2={182} className="telemetry-chart__marker-line" />
                    <circle cx={x} cy={28} r={9} className="telemetry-chart__marker-dot" />
                    <text x={x} y={72} textAnchor="middle" className="telemetry-chart__marker-label">
                      {annotation.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </article>
        ))}
      </div>

      <div className="panel-grid panel-grid--two">
        <article className="panel panel--nested">
          <p className="eyebrow">Trace summary</p>
          <h3>Pack shape</h3>
          <p>
            Left trace samples: {left.points.length}. Right trace samples: {right.points.length}. Both traces are
            normalized onto one lap ratio axis so later compare work can add corner annotations and distance-linked overlays.
          </p>
        </article>
        <article className="panel panel--nested">
          <p className="eyebrow">Quick signal</p>
          <h3>End-of-lap speed delta</h3>
          <p>{formatDeltaMs(speedDelta * 10)} equivalent at the final segment. Replace this with real corner or sector summaries next.</p>
        </article>
        <article className="panel panel--nested">
          <p className="eyebrow">Engine state</p>
          <h3>RPM and gear now included</h3>
          <p>
            Peak RPM: {Math.max(...left.points.map((point) => point.rpm ?? 0)).toLocaleString()} vs {Math.max(...right.points.map((point) => point.rpm ?? 0)).toLocaleString()} · Highest gear: {Math.max(...left.points.map((point) => point.gear ?? 0))} vs {Math.max(...right.points.map((point) => point.gear ?? 0))}
          </p>
        </article>
      </div>

      <div className="panel panel--nested">
        <div className="section-header">
          <div>
            <p className="eyebrow">Corner notes</p>
            <h3>Track-side annotations</h3>
          </div>
        </div>
        <ul className="summary-list">
          {annotations.map((annotation) => (
            <li key={annotation.id}>
              <strong>
                {annotation.label} · {annotation.leader}
              </strong>
              <span>{annotation.summary}</span>
              <span>
                {left.driverCode}: min {annotation.metrics.left.minSpeed} km/h, brake {annotation.metrics.left.brakePointRatio ?? "-"}, throttle {annotation.metrics.left.throttlePickupRatio ?? "-"}
              </span>
              <span>
                {right.driverCode}: min {annotation.metrics.right.minSpeed} km/h, brake {annotation.metrics.right.brakePointRatio ?? "-"}, throttle {annotation.metrics.right.throttlePickupRatio ?? "-"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
