import assert from "node:assert/strict";
import { buildPayloads } from "./refresh-seasons-index.mjs";

const race = (overrides) => ({
  season: 2025,
  grandPrixSlug: "alpha-grand-prix",
  sessionSlug: "race",
  grandPrixName: "Alpha Grand Prix",
  sessionName: "Race",
  sessionKey: 100,
  trackId: "alpha",
  path: "/sessions/2025/alpha-grand-prix/race",
  startDate: "2025-05-01T12:00:00Z",
  ...overrides,
});

const sessions = [
  race({ grandPrixSlug: "zulu-grand-prix", grandPrixName: "Zulu Grand Prix", sessionKey: 300, path: "/sessions/2026/zulu-grand-prix/race", season: 2026, startDate: "2026-05-01T12:00:00Z" }),
  race({ grandPrixSlug: "alpha-grand-prix", grandPrixName: "Alpha Grand Prix", sessionKey: 200, path: "/sessions/2026/alpha-grand-prix/race", season: 2026, startDate: "2026-05-01T12:00:00Z" }),
  race({ grandPrixSlug: "future-grand-prix", grandPrixName: "Future Grand Prix", sessionSlug: "qualifying", sessionKey: 400, path: "/sessions/2027/future-grand-prix/qualifying", season: 2027, startDate: "2027-05-01T12:00:00Z" }),
];

const payloads = buildPayloads(sessions);
assert.equal(payloads.latest.latest.path, "/sessions/2026/zulu-grand-prix/race");
assert.equal(payloads.seasons.generatedAt, "2027-05-01T12:00:00.000Z");
assert.deepEqual(payloads.latest.seasons, [2027, 2026]);

const lexicalPayloads = buildPayloads([
  race({ grandPrixSlug: "zulu-grand-prix", grandPrixName: "Zulu Grand Prix", sessionKey: 300, path: "/sessions/2026/zulu-grand-prix/race", season: 2026, startDate: "2026-05-01T12:00:00Z" }),
  race({ grandPrixSlug: "alpha-grand-prix", grandPrixName: "Alpha Grand Prix", sessionKey: 300, path: "/sessions/2026/alpha-grand-prix/race", season: 2026, startDate: "2026-05-01T12:00:00Z" }),
]);
assert.equal(lexicalPayloads.latest.latest.path, "/sessions/2026/alpha-grand-prix/race");

const datePayloads = buildPayloads([
  race({ grandPrixSlug: "newer-grand-prix", grandPrixName: "Newer Grand Prix", sessionKey: 100, path: "/sessions/2026/newer-grand-prix/race", season: 2026, startDate: "2026-05-02T12:00:00Z" }),
  race({ grandPrixSlug: "older-grand-prix", grandPrixName: "Older Grand Prix", sessionKey: 999, path: "/sessions/2026/older-grand-prix/race", season: 2026, startDate: "2026-05-01T12:00:00Z" }),
]);
assert.equal(datePayloads.latest.latest.path, "/sessions/2026/newer-grand-prix/race");
