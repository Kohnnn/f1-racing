import { bestSectorLabel, formatLapTime } from "@f1-racing/telemetry-utils";
import type { DriverSummary, LapRecord } from "@/lib/data";

interface DriverCardProps {
  driver: DriverSummary;
  fastestLap?: LapRecord;
}

function bestLapLabel(driver: DriverSummary) {
  if (driver.bestLapTime > 0) {
    return formatLapTime(driver.bestLapTime);
  }
  if (driver.status === "DNS") return "Did not start";
  if (driver.status === "DNF") return "Did not finish";
  if (driver.status === "DSQ") return "Disqualified";
  return "Not yet completed";
}

function statusBadge(status?: DriverSummary["status"]) {
  if (!status || status === "FINISHED") return null;
  return <span className={`driver-card__status driver-card__status--${status.toLowerCase()}`}>{status}</span>;
}

export function DriverCard({ driver, fastestLap }: DriverCardProps) {
  const showCompletedLap = driver.bestLapTime > 0;
  return (
    <article className="panel driver-card">
      <div className="driver-card__header">
        <div>
          <p className="eyebrow">{driver.team}</p>
          <h3>{driver.fullName}</h3>
          {statusBadge(driver.status)}
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
          <dd>{bestLapLabel(driver)}</dd>
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
            {showCompletedLap && fastestLap
              ? bestSectorLabel(fastestLap.sector1, fastestLap.sector2, fastestLap.sector3)
              : "-"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
