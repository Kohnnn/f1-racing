import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchCarData,
  fetchDrivers,
  fetchLaps,
  fetchSessionResult,
  fetchSessions,
  fetchStints,
  fetchWeather,
} from "../../ingest/src/openf1-client.mjs";
import { slugify } from "../../normalize/src/normalize-session.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dataRoot = path.join(root, "data");
const publicRoot = path.join(root, "apps", "web", "public", "data");

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(relativePath, payload) {
  const targets = [path.join(dataRoot, relativePath), path.join(publicRoot, relativePath)];
  await Promise.all(
    targets.map(async (filePath) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    })
  );
}

function summarizeWeather(samples) {
  if (!samples.length) {
    return {
      airTempC: 0,
      trackTempC: 0,
      rainRiskPct: 0,
    };
  }

  const airTempC = samples.reduce((sum, item) => sum + Number(item.air_temperature || 0), 0) / samples.length;
  const trackTempC = samples.reduce((sum, item) => sum + Number(item.track_temperature || 0), 0) / samples.length;
  const rainRiskPct = Math.max(...samples.map((item) => Number(item.rainfall || 0)), 0) * 100;

  return {
    airTempC: Math.round(airTempC),
    trackTempC: Math.round(trackTempC),
    rainRiskPct: Math.round(rainRiskPct),
  };
}

function fastestLapByDriver(laps) {
  const map = new Map();
  laps.forEach((lap) => {
    if (!Number.isFinite(lap.lap_duration)) {
      return;
    }
    const current = map.get(lap.driver_number);
    if (!current || lap.lap_duration < current.lap_duration) {
      map.set(lap.driver_number, lap);
    }
  });
  return map;
}

function isoToMs(value) {
  return value ? new Date(value).getTime() : 0;
}

function buildDriverSummaries(drivers, laps, stints) {
  const fastestByDriver = fastestLapByDriver(laps);

  return drivers.map((driver) => {
    const fastest = fastestByDriver.get(driver.driver_number);
    const driverStints = stints.filter((item) => item.driver_number === driver.driver_number);

    return {
      driverCode: driver.name_acronym,
      driverNumber: driver.driver_number,
      fullName: driver.full_name,
      team: driver.team_name,
      bestLap: fastest?.lap_number ?? 0,
      bestLapTime: Number(fastest?.lap_duration ?? 0),
      tyreCompound: fastest?.compound ?? driverStints.at(-1)?.compound ?? "UNKNOWN",
      stintCount: driverStints.length,
    };
  });
}

function buildLapRecords(laps, fastestByDriver) {
  return laps
    .filter((lap) => Number.isFinite(lap.lap_duration))
    .map((lap) => ({
      driverCode: "",
      driverNumber: lap.driver_number,
      lapNumber: lap.lap_number,
      lapTime: Number(lap.lap_duration),
      sector1: Number(lap.duration_sector_1 ?? 0),
      sector2: Number(lap.duration_sector_2 ?? 0),
      sector3: Number(lap.duration_sector_3 ?? 0),
      compound: lap.compound ?? "UNKNOWN",
      stint: Number(lap.stint_number ?? 0),
      isFastest: fastestByDriver.get(lap.driver_number)?.lap_number === lap.lap_number,
    }));
}

function attachDriverCodes(lapRecords, drivers) {
  const byNumber = new Map(drivers.map((driver) => [driver.driverNumber, driver.driverCode]));
  return lapRecords.map((lap) => ({
    ...lap,
    driverCode: byNumber.get(lap.driverNumber) || String(lap.driverNumber),
  }));
}

