"use client";

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

function Pips({ value, max, color }: { value: number; max: number; color: string }) {
  const filled = Math.round((Math.max(0, value) / max) * 5);
  return (
    <div className="replay-telemetry-strip__pips">
      {Array.from({ length: 5 }, (_, index) => {
        const active = index < filled;
        return <span key={index} style={{ backgroundColor: active ? color : "#363b48", height: `${6 + index * 3}px` }} />;
      })}
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

      <div className="replay-telemetry-strip__metrics">
        <div className="replay-telemetry-strip__metric replay-telemetry-strip__metric--bars">
          <span>Throttle</span>
          <Pips value={driver.throttle ?? 0} max={100} color="#22c55e" />
        </div>

        <div className="replay-telemetry-strip__metric replay-telemetry-strip__metric--bars">
          <span>Brake</span>
          <Pips value={driver.brake ?? 0} max={100} color="#ef4444" />
        </div>

        <div className="replay-telemetry-strip__metric">
          <span>Gear</span>
          <strong>{driver.gear ?? "-"}</strong>
        </div>

        <div className="replay-telemetry-strip__metric">
          <span>DRS</span>
          <strong>{driver.drs !== null ? driver.drs : "-"}</strong>
        </div>

        <div className="replay-telemetry-strip__metric">
          <span>RPM</span>
          <strong>{driver.rpm !== null && driver.rpm !== undefined ? `${Math.round(driver.rpm / 100) / 10}k` : "-"}</strong>
        </div>

        <div className="replay-telemetry-strip__metric">
          <span>Lap</span>
          <strong>{driver.lap ?? "-"}</strong>
        </div>
      </div>
    </article>
  );
}
