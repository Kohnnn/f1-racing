"use client";

interface ReplayLeaderboardRow {
  abbr: string;
  fullName: string;
  team: string;
  color: string;
  position: number | null;
  intervalLabel: string;
  compound: string | null;
  tyreAge: number | null;
  lap: number | null;
  speed: number | null;
  throttle?: number | null;
  brake?: number | null;
  gear?: number | null;
  rpm?: number | null;
  drs?: number | null;
  lastLapLabel: string | null;
}

interface LeaderboardProps {
  drivers: ReplayLeaderboardRow[];
  selectedDrivers: string[];
  onDriverSelect: (driverCode: string | null, append: boolean) => void;
}

function tyreShort(compound: string | null) {
  if (!compound) {
    return "-";
  }
  switch (compound.toUpperCase()) {
    case "SOFT": return "S";
    case "MEDIUM": return "M";
    case "HARD": return "H";
    case "INTERMEDIATE": return "I";
    case "WET": return "W";
    default: return compound.slice(0, 1).toUpperCase();
  }
}

function tyreColor(compound: string | null) {
  if (!compound) {
    return "#6b7280";
  }
  switch (compound.toUpperCase()) {
    case "SOFT": return "#ff3333";
    case "MEDIUM": return "#ffd700";
    case "HARD": return "#ffffff";
    case "INTERMEDIATE": return "#33ff33";
    case "WET": return "#3b82f6";
    default: return "#6b7280";
  }
}

export function Leaderboard({ drivers, selectedDrivers, onDriverSelect }: LeaderboardProps) {
  return (
    <div className="replay-leaderboard">
      <div className="replay-leaderboard__toolbar">
        <div>
          <p className="eyebrow">Live order</p>
          <strong>Leaderboard</strong>
        </div>
        <span>{selectedDrivers.length ? `${selectedDrivers.length} selected` : "Click to inspect"}</span>
      </div>

      <div className="replay-leaderboard__header">
        <span>Pos</span>
        <span>Driver</span>
        <span>Gap</span>
        <span>Tyre</span>
      </div>

      <div className="replay-leaderboard__rows">
        {drivers.map((driver) => {
          const isSelected = selectedDrivers.includes(driver.abbr);
          return (
            <button
              key={driver.abbr}
              type="button"
              className={`replay-leaderboard__row${isSelected ? " replay-leaderboard__row--selected" : ""}`}
              title={`${driver.fullName} · ${driver.team}`}
              onClick={(event) => onDriverSelect(driver.abbr, event.shiftKey || event.metaKey || event.ctrlKey)}
            >
              <span className="replay-leaderboard__position">{driver.position ?? "-"}</span>
              <span className="replay-leaderboard__driver">
                <span className="replay-leaderboard__stripe" style={{ backgroundColor: driver.color }} />
                <span className="replay-leaderboard__identity">
                  <strong>{driver.abbr}</strong>
                  <span>{driver.fullName}</span>
                </span>
              </span>
              <span className="replay-leaderboard__gap">{driver.intervalLabel}</span>
              <span className="replay-leaderboard__tyre" title={driver.compound || undefined}>
                <span className="replay-leaderboard__tyre-dot" style={{ backgroundColor: tyreColor(driver.compound) }} />
                {tyreShort(driver.compound)}
                {driver.tyreAge !== null ? <em>{driver.tyreAge}</em> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { ReplayLeaderboardRow };
