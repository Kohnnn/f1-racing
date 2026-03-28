import { formatLapTime } from "@f1-racing/telemetry-utils";
import type { StintPack } from "@/lib/data";

interface StintStoryProps {
  stintPack: StintPack;
}

function buildTrendLabel(value: number) {
  if (value > 0.08) {
    return "heavy fade";
  }
  if (value > 0.03) {
    return "steady fade";
  }
  if (value < -0.02) {
    return "getting faster";
  }
  return "stable";
}

export function StintStory({ stintPack }: StintStoryProps) {
  return (
    <div className="page-stack">
      {stintPack.drivers.map((driver) => (
        <section className="panel" key={driver.driverCode}>
          <div className="section-header">
            <div>
              <p className="eyebrow">Stint story</p>
              <h2>
                {driver.driverCode} · {driver.team}
              </h2>
            </div>
          </div>
          <div className="panel-grid panel-grid--two">
            {driver.stints.map((stint) => {
              const max = Math.max(...stint.lapTimes);
              const min = Math.min(...stint.lapTimes);

              return (
                <article className="panel panel--nested" key={`${driver.driverCode}-${stint.stintNumber}`}>
                  <p className="eyebrow">Stint {stint.stintNumber}</p>
                  <h3>{stint.compound}</h3>
                  <p>
                    Laps {stint.lapStart}-{stint.lapEnd} · tyre age at start {stint.tyreAgeAtStart}
                  </p>
                  <div className="metric-grid">
                    <div className="metric-chip">
                      <span>Average</span>
                      <strong>{formatLapTime(stint.averageLapTime)}</strong>
                    </div>
                    <div className="metric-chip">
                      <span>Trend / lap</span>
                      <strong>{stint.trendPerLap.toFixed(3)} s</strong>
                    </div>
                    <div className="metric-chip">
                      <span>Shape</span>
                      <strong>{buildTrendLabel(stint.trendPerLap)}</strong>
                    </div>
                  </div>
                  <svg viewBox="0 0 1000 220" className="telemetry-chart" role="img" aria-label={`${driver.driverCode} stint ${stint.stintNumber} pace trace`}>
                    <rect x="0" y="0" width="1000" height="220" rx="24" className="telemetry-chart__bg" />
                    <line x1="0" y1="200" x2="1000" y2="200" className="telemetry-chart__axis" />
                    <polyline
                      points={stint.lapTimes
                        .map((lapTime, index) => {
                          const x = (index / Math.max(1, stint.lapTimes.length - 1)) * 1000;
                          const y = 30 + ((lapTime - min) / Math.max(0.001, max - min || 0.001)) * 150;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(" ")}
                      className="telemetry-chart__trace telemetry-chart__trace--left"
                    />
                  </svg>
                  <ul className="summary-list">
                    <li>
                      <strong>Window read</strong>
                      <span>
                        This stint looks {buildTrendLabel(stint.trendPerLap)}. Use it to explain whether tyre life or track evolution is driving the pace shape.
                      </span>
                    </li>
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
