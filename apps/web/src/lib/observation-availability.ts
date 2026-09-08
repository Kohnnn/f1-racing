import type { ReplayFrame, ReplayLap, ReplayWeatherSample } from "./data";

export type PositionAvailability = "recorded" | "mixed" | "synthetic" | "unknown";
export interface ObservationAvailability {
  provider: string;
  positions: PositionAvailability;
  timing: "available" | "unavailable" | "unknown";
  controls: "available" | "unavailable" | "unknown";
  weather: "available" | "unavailable" | "unknown";
}

export function classifyPositions(sources: Iterable<unknown>): PositionAvailability {
  const observed = new Set(sources);
  if (!observed.size || [...observed].some((source) => source !== "gps" && source !== "synthetic")) return "unknown";
  if (observed.size === 2) return "mixed";
  return observed.has("gps") ? "recorded" : "synthetic";
}

export function timingAvailability(laps: ReplayLap[] | null): ObservationAvailability["timing"] {
  if (!Array.isArray(laps) || laps.some((lap) => !lap || typeof lap !== "object")) return "unknown";
  return laps.some((lap) => typeof lap.lapTime === "number" && Number.isFinite(lap.lapTime) && lap.lapTime > 0)
    ? "available" : "unavailable";
}

export function framePositionSources(frames: ReplayFrame[]): unknown[] {
  return [...new Set(frames.flatMap((frame) => {
    const drivers = Object.values(frame.drivers);
    return drivers.length ? drivers.map((driver) => driver.positionSource) : [undefined];
  }))];
}

export function hasWeatherEvidence(weather?: ReplayWeatherSample | null): boolean {
  return Boolean(weather && [weather.airTempC, weather.trackTempC, weather.humidityPct, weather.windSpeedMps, weather.windDirectionDeg]
    .some((value) => Number.isFinite(value) && value !== 0));
}

export function availabilityLabel(availability?: ObservationAvailability): string {
  const positions = {
    recorded: "Recorded GPS positions",
    mixed: "Mixed recorded GPS / synthetic positions",
    synthetic: "Synthetic positions",
    unknown: "Position coverage unknown",
  }[availability?.positions ?? "unknown"];
  return `Whole pack: ${positions}. Recorded timing ${availability?.timing ?? "unknown"}; race controls ${availability?.controls ?? "unknown"}; weather ${availability?.weather ?? "unknown"}.`;
}
