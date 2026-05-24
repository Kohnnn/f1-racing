"use client";

import { useEffect, useState } from "react";
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

/**
 * Driver avatar that prefers the photographic portrait WebP when present
 * and falls back to the generated SVG avatar on load error.
 */
function DriverAvatar({ portrait, avatar }: { portrait: string; avatar: string }) {
  const [src, setSrc] = useState(portrait);
  useEffect(() => { setSrc(portrait); }, [portrait]);
  return (
    <span className="driver-card__avatar" aria-hidden="true">
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => { if (src !== avatar) setSrc(avatar); }}
      />
    </span>
  );
}

/**
 * Team mark that prefers the photographic Wikipedia logo with fallback
 * to the generated mark.svg.
 */
function TeamMark({ wikiLogo, mark }: { wikiLogo: string; mark: string }) {
  const [src, setSrc] = useState(wikiLogo);
  useEffect(() => { setSrc(wikiLogo); }, [wikiLogo]);
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="driver-card__team-mark"
      onError={() => { if (src !== mark) setSrc(mark); }}
    />
  );
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
            <DriverAvatar portrait={driverArt.portrait} avatar={driverArt.avatar} />
          ) : null}
          <div>
            <p className="eyebrow driver-card__team-eyebrow">
              {driverArt.team.slug !== "unknown" ? (
                <TeamMark wikiLogo={teamArt.wikiLogo} mark={teamArt.mark} />
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