function buildComparePack(drivers, lapRecords, sessionResult) {
  const orderedDriversFromResults = sessionResult.length
    ? sessionResult
        .slice()
        .sort((left, right) => {
          const leftPosition = left.position == null ? Number.POSITIVE_INFINITY : Number(left.position);
          const rightPosition = right.position == null ? Number.POSITIVE_INFINITY : Number(right.position);
          return leftPosition - rightPosition;
        })
        .map((row) => drivers.find((driver) => driver.driverNumber === Number(row.driver_number)))
        .filter(Boolean)
    : [];

  const orderedDrivers = orderedDriversFromResults.length >= 2
    ? orderedDriversFromResults
    : drivers
        .filter((driver) => Number(driver.bestLapTime) > 0)
        .sort((left, right) => left.bestLapTime - right.bestLapTime);

  const [left, right] = orderedDrivers;
  if (!left || !right) {
    return null;
  }

  const leftLap = lapRecords.find((lap) => lap.driverCode === left.driverCode && lap.isFastest);
  const rightLap = lapRecords.find((lap) => lap.driverCode === right.driverCode && lap.isFastest);
  if (!leftLap || !rightLap) {
    return null;
  }

  const leftSectors = [leftLap.sector1, leftLap.sector2, leftLap.sector3];
  const rightSectors = [rightLap.sector1, rightLap.sector2, rightLap.sector3];
  const sectorEnds = [
    leftLap.sector1 / leftLap.lapTime,
    (leftLap.sector1 + leftLap.sector2) / leftLap.lapTime,
    1,
  ];

  const deltaSections = leftSectors.map((sector, index) => {
    const rival = rightSectors[index];
    return {
      from: index === 0 ? 0 : sectorEnds[index - 1],
      to: sectorEnds[index],
      leader: sector <= rival ? left.driverCode : right.driverCode,
      deltaMs: Math.round(Math.abs(sector - rival) * 1000),
    };
  });

  const events = deltaSections.map((section, index) => {
    const type = section.leader === left.driverCode ? "sector_gain" : "sector_response";
    const note = section.leader === left.driverCode
      ? `${section.leader} is faster through sector ${index + 1}, likely from a cleaner line or more committed entry.`
      : `${section.leader} recovers time in sector ${index + 1}, suggesting better rotation or exit traction.`;
    return {
      type,
      driver: section.leader,
      corner: `S${index + 1}`,
      note,
    };
  });

  return {
    trackId: "",
    drivers: [left.driverCode, right.driverCode],
    laps: [leftLap.lapNumber, rightLap.lapNumber],
    deltaSections,
    events,
    telemetry: undefined,
  };
}

function buildTelemetryTrace(carData, lapRecord, rawLap) {
  if (!lapRecord || !rawLap?.date_start || !Number.isFinite(lapRecord.lapTime)) {
    return null;
  }

  const lapStartMs = isoToMs(rawLap.date_start);
  const lapEndMs = lapStartMs + lapRecord.lapTime * 1000;
  const tracePoints = carData
    .filter((point) => {
      const timestamp = isoToMs(point.date);
      return timestamp >= lapStartMs && timestamp <= lapEndMs + 250;
    })
    .map((point) => {
      const timestamp = isoToMs(point.date);
      return {
        ratio: Math.max(0, Math.min(1, (timestamp - lapStartMs) / (lapRecord.lapTime * 1000))),
        speed: Number(point.speed ?? 0),
        throttle: Number(point.throttle ?? 0),
        brake: Number(point.brake ?? 0),
        gear: point.n_gear == null ? null : Number(point.n_gear),
        rpm: point.rpm == null ? null : Number(point.rpm),
        drs: point.drs == null ? null : Number(point.drs),
      };
    });

  if (!tracePoints.length) {
    return null;
  }

  const targetSampleCount = 90;
  const stride = Math.max(1, Math.floor(tracePoints.length / targetSampleCount));
  const sampled = tracePoints.filter((_, index) => index % stride === 0);
  const lastPoint = tracePoints.at(-1);
  if (lastPoint && sampled.at(-1)?.ratio !== lastPoint.ratio) {
    sampled.push(lastPoint);
  }

  return {
    driverCode: lapRecord.driverCode,
    lapNumber: lapRecord.lapNumber,
    sampleHz: 3.7,
    points: sampled,
  };
}

function firstBrakePoint(points, from, to) {
  const candidate = points.find((point) => point.ratio >= from && point.ratio <= to && point.brake >= 10);
  return candidate ? Number(candidate.ratio.toFixed(3)) : null;
}

