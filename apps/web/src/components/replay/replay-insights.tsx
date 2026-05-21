import { formatDeltaMs, formatLapTime } from "@f1-racing/telemetry-utils";
import type { ComparePack, ReplayPack, StintPack, StrategyPack } from "@/lib/data";

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

export function ReplayComparePanel({ compare, legacyHref, embedded = false }: { compare: ComparePack; legacyHref?: string | null; embedded?: boolean }) {
  return (
    <section className={`replay-insight-panel${embedded ? " replay-insight-panel--embedded" : " panel"}`}>
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
      {legacyHref ? <a className="inline-link" href={legacyHref}>Open full compare page</a> : null}
    </section>
  );
}

export function ReplayStintPanel({ stintPack, legacyHref, embedded = false }: { stintPack: StintPack; legacyHref?: string | null; embedded?: boolean }) {
  const featuredDrivers = stintPack.drivers.slice(0, 4);

  return (
    <section className={`replay-insight-panel${embedded ? " replay-insight-panel--embedded" : " panel"}`}>
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
      {legacyHref ? <a className="inline-link" href={legacyHref}>Open full stint page</a> : null}
    </section>
  );
}

interface ReplayStrategyPanelProps {
  strategy: StrategyPack | null;
  stintPack: StintPack | null;
  selectedDrivers?: string[];
}

function pacePerLap(stint: { lapTimes: number[] }) {
  if (!stint.lapTimes.length) return null;
  return stint.lapTimes.reduce((sum, value) => sum + value, 0) / stint.lapTimes.length;
}

