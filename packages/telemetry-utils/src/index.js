export function formatLapTime(seconds) {
  const totalMs = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const remainingMs = totalMs % 60000;
  const formatted = (remainingMs / 1000).toFixed(3).padStart(minutes > 0 ? 6 : 0, "0");
  return minutes > 0 ? `${minutes}:${formatted}` : formatted;
}

export function formatDeltaMs(value) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(0)} ms`;
}

export function formatPercent(value) {
  return `${Math.round(value)}%`;
}

export function bestSectorLabel(sector1, sector2, sector3) {
  const sectors = [sector1, sector2, sector3];
  const min = Math.min(...sectors);
  return `S${sectors.indexOf(min) + 1}`;
}