function minSpeed(points, from, to) {
  const filtered = points.filter((point) => point.ratio >= from && point.ratio <= to);
  if (!filtered.length) {
    return 0;
  }
  return Math.round(Math.min(...filtered.map((point) => point.speed)));
}

function throttlePickup(points, from, to) {
  const filtered = points.filter((point) => point.ratio >= from && point.ratio <= to);
  const minIndex = filtered.reduce((best, point, index, all) => {
    if (best === -1 || point.speed < all[best].speed) {
      return index;
    }
    return best;
  }, -1);

  if (minIndex === -1) {
    return null;
  }

  const pickup = filtered.slice(minIndex).find((point) => point.throttle >= 60 && point.brake <= 5);
  return pickup ? Number(pickup.ratio.toFixed(3)) : null;
}

function buildCompareAnnotations(compare) {
  if (!compare?.telemetry) {
    return [];
  }

  return compare.deltaSections.map((section, index) => {
    const leftMetrics = {
      brakePointRatio: firstBrakePoint(compare.telemetry.left.points, section.from, section.to),
      minSpeed: minSpeed(compare.telemetry.left.points, section.from, section.to),
      throttlePickupRatio: throttlePickup(compare.telemetry.left.points, section.from, section.to),
    };

    const rightMetrics = {
      brakePointRatio: firstBrakePoint(compare.telemetry.right.points, section.from, section.to),
      minSpeed: minSpeed(compare.telemetry.right.points, section.from, section.to),
      throttlePickupRatio: throttlePickup(compare.telemetry.right.points, section.from, section.to),
    };

    const fasterOnEntry = (leftMetrics.brakePointRatio ?? section.from) > (rightMetrics.brakePointRatio ?? section.from)
      ? compare.telemetry.left.driverCode
      : compare.telemetry.right.driverCode;
    const betterExit = (leftMetrics.throttlePickupRatio ?? section.to) < (rightMetrics.throttlePickupRatio ?? section.to)
      ? compare.telemetry.left.driverCode
      : compare.telemetry.right.driverCode;

    return {
      id: `corner-window-${index + 1}`,
      label: typeof compare.events[index]?.corner === "string" ? String(compare.events[index].corner) : `Corner window ${index + 1}`,
      from: section.from,
      to: section.to,
      leader: section.leader,
      summary: `${section.leader} owns this window overall. ${fasterOnEntry} carries the later brake point, while ${betterExit} reaches throttle earlier on exit.`,
      metrics: {
        left: leftMetrics,
        right: rightMetrics,
      },
    };
  });
}

function buildStrategyPack(trackId, stints, weatherSummary) {
  const maxTyreAge = Math.max(...stints.map((stint) => Number(stint.tyre_age_at_start ?? 0)), 0);
  const recommendedWindows = stints.slice(0, 3).map((stint) => ({
    lapStart: Number(stint.lap_start),
    lapEnd: Number(stint.lap_end),
    reason: `${stint.compound} stint with tyre age ${stint.tyre_age_at_start ?? 0}`,
  }));

  return {
    trackId,
    pitLossS: Number((18 + Math.min(maxTyreAge, 10) * 0.22).toFixed(1)),
    safetyCarPitLossS: Number((11 + Math.min(maxTyreAge, 10) * 0.12).toFixed(1)),
    recommendedWindows,
    weatherCrossover: {
      toIntermediate: Number((Math.min(0.95, weatherSummary.rainRiskPct / 100 + 0.4)).toFixed(2)),
      toWet: Number((Math.min(0.99, weatherSummary.rainRiskPct / 100 + 0.58)).toFixed(2)),
    },
  };
}

