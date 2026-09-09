import assert from "node:assert/strict";
import { generationTimestamp, normalizeTimestamp } from "../../normalize/src/normalize-session.mjs";
import { buildReplayLaps, buildStintTimelines, enrichReplayLapsWithStints, groupByDriverNumber } from "./build-openf1-replay-pack.mjs";
import { buildLapRecords, buildStintPack, normalizeResults, normalizeStints, normalizeWeather } from "./build-openf1-session-pack.mjs";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cachedResults, cachedEmptyStints, cachedUntimedLaps } from "./cached-unclassified.fixture.mjs";
import { SessionResultSchema, StintPackSchema } from "../../../packages/schemas/src/index.js";

if (process.env.F1_CACHED_RESPONSES) {
  for (const fixture of [...cachedResults, ...cachedEmptyStints, ...cachedUntimedLaps]) {
    const body = await readFile(`${process.env.F1_CACHED_RESPONSES}/${fixture.pointer}`);
    assert.equal(createHash("sha256").update(body).digest("hex"), fixture.sha256);
    const rows = JSON.parse(body);
    for (const row of fixture.rows) assert.ok(rows.some(source => JSON.stringify(source) === JSON.stringify(row)), fixture.pointer);
  }
}

for (const fixture of cachedResults) {
  const drivers = fixture.rows.map(row => ({ driver_number: row.driver_number, name_acronym: String(row.driver_number) }));
  const results = normalizeResults(drivers, fixture.rows);
  assert.equal(results.length, drivers.length);
  for (const result of results) {
    assert.equal(result.position, null);
    assert.equal(result.status, fixture.rows.find(row => String(row.driver_number) === result.driverCode).dns ? "DNS" : "DNF");
    assert.equal(SessionResultSchema.safeParse(result).success, true);
  }
  for (const change of [{ dnf: false, dns: false }, { dnf: "true", dns: false }, { position: undefined }, { position: -1 }, { position: 0 }]) {
    assert.throws(() => normalizeResults(drivers, fixture.rows.map((row, index) => index ? row : { ...row, ...change })), /Result position/);
  }
}
assert.equal(SessionResultSchema.safeParse({ driverCode: "TST", position: null }).success, false);
assert.equal(SessionResultSchema.safeParse({ driverCode: "TST", position: null, status: "FINISHED" }).success, false);

const generatedAt = "2026-08-22T12:34:56.789Z";
assert.equal(generationTimestamp(generatedAt), generatedAt);
assert.equal(generationTimestamp("2026-08-22T14:34:56.789+02:00"), generatedAt);
assert.equal(generationTimestamp(undefined, new Date(generatedAt)), generatedAt);
assert.equal(generationTimestamp(generatedAt), generationTimestamp(generatedAt));
assert.throws(() => normalizeTimestamp("2026-02-30T00:00:00Z", "Generation time"), /calendar timestamp/);

assert.deepEqual(normalizeResults([
  { driver_number: 4, name_acronym: "NOR" },
  { driver_number: 81, name_acronym: "PIA" },
], [
  { driver_number: 81, position: 2 },
  { driver_number: 4, position: 1 },
]), [
  { driverCode: "NOR", position: 1 },
  { driverCode: "PIA", position: 2 },
]);
assert.throws(() => normalizeResults([{ driver_number: 4, name_acronym: "NOR" }], []), /coverage/);
assert.throws(() => normalizeResults([{ driver_number: null, name_acronym: "NOR" }], [{ driver_number: null, position: 1 }]), /Driver number/);
assert.throws(() => normalizeResults([{ driver_number: 4, name_acronym: "NOR" }], [{ driver_number: 4, position: true }]), /Result position/);
assert.throws(() => normalizeResults([
  { driver_number: 4, name_acronym: "NOR" },
  { driver_number: 81, name_acronym: "PIA" },
], [
  { driver_number: 4, position: 1 },
  { driver_number: 81, position: 1 },
]), /unique/);