export function ReplayStrategyPanel({ strategy, stintPack, selectedDrivers = [] }: ReplayStrategyPanelProps) {
  if (!strategy && !stintPack) {
    return (
      <section className="replay-insight-panel replay-insight-panel--embedded">
        <p className="replay-insight-panel__lead">Strategy data is not exported for this session yet.</p>
      </section>
    );
  }

  const focusedDrivers = stintPack
    ? (selectedDrivers.length
      ? stintPack.drivers.filter((entry) => selectedDrivers.includes(entry.driverCode))
      : stintPack.drivers.slice(0, 4))
    : [];

  return (
    <section className="replay-insight-panel replay-insight-panel--embedded">
      <div className="section-header">
        <div>
          <p className="eyebrow">Strategy desk</p>
          <h2>Pit-loss & tyre window</h2>
        </div>
      </div>
      <p className="replay-insight-panel__lead">
        Pit-loss prediction and tyre window read. Numbers are derived from the OpenF1 stint and lap data; safety-car / VSC adjusted estimates use the same green-flag baseline.
      </p>

      {strategy ? (
        <div className="metric-grid">
          <div className="metric-chip">
            <span>Green pit loss</span>
            <strong>{strategy.pitLossS.toFixed(1)}s</strong>
          </div>
          <div className="metric-chip">
            <span>SC / VSC pit loss</span>
            <strong>{strategy.safetyCarPitLossS.toFixed(1)}s</strong>
          </div>
          <div className="metric-chip">
            <span>Crossover → Inter</span>
            <strong>{Math.round(strategy.weatherCrossover.toIntermediate * 100)}%</strong>
          </div>
          <div className="metric-chip">
            <span>Crossover → Wet</span>
            <strong>{Math.round(strategy.weatherCrossover.toWet * 100)}%</strong>
          </div>
        </div>
      ) : null}

      {strategy && strategy.recommendedWindows.length ? (
        <div className="replay-strategy-windows">
          <h3>Recommended pit windows</h3>
          <ul className="summary-list">
            {strategy.recommendedWindows.map((window, index) => (
              <li key={`${window.lapStart}-${index}`}>
                <strong>Laps {window.lapStart}-{window.lapEnd}</strong>
                <span>{window.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {focusedDrivers.length ? (
        <div className="replay-stint-grid">
          {focusedDrivers.map((driver) => {
            const latestStint = driver.stints.at(-1);
            if (!latestStint) return null;
            const avg = pacePerLap(latestStint);
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
                    <span>Stint laps</span>
                    <strong>{latestStint.lapEnd - latestStint.lapStart + 1}</strong>
                  </div>
                  <div className="metric-chip">
                    <span>Avg pace</span>
                    <strong>{avg ? formatLapTime(avg) : "-"}</strong>
                  </div>
                  <div className="metric-chip">
                    <span>Trend / lap</span>
                    <strong>{latestStint.trendPerLap > 0 ? "+" : ""}{latestStint.trendPerLap.toFixed(3)}s</strong>
                  </div>
                </div>
                <p className="replay-stint-card__copy">
                  Tyre age at start {latestStint.tyreAgeAtStart}; current stint laps {latestStint.lapStart}-{latestStint.lapEnd}.
                </p>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

interface ReplayLapWaterfallProps {
  laps: ReplayPack["laps"];
  drivers: ReplayPack["drivers"];
}

/**
 * Heat-mapped waterfall of lap times per driver per lap. Each row is a driver
 * (sorted by fastest overall lap). Each cell is a lap, tinted from green
 * (fastest) to red (slowest) relative to the session range. Cells render as
 * SVG rects so the chart stays light without a chart library dep.
 */
export function ReplayLapWaterfall({ laps, drivers }: ReplayLapWaterfallProps) {
  const completed = laps.filter((lap): lap is typeof lap & { lapTime: number } => typeof lap.lapTime === "number" && lap.lapTime > 0);
  if (completed.length === 0) {
    return (
      <section className="replay-insight-panel replay-insight-panel--embedded">
        <p className="replay-insight-panel__lead">Lap-time data is not exported for this session yet.</p>
      </section>
    );
  }

  const maxLap = Math.max(...completed.map((lap) => lap.lapNumber));
  const minTime = Math.min(...completed.map((lap) => lap.lapTime));
  const maxTime = Math.max(...completed.map((lap) => lap.lapTime));
  const range = Math.max(0.001, maxTime - minTime);

  const byDriver = new Map<string, Map<number, number>>();
  const fastestPerDriver = new Map<string, number>();
  for (const lap of completed) {
    let entry = byDriver.get(lap.driverCode);
    if (!entry) {
      entry = new Map();
      byDriver.set(lap.driverCode, entry);
    }
    entry.set(lap.lapNumber, lap.lapTime);
    const previous = fastestPerDriver.get(lap.driverCode);
    if (previous === undefined || lap.lapTime < previous) {
      fastestPerDriver.set(lap.driverCode, lap.lapTime);
    }
  }

  const orderedDriverCodes = Array.from(byDriver.keys()).sort((a, b) => {
    const fa = fastestPerDriver.get(a) ?? Number.POSITIVE_INFINITY;
    const fb = fastestPerDriver.get(b) ?? Number.POSITIVE_INFINITY;
    return fa - fb;
  });
  const driverInfoByCode = new Map(drivers.map((driver) => [driver.driverCode, driver]));

  const rowHeight = 18;
  const cellWidth = Math.max(8, Math.min(18, Math.floor(680 / Math.max(maxLap, 1))));
  const labelWidth = 64;
  const chartWidth = labelWidth + cellWidth * maxLap + 16;
  const chartHeight = orderedDriverCodes.length * rowHeight + 28;

  function tint(time: number) {
    const t = (time - minTime) / range;
    const h = (1 - t) * 120; // green-ish to red
    return `hsl(${h}, 80%, 56%)`;
  }

  return (
    <section className="replay-insight-panel replay-insight-panel--embedded">
      <div className="section-header">
        <div>
          <p className="eyebrow">Lap-time waterfall</p>
          <h2>{minTime.toFixed(3)}s fastest, {maxTime.toFixed(3)}s slowest across {completed.length} laps</h2>
        </div>
      </div>
      <p className="replay-insight-panel__lead">
        One row per driver, ordered by fastest lap. Each cell is a lap; greener = closer to the fastest of the session, redder = slower.
      </p>
      <div className="replay-lap-waterfall">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Lap-time waterfall heatmap">
          <g transform={`translate(0, 14)`}>
            {[1, Math.round(maxLap / 4), Math.round(maxLap / 2), Math.round((3 * maxLap) / 4), maxLap].map((lap) => (
              <text
                key={lap}
                x={labelWidth + (lap - 1) * cellWidth + cellWidth / 2}
                y={0}
                fill="rgba(231,237,247,0.6)"
                fontSize="9"
                textAnchor="middle"
              >
                L{lap}
              </text>
            ))}
          </g>
          {orderedDriverCodes.map((code, rowIndex) => {
            const info = driverInfoByCode.get(code);
            const rowY = 24 + rowIndex * rowHeight;
            return (
              <g key={code} transform={`translate(0, ${rowY})`}>
                <text x={4} y={rowHeight - 5} fill="#ffffff" fontSize="11" fontFamily="IBM Plex Mono, monospace" fontWeight="700">
                  {code}
                </text>
                <text x={4} y={rowHeight + 5} fill={info?.teamColor ?? "rgba(231,237,247,0.5)"} fontSize="8" fontFamily="Aptos, sans-serif" letterSpacing="0.5">
                  {info?.team ? info.team.slice(0, 9).toUpperCase() : ""}
                </text>
                {Array.from({ length: maxLap }, (_, lapIndex) => lapIndex + 1).map((lap) => {
                  const time = byDriver.get(code)?.get(lap);
                  if (time === undefined) {
                    return (
                      <rect
                        key={lap}
                        x={labelWidth + (lap - 1) * cellWidth}
                        y={2}
                        width={cellWidth - 1}
                        height={rowHeight - 4}
                        fill="rgba(255, 255, 255, 0.04)"
                      />
                    );
                  }
                  return (
                    <rect
                      key={lap}
                      x={labelWidth + (lap - 1) * cellWidth}
                      y={2}
                      width={cellWidth - 1}
                      height={rowHeight - 4}
                      fill={tint(time)}
                      opacity={0.85}
                    >
                      <title>{`${code} · L${lap} · ${time.toFixed(3)}s`}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

interface ReplayTrackInfoPanelProps {
  replay: ReplayPack;
  trackId: string;
}

export function ReplayTrackInfoPanel({ replay, trackId }: ReplayTrackInfoPanelProps) {
  const trackLength = replay.trackPath?.length ?? 0;
  const drsZoneCount = replay.trackPath && trackLength > 20 ? 3 : 0;
  const totalLaps = replay.totalLaps ?? Math.max(...replay.laps.map((lap) => lap.lapNumber), 0);
  return (
    <section className="replay-insight-panel replay-insight-panel--embedded">
      <div className="section-header">
        <div>
          <p className="eyebrow">Track</p>
          <h2>{trackId.replace(/-/g, " ").replace(/(^|\s)\S/g, (match) => match.toUpperCase())}</h2>
        </div>
      </div>
      <p className="replay-insight-panel__lead">
        Track read built from the dense reference polyline. Corner labels and marshal sectors land here when an explicit `track.json` pack is exported. DRS zone bands are illustrative until session-specific zones are wired in.
      </p>
      <div className="metric-grid">
        <div className="metric-chip">
          <span>Path points</span>
          <strong>{trackLength}</strong>
        </div>
        <div className="metric-chip">
          <span>Total laps</span>
          <strong>{totalLaps || "-"}</strong>
        </div>
        <div className="metric-chip">
          <span>DRS zones (illustrative)</span>
          <strong>{drsZoneCount}</strong>
        </div>
        <div className="metric-chip">
          <span>Source</span>
          <strong>{replay.source.toUpperCase()}</strong>
        </div>
      </div>
      <p className="replay-track-info-note">
        Press <strong>D</strong> to toggle DRS zones, <strong>L</strong> for driver labels, <strong>B</strong> for race-control event markers on the timeline.
      </p>
    </section>
  );
}
