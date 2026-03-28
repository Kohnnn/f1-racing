import { bestSectorLabel, formatLapTime } from "@f1-racing/telemetry-utils";
import type { DriverSummary, LapRecord } from "@/lib/data";

interface DriverCardProps {
  driver: DriverSummary;
  fastestLap?: LapRecord;
}

export function DriverCard({ driver, fastestLap }: DriverCardProps) {
  return (
    <article className="panel driver-card">
      <div className="driver-card__header">
        <div>
          <p className="eyebrow">{driver.team}</p>
          <h3>{driver.fullName}</h3>
        </div>
        <span className="driver-card__number">#{driver.driverNumber}</span>
      </div>
      <dl className="driver-card__stats">
        <div>
          <dt>Code</dt>
          <dd>{driver.driverCode}</dd>
        </div>
        <div>
          <dt>Best lap</dt>
          <dd>{formatLapTime(driver.bestLapTime)}</dd>
        </div>
        <div>
          <dt>Compound</dt>
          <dd>{driver.tyreCompound}</dd>
        </div>
        <div>
          <dt>Stints</dt>
          <dd>{driver.stintCount}</dd>
        </div>
        <div>
          <dt>Best sector</dt>
          <dd>
            {fastestLap
              ? bestSectorLabel(fastestLap.sector1, fastestLap.sector2, fastestLap.sector3)
              : "-"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
