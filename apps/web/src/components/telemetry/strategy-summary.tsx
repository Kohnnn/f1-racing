import { formatPercent } from "@f1-racing/telemetry-utils";
import type { StrategyPack } from "@/lib/data";

interface StrategySummaryProps {
  strategy: StrategyPack;
}

export function StrategySummary({ strategy }: StrategySummaryProps) {
  return (
    <div className="panel strategy-summary">
      <div className="section-header">
        <div>
          <p className="eyebrow">Strategy layer</p>
          <h2>Pit and weather windows</h2>
        </div>
      </div>
      <div className="strategy-summary__meta">
        <div>
          <span>Pit loss</span>
          <strong>{strategy.pitLossS.toFixed(1)} s</strong>
        </div>
        <div>
          <span>Safety car pit loss</span>
          <strong>{strategy.safetyCarPitLossS.toFixed(1)} s</strong>
        </div>
        <div>
          <span>Intermediate crossover</span>
          <strong>{formatPercent(strategy.weatherCrossover.toIntermediate * 100)}</strong>
        </div>
        <div>
          <span>Wet crossover</span>
          <strong>{formatPercent(strategy.weatherCrossover.toWet * 100)}</strong>
        </div>
      </div>
      <ul className="summary-list">
        {strategy.recommendedWindows.map((window) => (
          <li key={`${window.lapStart}-${window.lapEnd}`}>
            <strong>
              Lap {window.lapStart}-{window.lapEnd}
            </strong>
            <span>{window.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
