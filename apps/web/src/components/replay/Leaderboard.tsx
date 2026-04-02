"use client";

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
            style={{ borderLeftColor: teamColor }}
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
                  style={{ backgroundColor: getTyreColor(driver.tyreCompound) }}
                  title={driver.tyreCompound}
                />
              )}
              {driver.tyreCompound || "-"}
            </span>
          </div>
        );
      })}

      <style>{`
        .leaderboard {
          background: #16162a;
          border-radius: 12px;
          overflow: hidden;
          min-width: 280px;
        }

        .leaderboard-header {
          display: grid;
          grid-template-columns: 40px 1fr 80px 70px;
          padding: 12px 16px;
          background: #1e1e3a;
          font-size: 11px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #2a2a4a;
        }

        .leaderboard-empty {
          padding: 40px;
          text-align: center;
          color: #666;
        }

        .leaderboard-row {
          display: grid;
          grid-template-columns: 40px 1fr 80px 70px;
          padding: 10px 16px;
          align-items: center;
          border-bottom: 1px solid #222244;
          border-left: 3px solid transparent;
          cursor: pointer;
          transition: background 0.1s;
        }

        .leaderboard-row:hover {
          background: #1e1e3a;
        }

        .leaderboard-row--selected {
          background: #2a2a4a;
        }

        .leaderboard-row:last-child {
          border-bottom: none;
        }

        .position {
          font-weight: 700;
          font-size: 14px;
        }

        .driver {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .driver-code {
          font-weight: 600;
          font-size: 13px;
        }

        .driver-team {
          font-size: 10px;
          color: #888;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .interval {
          font-family: monospace;
          font-size: 12px;
          color: #aaa;
        }

        .tyre {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: #888;
        }

        .tyre-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 1px solid #444;
        }
      `}</style>
    </div>
  );
}
