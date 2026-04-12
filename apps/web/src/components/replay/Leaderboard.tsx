"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [comparePinned, setComparePinned] = useState(false);

  useEffect(() => {
    if (selectedDrivers.length < 2 && comparePinned) {
      setComparePinned(false);
    }
  }, [comparePinned, selectedDrivers.length]);

  const visibleDrivers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const selectedOrder = new Map(selectedDrivers.map((driverCode, index) => [driverCode, index]));

    const filtered = drivers.filter((driver) => {
      if (!query) {
        return true;
      }

      return [driver.abbr, driver.fullName, driver.team]
        .some((value) => value.toLowerCase().includes(query));
    });

    if (!comparePinned) {
      return filtered;
    }

    return filtered
      .filter((driver) => selectedOrder.has(driver.abbr))
      .sort((left, right) => (selectedOrder.get(left.abbr) ?? 0) - (selectedOrder.get(right.abbr) ?? 0));
  }, [comparePinned, drivers, searchTerm, selectedDrivers]);

  const toolbarLabel = comparePinned
    ? `${visibleDrivers.length || selectedDrivers.length} pinned`
    : selectedDrivers.length
      ? `${selectedDrivers.length} selected`
      : "Click to inspect";

  return (
    <div className="replay-leaderboard">
      <div className="replay-leaderboard__toolbar">
        <div className="replay-leaderboard__toolbar-main">
          <p className="eyebrow">Live order</p>
          <strong>Leaderboard</strong>
          <span>{toolbarLabel}</span>
        </div>
        <div className="replay-leaderboard__toolbar-actions">
          <input
            className="replay-leaderboard__search"
            type="search"
            placeholder="Search driver or team"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Search leaderboard"
          />
          {selectedDrivers.length >= 2 ? (
            <button
              type="button"
              className={`replay-leaderboard__toolbar-button${comparePinned ? " replay-leaderboard__toolbar-button--active" : ""}`}
              onClick={() => setComparePinned((value) => !value)}
            >
              {comparePinned ? "Unpin compare" : "Pin compare"}
            </button>
          ) : null}
          {selectedDrivers.length ? (
            <button
              type="button"
              className="replay-leaderboard__toolbar-button"
              onClick={() => onDriverSelect(null, false)}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="replay-leaderboard__header">
        <span>Pos</span>
        <span>Driver</span>
        <span>Gap</span>
        <span>Tyre</span>
      </div>

      <div className="replay-leaderboard__rows">
        {visibleDrivers.length ? visibleDrivers.map((driver) => {
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
        }) : (
          <div className="replay-leaderboard__empty">
            No drivers match <strong>{searchTerm}</strong>.
          </div>
        )}
      </div>
    </div>
  );
}

export type { ReplayLeaderboardRow };