assert.deepEqual(normalizeWeather([
  { date: "2026-07-01T00:30:00+00:00", air_temperature: 20.5, track_temperature: 31, humidity: 70, pressure: 1000, rainfall: 0, wind_direction: 180, wind_speed: 3.2 },
])[0], {
  at: "2026-07-01T00:30:00.000Z",
  airTempC: 20.5,
  trackTempC: 31,
  humidityPct: 70,
  pressureMbar: 1000,
  rainfall: 0,
  windDirectionDeg: 180,
  windSpeedMps: 3.2,
});
assert.throws(() => normalizeWeather([]), /non-empty/);
assert.throws(() => normalizeWeather([{ date: "invalid" }]), /RFC 3339/);
assert.throws(() => normalizeWeather([{ date: null }]), /RFC 3339/);
assert.throws(() => normalizeWeather([{ date: "2026-07-01T00:30:00" }]), /RFC 3339/);
assert.throws(() => normalizeWeather([{ date: "2026-02-30T00:30:00.000Z", air_temperature: 20 }]), /calendar timestamp/);
assert.throws(() => normalizeWeather([{ date: "2026-07-01T00:30:00.000Z" }]), /at least one measurement/);
assert.throws(() => normalizeWeather([{ date: "2026-07-01T00:30:00.000Z", air_temperature: "20" }]), /air_temperature/);

assert.deepEqual(normalizeStints([
  { driver_number: 4, stint_number: 2, lap_start: 5, lap_end: 7, compound: "HARD" },
  { driver_number: 4, stint_number: 1, lap_start: 1, lap_end: 4, compound: "MEDIUM" },
]).map(({ lap_start: lapStart, lap_end: lapEnd }) => [lapStart, lapEnd]), [[1, 4], [5, 7]]);
assert.deepEqual(normalizeStints([
  { driver_number: 4, stint_number: 1, lap_start: 1, lap_end: 4 },
  { driver_number: 4, stint_number: 2, lap_start: 4, lap_end: 7 },
]).map(({ lap_start: lapStart, lap_end: lapEnd }) => [lapStart, lapEnd]), [[1, 3], [4, 7]]);
assert.deepEqual(normalizeStints([
  { driver_number: 4, stint_number: 1, lap_start: 1, lap_end: 1 },
  { driver_number: 4, stint_number: 2, lap_start: 1, lap_end: 4 },
]).map(({ stint_number: stintNumber, lap_start: lapStart, lap_end: lapEnd }) => [stintNumber, lapStart, lapEnd]), [[2, 1, 4]]);
assert.deepEqual(normalizeStints([
  { driver_number: 81, stint_number: 1, lap_start: 1, lap_end: 2 },
  { driver_number: 4, stint_number: 1, lap_start: 1, lap_end: 2 },
]).map(({ driver_number: driverNumber }) => driverNumber), [4, 81]);
assert.throws(() => normalizeStints([{ driver_number: null, stint_number: 1, lap_start: 1, lap_end: 2 }]), /Stint driver number/);
assert.throws(() => normalizeStints([
  { driver_number: 4, stint_number: 1, lap_start: 1, lap_end: 5 },
  { driver_number: 4, stint_number: 2, lap_start: 4, lap_end: 7 },
]), /overlapping/);
assert.throws(() => normalizeStints([
  { driver_number: 4, stint_number: 1, lap_start: 1, lap_end: 5 },
  { driver_number: 4, stint_number: 2, lap_start: 3, lap_end: 7 },
]), /overlapping/);

