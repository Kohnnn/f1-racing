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

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function includesChequered(value) {
  const normalized = String(value ?? "").toUpperCase();
  return normalized.includes("CHEQUERED") || normalized.includes("CHECKERED");
}

export function derivePitCycleOutcomes({
  session,
  frames,
  expectedFrameCount,
  totalTime,
  fullRaceLoaded,
  stintPack,
  lapRecords,
  raceControlMessages,
}) {
  if (String(session).trim().toLowerCase() !== "race") {
    return { status: "unavailable", reason: "Pit-cycle outcomes are available for races only.", outcomes: [], omittedCycles: 0 };
  }
  if (!stintPack?.drivers?.length || !lapRecords?.length) {
    return { status: "unavailable", reason: "Recorded stint and lap data are required.", outcomes: [], omittedCycles: 0 };
  }
  const orderedFrames = Array.isArray(frames)
    ? frames.slice().sort((left, right) => left.t - right.t)
    : [];
  const frameCountComplete = !Number.isFinite(expectedFrameCount)
    || orderedFrames.length === expectedFrameCount;
  const finalTimeComplete = !Number.isFinite(totalTime)
    || (orderedFrames.at(-1)?.t ?? -1) >= totalTime;
  if (!fullRaceLoaded || !frameCountComplete || !finalTimeComplete) {
    return { status: "requires_full_race", reason: "Load the complete race before deriving pit-cycle outcomes.", outcomes: [], omittedCycles: 0 };
  }
  const finalFrame = orderedFrames.at(-1);
  const hasChequeredEvidence = includesChequered(finalFrame?.trackStatus)
    || (raceControlMessages ?? []).some((message) => includesChequered(message.flag) || includesChequered(message.message));
  if (!hasChequeredEvidence) {
    return { status: "unavailable", reason: "A recorded chequered-flag event is required.", outcomes: [], omittedCycles: 0 };
  }

  const lapsByDriver = new Map();
  for (const lap of lapRecords) {
    if (!Number.isFinite(lap.lapNumber) || !Number.isFinite(lap.lapTime) || lap.lapTime <= 0) continue;
    const driverLaps = lapsByDriver.get(lap.driverCode) ?? [];
    driverLaps.push(lap);
    lapsByDriver.set(lap.driverCode, driverLaps);
  }
  for (const driverLaps of lapsByDriver.values()) {
    driverLaps.sort((left, right) => left.lapNumber - right.lapNumber);
  }

  const outcomes = [];
  let omittedCycles = 0;
  for (const driver of stintPack.drivers) {
    const stints = driver.stints.slice().sort((left, right) => left.lapStart - right.lapStart);
    for (let index = 1; index < stints.length; index += 1) {
      const previousStint = stints[index - 1];
      const nextStint = stints[index];
      if (nextStint.lapStart <= previousStint.lapStart) continue;
      const pitLap = nextStint.lapStart - 1;
      const outLap = nextStint.lapStart;
      let beforeFrame = null;
      for (let frameIndex = orderedFrames.length - 1; frameIndex >= 0; frameIndex -= 1) {
        const candidate = orderedFrames[frameIndex];
        if (candidate.drivers?.[driver.driverCode]?.lap === pitLap) {
          beforeFrame = candidate;
          break;
        }
      }
      const afterFrame = beforeFrame
        ? orderedFrames.find((frame) => frame.t > beforeFrame.t && frame.drivers?.[driver.driverCode]?.lap === outLap)
        : null;
      const beforeDriver = beforeFrame?.drivers?.[driver.driverCode];
      const afterDriver = afterFrame?.drivers?.[driver.driverCode];
      if (!beforeFrame || !afterFrame || !beforeDriver || !afterDriver) {
        omittedCycles += 1;
        continue;
      }

      const driverLaps = lapsByDriver.get(driver.driverCode) ?? [];
      const preLaps = driverLaps
        .filter((lap) => lap.lapNumber <= pitLap)
        .slice(-3)
        .map((lap) => lap.lapTime);
      const postLaps = driverLaps
        .filter((lap) => lap.lapNumber >= outLap + 1)
        .slice(0, 3)
        .map((lap) => lap.lapTime);
      const prePace = preLaps.length >= 2 ? median(preLaps) : null;
      const postPace = postLaps.length >= 2 ? median(postLaps) : null;
      const beforeGap = Number.isFinite(beforeDriver.interval) ? beforeDriver.interval : null;
      const afterGap = Number.isFinite(afterDriver.interval) ? afterDriver.interval : null;

      outcomes.push({
        id: `${driver.driverCode}-${pitLap}-${outLap}`,
        driverCode: driver.driverCode,
        team: driver.team,
        pitLap,
        outLap,
        fromCompound: previousStint.compound,
        toCompound: nextStint.compound,
        beforeTime: beforeFrame.t,
        afterTime: afterFrame.t,
        beforePosition: beforeDriver.position,
        afterPosition: afterDriver.position,
        positionDelta: afterDriver.position - beforeDriver.position,
        beforeReplayGap: beforeGap,
        afterReplayGap: afterGap,
        replayGapDelta: beforeGap !== null && afterGap !== null ? afterGap - beforeGap : null,
        prePace,
        postPace,
        paceDelta: prePace !== null && postPace !== null ? postPace - prePace : null,
      });
    }
  }

  outcomes.sort((left, right) => left.pitLap - right.pitLap || left.driverCode.localeCompare(right.driverCode));
  return {
    status: "ready",
    reason: outcomes.length ? "Derived from recorded stint boundaries, replay order, and lap timing." : "No pit cycles have complete replay anchors.",
    outcomes,
    omittedCycles,
  };
}