function buildStintPack(trackId, sessionKey, drivers, stints, lapRecords) {
  return {
    trackId,
    sessionKey,
    drivers: drivers
      .map((driver) => {
        const driverStints = stints
          .filter((item) => Number(item.driver_number) === driver.driverNumber)
          .map((stint) => {
            const lapTimes = lapRecords
              .filter(
                (lap) =>
                  lap.driverCode === driver.driverCode &&
                  lap.lapNumber >= Number(stint.lap_start) &&
                  lap.lapNumber <= Number(stint.lap_end) &&
                  Number.isFinite(lap.lapTime),
              )
              .map((lap) => Number(lap.lapTime.toFixed(3)));

            const averageLapTime = lapTimes.length
              ? lapTimes.reduce((sum, value) => sum + value, 0) / lapTimes.length
              : 0;
            const trendPerLap = lapTimes.length > 1
              ? (lapTimes[lapTimes.length - 1] - lapTimes[0]) / (lapTimes.length - 1)
              : 0;

            return {
              stintNumber: Number(stint.stint_number ?? 0),
              compound: stint.compound ?? "UNKNOWN",
              lapStart: Number(stint.lap_start ?? 0),
              lapEnd: Number(stint.lap_end ?? 0),
              tyreAgeAtStart: Number(stint.tyre_age_at_start ?? 0),
              averageLapTime: Number(averageLapTime.toFixed(3)),
              trendPerLap: Number(trendPerLap.toFixed(3)),
              lapTimes,
            };
          })
          .filter((stint) => stint.lapTimes.length > 0);

        if (!driverStints.length) {
          return null;
        }

        return {
          driverCode: driver.driverCode,
          team: driver.team,
          stints: driverStints,
        };
      })
      .filter(Boolean),
  };
}

function normalizeSessionRef(session) {
  const grandPrixName = session.meeting_name || session.country_name || session.location || "Unknown Grand Prix";
  return {
    season: Number(session.year),
    grandPrixSlug: slugify(grandPrixName),
    sessionSlug: slugify(session.session_name || "session"),
    grandPrixName,
    sessionName: session.session_name || "Session",
    sessionKey: Number(session.session_key),
    trackId: slugify(session.circuit_short_name || session.location || grandPrixName),
    path: `/sessions/${session.year}/${slugify(grandPrixName)}/${slugify(session.session_name || "session")}`,
    startDate: session.date_start,
    endDate: session.date_end,
    location: session.location || "",
    countryName: session.country_name || "",
  };
}

async function getSeasonManifest() {
  const filePath = path.join(dataRoot, "manifests", "openf1-2025-season.json");
  return readJson(filePath);
}