for (const fixture of cachedEmptyStints) {
  assert.throws(() => normalizeStints(fixture.rows), /raw laps/);
  assert.throws(() => normalizeStints(fixture.rows, [{ driver_number: fixture.rows[0].driver_number, lap_number: 1, lap_duration: null }]), /stint coverage/);
  assert.deepEqual(normalizeStints(fixture.rows, []), []);
  const driver = { driverCode: "TST", driverNumber: fixture.rows[0].driver_number, team: "Test" };
  const pack = buildStintPack("test", fixture.rows[0].session_key, [driver], normalizeStints(fixture.rows, []), []);
  assert.deepEqual(pack.drivers.map(row => row.stints), [[]]);
  assert.equal(StintPackSchema.safeParse(pack).success, true);
  assert.throws(() => buildLapRecords([{ driver_number: driver.driverNumber, lap_number: 1, lap_duration: 90 }], new Map(), []), /stint coverage/);
  for (const change of [{ lap_start: 1 }, { lap_end: 1 }, { lap_start: -1, lap_end: -1 }, { lap_start: undefined }]) {
    assert.throws(() => normalizeStints([{ ...fixture.rows[0], ...change }]), /Stint lap/);
  }
}

for (const fixture of cachedUntimedLaps) {
  const stints = cachedEmptyStints.find(entry => entry.rows[0].session_key === fixture.rows[0].session_key);
  assert.throws(() => normalizeStints(stints.rows, fixture.rows), /unavailable stint coverage/);
  assert.throws(() => buildLapRecords(fixture.rows, new Map(), []), /stint coverage/);
}

const partialRaw = [{ driver_number: 4, lap_number: 1, lap_duration: null, duration_sector_1: 22.5 }];
const partialStints = [{ driver_number: 4, stint_number: 1, lap_start: 1, lap_end: 1, compound: "MEDIUM", tyre_age_at_start: 0 }];
assert.throws(() => normalizeStints([], partialRaw), /stint coverage/);
assert.throws(() => normalizeStints(partialStints, [{ lap_number: 1, lap_duration: null }]), /Lap driver number/);
assert.throws(() => buildLapRecords(partialRaw, new Map(), []), /stint coverage/);
assert.throws(() => buildLapRecords(partialRaw, new Map(), [...partialStints, ...partialStints]), /stint coverage/);
assert.equal(buildReplayLaps(partialRaw, [{ driverNumber: 4, driverCode: "NOR" }])[0].lapTime, null);
const partialRecords = buildLapRecords(partialRaw, new Map(), partialStints);
assert.equal(partialRecords.length, 1);
assert.equal(partialRecords[0].lapTime, null);
assert.equal(partialRecords[0].sector1, 22.5);
assert.equal(partialRecords[0].sector2, null);
assert.equal(partialRecords[0].stint, 1);
assert.equal(partialRecords[0].isFastest, false);
assert.deepEqual(buildLapRecords([], new Map(), []), []);
const partialPack = buildStintPack("test", 1, [{ driverNumber: 4, driverCode: "NOR", team: "Test" }], partialStints, partialRecords.map(lap => ({ ...lap, driverCode: "NOR" })));
assert.equal(partialPack.drivers[0].stints.length, 1);
assert.equal(partialPack.drivers[0].stints[0].averageLapTime, null);
assert.equal(partialPack.drivers[0].stints[0].trendPerLap, null);
assert.equal(StintPackSchema.safeParse(partialPack).success, true);

assert.deepEqual([...groupByDriverNumber([
  { driver_number: 81, date: "later" },
  { driver_number: 4, date: "first" },
  { driver_number: "4", date: "second" },
  { driver_number: null, date: "ignored" },
])], [
  [81, [{ driver_number: 81, date: "later" }]],
  [4, [
    { driver_number: 4, date: "first" },
    { driver_number: "4", date: "second" },
  ]],
]);

