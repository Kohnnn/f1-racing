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
  const sectors = [sector1, sector2, sector3].filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (!sectors.length) return "-";
  const min = Math.min(...sectors);
  const index = [sector1, sector2, sector3].indexOf(min);
  return `S${index + 1}`;
}

/**
 * Computes the driver's personal-best sector across all completed laps and
 * returns both the label (`S1` / `S2` / `S3`) and the time in seconds.
 * Falls back to a single-lap reading when only one lap is available.
 */
export function personalBestSector(laps) {
  let best = { label: "-", seconds: null };
  if (!Array.isArray(laps) || !laps.length) return best;
  const sectorBests = [Infinity, Infinity, Infinity];
  for (const lap of laps) {
    const candidates = [lap?.sector1, lap?.sector2, lap?.sector3];
    for (let i = 0; i < 3; i += 1) {
      const value = Number(candidates[i]);
      if (Number.isFinite(value) && value > 0 && value < sectorBests[i]) {
        sectorBests[i] = value;
      }
    }
  }
  const min = Math.min(...sectorBests);
  if (!Number.isFinite(min)) return best;
  const index = sectorBests.indexOf(min);
  return { label: `S${index + 1}`, seconds: min };
}
