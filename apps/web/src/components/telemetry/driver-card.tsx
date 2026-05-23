import { formatLapTime, personalBestSector } from "@f1-racing/telemetry-utils";
import type { DriverSummary, LapRecord } from "@/lib/data";
import { getDriverArt, getTeamArt } from "@/lib/art";

interface DriverCardProps {
  driver: DriverSummary;
  fastestLap?: LapRecord;
  /** All laps for this driver — used to compute the personal best per sector. */
  driverLaps?: LapRecord[];
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

export function DriverCard({ driver, fastestLap, driverLaps }: DriverCardProps) {
  const showCompletedLap = driver.bestLapTime > 0;
  const personalBest = driverLaps?.length
    ? personalBestSector(driverLaps)
    : fastestLap
      ? personalBestSector([fastestLap])
      : { label: "-", seconds: null };
  const driverArt = getDriverArt(driver.driverCode);
  const teamArt = getTeamArt(driverArt.team.slug);

  return (
    <article className="panel driver-card" style={{ ["--driver-team-color" as string]: driverArt.team.baseColor }}>
      <div className="driver-card__header">
        <div className="driver-card__identity">
          {driverArt.driver ? (
            <span className="driver-card__avatar" aria-hidden="true">
              <img src={driverArt.avatar} alt="" loading="lazy" />
            </span>
          ) : null}
          <div>
            <p className="eyebrow driver-card__team-eyebrow">
              {driverArt.team.slug !== "unknown" ? (
                <img src={teamArt.mark} alt="" aria-hidden="true" className="driver-card__team-mark" />
              ) : null}
              {driver.team}
            </p>
            <h3>{driver.fullName}</h3>
            {statusBadge(driver.status)}
          </div>
        </div>
        <span className="driver-card__number">
          {driverArt.driver ? (
            <img src={driverArt.numberPlate} alt={`#${driver.driverNumber}`} loading="lazy" />
          ) : (
            `#${driver.driverNumber}`
          )}
        </span>
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
            {showCompletedLap && personalBest.label !== "-"
              ? `${personalBest.label}${personalBest.seconds ? ` · ${personalBest.seconds.toFixed(3)}s` : ""}`
              : "-"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
