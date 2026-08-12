"use client";

import { useEffect, useMemo, useState } from "react";
import { getDriverArt, getTeamArt } from "@/lib/art";

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
  /** Delta to the fastest lap of the session, if known. Format: "+0.932" / "-0.118". */
  lastLapDeltaLabel?: string | null;
  /** When the last completed lap is the driver's first flying lap after a pit (or a stint start). */
  isOutLap?: boolean;
  /** True when this driver currently holds the session fastest lap. */
  isFastestLap?: boolean;
  /** Position delta vs. the previous frame, used to render +N/-N arrows. */
  positionDelta?: number;
  status?: "FINISHED" | "DNF" | "DNS" | "DSQ" | "LAPPED";
}

interface LeaderboardProps {
  drivers: ReplayLeaderboardRow[];
  selectedDrivers: string[];
  onDriverSelect: (driverCode: string | null, append: boolean) => void;
  /** Layout mode: vertical scroll list (default) or horizontal ticker. */
  layout?: "vertical" | "horizontal";
  /** Layout setter; renders a small toggle in the toolbar when provided. */
  onLayoutChange?: (layout: "vertical" | "horizontal") => void;
  orderLabel?: string;
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

function tyreTitle(compound: string | null, age: number | null, fresh: boolean) {
  const label = compound || "Unknown compound";
  if (fresh) {
    return `${label}, fresh out of the pits`;
  }
  return age === null ? label : `${label}, ${age} lap${age === 1 ? "" : "s"}`;
}

function tyreAgeLabel(age: number | null, fresh: boolean): string | null {
  if (fresh) return "FRESH";
  if (age === null) return null;
  return `${age} laps`;
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

function formatSpeed(speed: number | null) {
  if (speed === null) {
    return "-";
  }
  return `${Math.round(speed)} km/h`;
}

function statusGapLabel(status?: ReplayLeaderboardRow["status"]) {
  switch (status) {
    case "DNF": return "DNF";
    case "DNS": return "DNS";
    case "DSQ": return "DSQ";
    default: return null;
  }
}

function isDrsActive(drs: number | null | undefined) {
  return Number(drs ?? 0) >= 10;
}

export function Leaderboard({ drivers, selectedDrivers, onDriverSelect, layout = "vertical", onLayoutChange, orderLabel = "Live order" }: LeaderboardProps) {
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
      ? `${selectedDrivers.length} selected (Shift-click to add)`
      : "Click to inspect · Shift-click for compare";

  return (
    <div className={`replay-leaderboard replay-leaderboard--${layout}`}>
      <div className="replay-leaderboard__toolbar">
        <div className="replay-leaderboard__toolbar-main">
          <p className="eyebrow">{orderLabel}</p>
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
          {onLayoutChange ? (
            <div className="replay-leaderboard__layout-toggle" role="tablist" aria-label="Leaderboard layout">
              <button
                type="button"
                role="tab"
                aria-selected={layout === "vertical"}
                className={`replay-leaderboard__layout-button${layout === "vertical" ? " replay-leaderboard__layout-button--active" : ""}`}
                onClick={() => onLayoutChange("vertical")}
                title="Vertical list"
              >
                List
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={layout === "horizontal"}
                className={`replay-leaderboard__layout-button${layout === "horizontal" ? " replay-leaderboard__layout-button--active" : ""}`}
                onClick={() => onLayoutChange("horizontal")}
                title="Horizontal ticker"
              >
                Ticker
              </button>
            </div>
          ) : null}
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

      {layout === "vertical" ? (
        <div className="replay-leaderboard__header">
          <span>Pos</span>
          <span>Driver</span>
          <span title="Gap to leader">Gap to leader</span>
          <span>Tyre</span>
        </div>
      ) : null}

      <div className={`replay-leaderboard__rows replay-leaderboard__rows--${layout}`}>
        {visibleDrivers.length ? visibleDrivers.map((driver) => {
          const isSelected = selectedDrivers.includes(driver.abbr);
          const drsActive = isDrsActive(driver.drs);
          const retired = driver.status === "DNF" || driver.status === "DNS" || driver.status === "DSQ";
          const overrideGap = statusGapLabel(driver.status);
          const fastest = driver.isFastestLap;
          const positionDelta = driver.positionDelta ?? 0;
          return (
            <button
              key={driver.abbr}
              type="button"
              className={`replay-leaderboard__row${isSelected ? " replay-leaderboard__row--selected" : ""}${retired ? " replay-leaderboard__row--retired" : ""}${fastest ? " replay-leaderboard__row--fastest" : ""}`}
              title={`${driver.fullName} · ${driver.team}${retired ? ` · ${driver.status}` : ` · ${formatSpeed(driver.speed)}`}`}
              aria-pressed={isSelected}
              aria-label={`${driver.fullName}, ${driver.abbr}, position ${driver.position ?? "unavailable"}, ${isSelected ? "selected" : "not selected"}. ${selectedDrivers.length ? "Use Shift plus Enter or Space to add or remove this driver." : "Press Enter or Space to select."}`}
              onClick={(event) => onDriverSelect(driver.abbr, event.shiftKey || event.metaKey || event.ctrlKey)}
            >
              <span className="replay-leaderboard__position" style={{ borderLeft: `4px solid ${driver.color}` }}>
                {driver.position ?? "-"}
                {positionDelta !== 0 ? (
                  <em className={positionDelta < 0 ? "replay-leaderboard__delta--gain" : "replay-leaderboard__delta--loss"}>
                    {positionDelta < 0 ? `▲${Math.abs(positionDelta)}` : `▼${positionDelta}`}
                  </em>
                ) : null}
              </span>
              <span className="replay-leaderboard__driver">
                <span className="replay-leaderboard__stripe" style={{ backgroundColor: driver.color }} />
                <DriverGlyph code={driver.abbr} color={driver.color} />
                <span className="replay-leaderboard__identity">
                  <strong>
                    <TeamLogoBadge code={driver.abbr} />
                    {driver.abbr}
                  </strong>
                  <span>{driver.fullName}</span>
                  <em>{driver.team}</em>
                </span>
              </span>
              <span className="replay-leaderboard__gap">
                {overrideGap ? <span className="replay-leaderboard__status-pill">{overrideGap}</span> : driver.intervalLabel}
                <em>
                  {retired
                    ? "Out of session"
                    : driver.isOutLap
                      ? "Out lap"
                      : driver.lastLapLabel
                        ? `Last ${driver.lastLapLabel}${driver.lastLapDeltaLabel ? ` ${driver.lastLapDeltaLabel}` : ""}`
                        : formatSpeed(driver.speed)}
                </em>
              </span>
              <span className="replay-leaderboard__tyre" title={tyreTitle(driver.compound, driver.tyreAge, (driver.tyreAge ?? -1) === 0)} aria-label={tyreTitle(driver.compound, driver.tyreAge, (driver.tyreAge ?? -1) === 0)}>
                <span className="replay-leaderboard__tyre-dot" style={{ backgroundColor: tyreColor(driver.compound) }} />
                {tyreShort(driver.compound)}
                {tyreAgeLabel(driver.tyreAge, (driver.tyreAge ?? -1) === 0) ? (
                  <em className={(driver.tyreAge ?? -1) === 0 ? "replay-leaderboard__tyre-fresh" : undefined}>
                    {tyreAgeLabel(driver.tyreAge, (driver.tyreAge ?? -1) === 0)}
                  </em>
                ) : null}
                {drsActive ? <strong>DRS</strong> : null}
              </span>
            </button>
          );
        }) : (
          <div className="replay-leaderboard__empty">
            No drivers match <strong>{searchTerm}</strong>.
          </div>
        )}
      </div>

      <div className="replay-leaderboard__legend" aria-label="Tyre compound legend">
        <span><span className="replay-leaderboard__tyre-dot" style={{ backgroundColor: "#ff3333" }} /> S Soft</span>
        <span><span className="replay-leaderboard__tyre-dot" style={{ backgroundColor: "#ffd700" }} /> M Medium</span>
        <span><span className="replay-leaderboard__tyre-dot" style={{ backgroundColor: "#ffffff" }} /> H Hard</span>
        <span><span className="replay-leaderboard__tyre-dot" style={{ backgroundColor: "#33ff33" }} /> I Inter</span>
        <span><span className="replay-leaderboard__tyre-dot" style={{ backgroundColor: "#3b82f6" }} /> W Wet</span>
      </div>
    </div>
  );
}

export type { ReplayLeaderboardRow };

/**
 * Small avatar glyph for a driver. Prefers the photographic portrait
 * (`/images/drivers/<slug>.webp`) when present and falls back to the
 * generated SVG avatar (`/images/drivers/avatars/<slug>.svg`) on load
 * error. Final fallback is an initials chip in team colour.
 */
function DriverGlyph({ code, color }: { code: string; color: string }) {
  const art = getDriverArt(code);
  const [src, setSrc] = useState<string | null>(art.driver ? art.portrait : null);
  // Reset when driver code changes.
  useEffect(() => {
    setSrc(art.driver ? art.portrait : null);
  }, [art.driver, art.portrait]);
  if (art.driver && src) {
    return (
      <span className="replay-leaderboard__avatar" aria-hidden="true">
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => {
            // Drop down to the SVG avatar when the photo asset is missing.
            if (src !== art.avatar) setSrc(art.avatar);
          }}
        />
      </span>
    );
  }
  return (
    <span className="replay-leaderboard__avatar replay-leaderboard__avatar--fallback" aria-hidden="true" style={{ backgroundColor: color }}>
      {code.slice(0, 3)}
    </span>
  );
}

/**
 * Tiny team logo chip rendered next to the driver code in the leaderboard
 * identity column. Prefers the Wikipedia bitmap logo and falls back to
 * the generated mark.svg.
 */
function TeamLogoBadge({ code }: { code: string }) {
  const art = getDriverArt(code);
  const teamArt = getTeamArt(art.team.slug);
  const [src, setSrc] = useState(teamArt.wikiLogo);
  useEffect(() => { setSrc(teamArt.wikiLogo); }, [teamArt.wikiLogo]);
  if (!art.driver || art.team.slug === "unknown") return null;
  return (
    <img
      className="replay-leaderboard__team-logo"
      src={src}
      alt=""
      aria-hidden="true"
      onError={() => { if (src !== teamArt.mark) setSrc(teamArt.mark); }}
    />
  );
}

// Re-export to silence unused-import warnings; the helper is consumed
// indirectly via DriverGlyph above. getTeamArt is reserved for future
// rollouts (e.g. team logo on hover detail).
void getTeamArt;