async function resolveSession(args) {
  if (args.sessionKey) {
    const sessions = await fetchSessions({ year: args.season || 2025 });
    const session = sessions.find((item) => Number(item.session_key) === Number(args.sessionKey));
    if (!session) {
      throw new Error(`Session key ${args.sessionKey} not found.`);
    }
    return session;
  }

  const manifest = await getSeasonManifest();
  const sessions = manifest.grandsPrix.flatMap((grandPrix) => grandPrix.sessions);

  if (args.grandPrixSlug && args.sessionSlug) {
    const session = sessions.find(
      (item) => item.grandPrixSlug === args.grandPrixSlug && item.sessionSlug === args.sessionSlug,
    );
    if (!session) {
      throw new Error(`Session ${args.grandPrixSlug}/${args.sessionSlug} not found in season manifest.`);
    }
    return {
      year: session.season,
      meeting_name: session.grandPrixName,
      session_name: session.sessionName,
      session_key: session.sessionKey,
      circuit_short_name: session.trackId,
      date_start: session.startDate,
      date_end: session.endDate,
      location: session.location,
      country_name: session.countryName,
    };
  }

  const qualifyingSessions = sessions.filter((session) => session.sessionName === "Qualifying");
  const latest = qualifyingSessions.at(-1) || sessions.at(-1);
  if (!latest) {
    throw new Error("No sessions found in OpenF1 2025 season manifest.");
  }

  return {
    year: latest.season,
    meeting_name: latest.grandPrixName,
    session_name: latest.sessionName,
    session_key: latest.sessionKey,
    circuit_short_name: latest.trackId,
    date_start: latest.startDate,
    date_end: latest.endDate,
    location: latest.location,
    country_name: latest.countryName,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const session = await resolveSession(args);
  const ref = normalizeSessionRef(session);

  const driversRaw = await fetchDrivers({ sessionKey: ref.sessionKey });
  const lapsRaw = await fetchLaps({ sessionKey: ref.sessionKey });
  const weatherRaw = await fetchWeather({ sessionKey: ref.sessionKey });
  const sessionResultRaw = await fetchSessionResult({ sessionKey: ref.sessionKey });
  const stintsRaw = await fetchStints({ sessionKey: ref.sessionKey });

  const weatherSummary = summarizeWeather(weatherRaw);
  const drivers = buildDriverSummaries(driversRaw, lapsRaw, stintsRaw);
  const fastestByDriver = fastestLapByDriver(lapsRaw);
  const lapRecords = attachDriverCodes(buildLapRecords(lapsRaw, fastestByDriver), drivers);
  const compare = buildComparePack(drivers, lapRecords, sessionResultRaw);
  const strategy = buildStrategyPack(ref.trackId, stintsRaw, weatherSummary);
  const stintPack = buildStintPack(ref.trackId, ref.sessionKey, drivers, stintsRaw, lapRecords);

  if (compare) {
    const leftDriver = drivers.find((driver) => driver.driverCode === compare.drivers[0]);
    const rightDriver = drivers.find((driver) => driver.driverCode === compare.drivers[1]);
    const leftLap = lapRecords.find((lap) => lap.driverCode === compare.drivers[0] && lap.lapNumber === compare.laps[0]);
    const rightLap = lapRecords.find((lap) => lap.driverCode === compare.drivers[1] && lap.lapNumber === compare.laps[1]);
    const leftRawLap = lapsRaw.find((lap) => Number(lap.driver_number) === leftDriver?.driverNumber && Number(lap.lap_number) === leftLap?.lapNumber);
    const rightRawLap = lapsRaw.find((lap) => Number(lap.driver_number) === rightDriver?.driverNumber && Number(lap.lap_number) === rightLap?.lapNumber);

    if (leftDriver && rightDriver && leftLap && rightLap && leftRawLap && rightRawLap) {
      const leftCarData = await fetchCarData({ sessionKey: ref.sessionKey, driverNumber: leftDriver.driverNumber });
      const rightCarData = await fetchCarData({ sessionKey: ref.sessionKey, driverNumber: rightDriver.driverNumber });
      const leftTrace = buildTelemetryTrace(leftCarData, leftLap, leftRawLap);
      const rightTrace = buildTelemetryTrace(rightCarData, rightLap, rightRawLap);

      if (leftTrace && rightTrace) {
        compare.telemetry = {
          left: leftTrace,
          right: rightTrace,
        };
        compare.annotations = buildCompareAnnotations(compare);
      }
    }
  }

  const summary = {
    season: ref.season,
    grandPrix: ref.grandPrixName,
    session: ref.sessionName,
    sessionKey: ref.sessionKey,
    trackId: ref.trackId,
    generatedAt: new Date().toISOString(),
    source: "openf1",
    drivers: drivers.map((driver) => driver.driverCode),
    weatherSummary,
  };

  const sessionManifest = {
    sessionKey: ref.sessionKey,
    summary: "summary.json",
    drivers: "drivers.json",
    laps: "laps.json",
    compare: compare ? { [`${compare.drivers[0]}-${compare.drivers[1]}`]: `compare/${compare.drivers[0].toLowerCase()}-${compare.drivers[1].toLowerCase()}.json` } : {},
    strategy: "strategy.json",
    stints: "stints.json",
  };

  const base = path.join("packs", "seasons", String(ref.season), ref.grandPrixSlug, ref.sessionSlug);
  await writeJson(path.join(base, "manifest.json"), sessionManifest);
  await writeJson(path.join(base, "summary.json"), summary);
  await writeJson(path.join(base, "drivers.json"), drivers);
  await writeJson(path.join(base, "laps.json"), lapRecords);
  await writeJson(path.join(base, "strategy.json"), strategy);
  await writeJson(path.join(base, "stints.json"), stintPack);
  if (compare) {
    await writeJson(path.join(base, "compare", `${compare.drivers[0].toLowerCase()}-${compare.drivers[1].toLowerCase()}.json`), {
      ...compare,
      trackId: ref.trackId,
    });
  }

  process.stdout.write(`Built OpenF1 session pack for ${ref.grandPrixName} ${ref.sessionName} (${ref.sessionKey}).\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
