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
  if (!Array.isArray(laps) || laps.some((lap) => !lap || typeof lap.driverCode !== "string" || !lap.driverCode.trim() || !Number.isInteger(lap.lapNumber) || lap.lapNumber <= 0 || (lap.lapTime !== null && (typeof lap.lapTime !== "number" || !Number.isFinite(lap.lapTime) || lap.lapTime < 0)))) return "unknown";
  return laps.some((lap) => typeof lap.lapTime === "number" && Number.isFinite(lap.lapTime) && lap.lapTime > 0)
    ? "available" : "unavailable";
}

export function framePositionSources(frames: ReplayFrame[]): unknown[] {
  return [...new Set(frames.flatMap((frame) => {
    const drivers = Object.values(frame.drivers);
    return drivers.length ? drivers.map((driver) => driver.positionSource) : [undefined];
  }))];
}

export function weatherMeasurement(weather: ReplayWeatherSample | null | undefined, field: "airTempC" | "trackTempC" | "humidityPct" | "windSpeedMps" | "windDirectionDeg"): number | null {
  const value = weather?.[field];
  return typeof value === "number" && Number.isFinite(value) && (weather?.observedFields ? weather.observedFields.includes(field) : value !== 0) ? value : null;
}

export function hasWeatherEvidence(weather?: ReplayWeatherSample | null): boolean {
  return Boolean(weather && (weather.rainfall === true || weather.observedFields?.includes("rainfall") ||
    (["airTempC", "trackTempC", "humidityPct", "windSpeedMps", "windDirectionDeg"] as const).some((field) => weatherMeasurement(weather, field) !== null)));
}

export function weatherLabels(weather?: ReplayWeatherSample | null) {
  const air = weatherMeasurement(weather, "airTempC");
  const track = weatherMeasurement(weather, "trackTempC");
  const speed = weatherMeasurement(weather, "windSpeedMps");
  const direction = weatherMeasurement(weather, "windDirectionDeg");
  return {
    weatherLabel: [air === null ? null : `${air}C air`, track === null ? null : `${track}C track`].filter(Boolean).join(" · ") || "Unavailable",
    windLabel: [speed === null ? null : `${speed.toFixed(1)} m/s`, direction === null ? null : `${Math.round(direction)}°`].filter(Boolean).join(" · ") || "Unavailable",
  };
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
