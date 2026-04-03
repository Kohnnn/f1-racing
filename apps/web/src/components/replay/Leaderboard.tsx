"use client";

import type { CSSProperties } from "react";
import type { ReplayDriver, ReplayFrame } from "@/lib/data";

interface LeaderboardProps {
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  selectedDriver: string | null;
  onDriverSelect: (driverCode: string | null) => void;
}

const TEAM_COLORS: Record<string, string> = {
  "Red Bull Racing": "#3671C6",
  "Ferrari": "#E8002D",
  "McLaren": "#FF8000",
  "Mercedes": "#27F4D2",
  "Aston Martin": "#229971",
  "Alpine": "#FF87BC",
  "Williams": "#64C4FF",
  "RB": "#9BB1FF",
  "Kick Sauber": "#52E252",
  "Haas F1 Team": "#B6BABE",
  "Haas": "#B6BABE",
};

export function Leaderboard({
  drivers,
  currentFrame,
  selectedDriver,
  onDriverSelect,
}: LeaderboardProps) {
  if (!currentFrame) {
    return (
      <div className="leaderboard">
        <div className="leaderboard-header">Position</div>
        <div className="leaderboard-empty">Loading...</div>
      </div>
    );
  }

  const driverPositions = Object.values(currentFrame.drivers)
    .filter((d) => d.position > 0)
    .sort((a, b) => a.position - b.position);

  const getTyreColor = (compound: string | null): string => {
    if (!compound) return "#666";
    switch (compound.toUpperCase()) {
      case "SOFT": return "#FF3333";
      case "MEDIUM": return "#FFD700";
      case "HARD": return "#FFFFFF";
      case "INTERMEDIATE": return "#33FF33";
      case "WET": return "#0066FF";
      default: return "#666";
    }
  };

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <span>Pos</span>
        <span>Driver</span>
        <span>Time</span>
        <span> tyre</span>
      </div>

      {driverPositions.map((driver) => {
        const driverInfo = drivers.find((d) => d.driverCode === driver.driverCode);
        const teamColor = driverInfo?.teamColor || TEAM_COLORS[driver?.team || ""] || "#888888";
        const isSelected = selectedDriver === driver.driverCode;

        return (
          <div
            key={driver.driverCode}
            className={`leaderboard-row ${isSelected ? "leaderboard-row--selected" : ""}`}
            onClick={() => onDriverSelect(isSelected ? null : driver.driverCode)}
            style={{ "--team-color": teamColor } as CSSProperties}
          >
            <span className="position">{driver.position}</span>
            <span className="driver">
              <span className="driver-code">{driver.driverCode}</span>
              <span className="driver-team">{driver.team}</span>
            </span>
            <span className="interval">
              {driver.interval !== null
                ? driver.interval === 0
                  ? "LEADER"
                  : `+${driver.interval.toFixed(3)}`
                : "-"}
            </span>
            <span className="tyre">
              {driver.tyreCompound && (
                <span
                  className="tyre-dot"
                  style={{ "--tyre-color": getTyreColor(driver.tyreCompound) } as CSSProperties}
                  title={driver.tyreCompound}
                />
              )}
              {driver.tyreCompound || "-"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