const recordedStints = [
  { driver_number: 1, stint_number: 4, lap_start: 4, lap_end: 34, compound: "INTERMEDIATE", tyre_age_at_start: 0 },
  { driver_number: 1, stint_number: 5, lap_start: 34, lap_end: 46, compound: "MEDIUM", tyre_age_at_start: 0 },
];
const recordedLaps = [
  [31, 88.127],
  [32, 88.208],
  [33, 88.046],
  [34, 128.598],
  [35, 124.508],
  [36, 116.334],
].map(([lap_number, lap_duration]) => ({ driver_number: 1, lap_number, lap_duration }));
const drivers = [{ driverNumber: 1, driverCode: "VER", team: "Red Bull Racing" }];
const originalStints = structuredClone(recordedStints);
const normalizedStints = normalizeStints(recordedStints);
assert.deepEqual(normalizedStints, [
  { ...recordedStints[0], lap_end: 33 },
  recordedStints[1],
]);
const sessionLaps = buildLapRecords(recordedLaps, new Map(), normalizedStints)
  .map((lap) => ({ ...lap, driverCode: "VER" }));
const stintPack = buildStintPack("melbourne", 9693, drivers, normalizedStints, sessionLaps);
assert.deepEqual(stintPack.drivers, [{
  driverCode: "VER",
  team: "Red Bull Racing",
  stints: [
    { stintNumber: 4, compound: "INTERMEDIATE", lapStart: 4, lapEnd: 33, tyreAgeAtStart: 0, averageLapTime: 88.127, trendPerLap: -0.04, lapTimes: [88.127, 88.208, 88.046] },
    { stintNumber: 5, compound: "MEDIUM", lapStart: 34, lapEnd: 46, tyreAgeAtStart: 0, averageLapTime: 123.147, trendPerLap: -6.132, lapTimes: [128.598, 124.508, 116.334] },
  ],
}]);
for (const lap of sessionLaps) {
  const owners = stintPack.drivers[0].stints.filter((stint) => lap.lapNumber >= stint.lapStart && lap.lapNumber <= stint.lapEnd);
  assert.equal(owners.length, 1, `VER lap ${lap.lapNumber} must have exactly one owner`);
  assert.equal(lap.stint, owners[0].stintNumber);
  assert.equal(lap.compound, owners[0].compound);
}
assert.equal(stintPack.drivers[0].stints.flatMap((stint) => stint.lapTimes).filter((time) => time === 128.598).length, 1);
const replayTimeline = buildStintTimelines(recordedStints);
const replayLaps = enrichReplayLapsWithStints(recordedLaps.map((lap) => ({
  driverCode: "VER",
  lapNumber: lap.lap_number,
  lapTime: lap.lap_duration,
  compound: null,
})), drivers, replayTimeline);
assert.equal(replayLaps.find((lap) => lap.lapNumber === 34).compound, "MEDIUM", "Recorded VER lap 34 must belong to the later Replay stint");
assert.deepEqual(replayLaps.map((lap) => [lap.lapNumber, lap.compound, lap.stintNumber]),
  sessionLaps.map((lap) => [lap.lapNumber, lap.compound, lap.stint]));
assert.deepEqual(replayTimeline.get(1), stintPack.drivers[0].stints.map(({ stintNumber, lapStart, lapEnd, compound, tyreAgeAtStart }) => ({ stintNumber, lapStart, lapEnd, compound, tyreAgeAtStart })));
assert.deepEqual(recordedStints, originalStints);
assert.deepEqual(buildStintTimelines([...recordedStints].reverse()), replayTimeline);
assert.deepEqual(buildStintTimelines(normalizedStints), replayTimeline);
for (const lapEnd of [35, 36]) {
  const overlapping = [{ ...recordedStints[0], lap_end: lapEnd }, recordedStints[1]];
  assert.throws(() => normalizeStints(overlapping), /Driver 1 has overlapping stint ranges/);
  assert.throws(() => buildStintTimelines(overlapping), /Driver 1 has overlapping stint ranges/);
}
const recordedUsedTyres = [{ driver_number: 1, stint_number: 2, lap_start: 2, lap_end: 3, compound: "INTERMEDIATE", tyre_age_at_start: 2 }];
assert.equal(normalizeStints(recordedUsedTyres)[0].tyre_age_at_start, 2);
assert.equal(buildStintTimelines(recordedUsedTyres).get(1)[0].tyreAgeAtStart, 2);

process.stdout.write("OpenF1 session pack normalization tests passed.\n");
