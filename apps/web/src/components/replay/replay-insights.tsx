import { formatDeltaMs, formatLapTime } from "@f1-racing/telemetry-utils";
import type { ComparePack, StintPack } from "@/lib/data";

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

export function ReplayComparePanel({ compare, legacyHref }: { compare: ComparePack; legacyHref?: string | null }) {
  return (
    <section className="panel replay-insight-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Replay compare</p>
          <h2>{compare.drivers[0]} vs {compare.drivers[1]}</h2>
        </div>
      </div>
      <p className="replay-insight-panel__lead">
        Featured lap pair from this replay. Use the section deltas and derived events below when you want quick context without leaving the playback workspace.
      </p>
      <div className="replay-insight-grid">
        <div>
          <h3>Delta sections</h3>
          <ul className="summary-list">
            {compare.deltaSections.map((section, index) => (
              <li key={`${section.leader}-${index}`}>
                <strong>{section.leader}</strong>
                <span>
                  {Math.round(section.from * 100)}% {"->"} {Math.round(section.to * 100)}% · {formatDeltaMs(section.deltaMs)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Derived events</h3>
          <ul className="summary-list">
            {compare.events.map((event, index) => (
              <li key={`${event.driver}-${index}`}>
                <strong>{event.driver}</strong>
                <span>
                  {event.type.replace(/_/g, " ")} at {String(event.corner)}
                  {event.note ? ` - ${event.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {legacyHref ? <a className="inline-link" href={legacyHref}>Open legacy compare route</a> : null}
    </section>
  );
}

export function ReplayStintPanel({ stintPack, legacyHref }: { stintPack: StintPack; legacyHref?: string | null }) {
  const featuredDrivers = stintPack.drivers.slice(0, 4);

  return (
    <section className="panel replay-insight-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Replay stints</p>
          <h2>Tyre window snapshot</h2>
        </div>
      </div>
      <p className="replay-insight-panel__lead">
        Latest tyre-window read for the featured pack. Compound, pace, and fade stay visible here instead of living on a separate route.
      </p>
      <div className="replay-stint-grid">
        {featuredDrivers.map((driver) => {
          const latestStint = driver.stints.at(-1);
          if (!latestStint) {
            return null;
          }

          return (
            <article className="replay-stint-card" key={driver.driverCode}>
              <p className="eyebrow">{driver.team}</p>
              <h3>{driver.driverCode}</h3>
              <div className="metric-grid">
                <div className="metric-chip">
                  <span>Compound</span>
                  <strong>{latestStint.compound}</strong>
                </div>
                <div className="metric-chip">
                  <span>Average</span>
                  <strong>{formatLapTime(latestStint.averageLapTime)}</strong>
                </div>
                <div className="metric-chip">
                  <span>Trend</span>
                  <strong>{buildTrendLabel(latestStint.trendPerLap)}</strong>
                </div>
              </div>
              <p className="replay-stint-card__copy">
                Laps {latestStint.lapStart}-{latestStint.lapEnd} · tyre age at start {latestStint.tyreAgeAtStart} · {latestStint.trendPerLap.toFixed(3)} s/lap
              </p>
            </article>
          );
        })}
      </div>
      {legacyHref ? <a className="inline-link" href={legacyHref}>Open legacy stint route</a> : null}
    </section>
  );
}
