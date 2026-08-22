import assert from "node:assert/strict";
import { generationTimestamp, normalizeTimestamp } from "../../normalize/src/normalize-session.mjs";
import { groupByDriverNumber } from "./build-openf1-replay-pack.mjs";
import { normalizeResults, normalizeStints, normalizeWeather } from "./build-openf1-session-pack.mjs";

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

process.stdout.write("OpenF1 session pack normalization tests passed.\n");
