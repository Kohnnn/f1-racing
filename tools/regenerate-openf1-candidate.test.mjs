import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertApprovedRights, createRegenerationPlan, terminalEvidence } from "./regenerate-openf1-candidate.mjs";
import { candidatesRoot, workspaceRoot } from "./release-data.mjs";

const index = JSON.parse(await readFile(path.join(workspaceRoot, "data", "manifests", "seasons.json"), "utf8"));
const years = [...new Set(index.seasons.flatMap((season) => season.grandsPrix.flatMap((grandPrix) => grandPrix.sessions.map((session) => session.season))))].sort();
const manifests = await Promise.all(years.map(async (year) => JSON.parse(await readFile(path.join(workspaceRoot, "data", "manifests", `openf1-${year}-season.json`), "utf8"))));
const plan = createRegenerationPlan(index, manifests);

assert.equal(plan.sessions.length, 81);
assert.deepEqual(plan.endpointNames, [
  "drivers",
  "laps",
  "weather",
  "session_result",
  "stints",
  "position",
  "location",
  "car_data",
  "race_control",
]);
assert.equal(plan.requestCount, 729);
assert.equal(new Set(plan.sessions.map((session) => session.path)).size, 81);
assert.equal(new Set(plan.sessions.map((session) => session.sessionKey)).size, 81);
assert.equal(assertApprovedRights({ "rights-status": "approved", "rights-reference": "operator-approval-123" }), "operator-approval-123");
assert.throws(() => assertApprovedRights({ "rights-reference": "operator-approval-123" }), /rights-status approved/);
assert.throws(() => assertApprovedRights({ "rights-status": "approved", "rights-reference": " " }), /rights-reference/);

const metadata = { retrievedAt: "2026-07-01T01:05:00.000Z" };
const evidence = new Map([
  ["drivers", { metadata, payload: [{ driver_number: 4 }, { driver_number: 81 }] }],
  ["laps", { metadata, payload: [{ driver_number: 4, date_start: "2026-07-01T00:01:00Z" }, { driver_number: 81, date_start: "2026-07-01T00:02:00Z" }] }],
  ["weather", { metadata, payload: [{ date: "2026-07-01T00:03:00Z" }] }],
  ["session_result", { metadata, payload: [{ driver_number: 4 }, { driver_number: 81 }] }],
  ["stints", { metadata, payload: [{ driver_number: 4 }, { driver_number: 81 }] }],
  ["position", { metadata, payload: [{ driver_number: 4, date: "2026-07-01T00:04:00Z" }, { driver_number: 81, date: "2026-07-01T00:05:00Z" }] }],
  ["location", { metadata, payload: [{ driver_number: 4, date: "2026-07-01T00:06:00Z" }, { driver_number: 81, date: "2026-07-01T00:07:00Z" }] }],
  ["car_data", { metadata, payload: [{ driver_number: 4, date: "2026-07-01T00:08:00Z" }, { driver_number: 81, date: "2026-07-01T00:09:00Z" }] }],
  ["race_control", { metadata, payload: [{ date: "2026-07-01T00:59:00Z", flag: "CHEQUERED", message: "SESSION FINISHED" }] }],
]);
const sourceSession = {
  path: "/sessions/2026/test-grand-prix/race",
  sessionSlug: "race",
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-07-01T01:00:00.000Z",
};
assert.deepEqual(terminalEvidence(sourceSession, evidence), {
  eligible: true,
  observedAt: metadata.retrievedAt,
  observedStartAt: "2026-07-01T00:01:00.000Z",
  observedEndAt: "2026-07-01T00:59:00.000Z",
});
const incompleteEvidence = new Map(evidence);
incompleteEvidence.set("location", { metadata, payload: [{ driver_number: 4, date: "2026-07-01T00:06:00Z" }] });
assert.match(terminalEvidence(sourceSession, incompleteEvidence).reason, /incomplete driver coverage: location/);

async function candidateNames() {
  try {
    return (await readdir(candidatesRoot)).sort();
  } catch {
    return [];
  }
}

const beforeCandidates = await candidateNames();
const script = fileURLToPath(new URL("./regenerate-openf1-candidate.mjs", import.meta.url));
function runCli(args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, F1_OPENF1_CACHE_ONLY: "1" };
    delete env.F1_CANDIDATE_ROOT;
    const child = spawn(process.execPath, [script, ...args], { cwd: workspaceRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}
const dryRun = await runCli(["--dry-run"]);
assert.equal(dryRun.code, 0, dryRun.stderr);
assert.deepEqual(JSON.parse(dryRun.stdout), { sessions: 81, endpoints: plan.endpointNames, requests: 729 });
const denied = await runCli([]);
assert.notEqual(denied.code, 0);
assert.match(denied.stderr, /rights-status approved/);
assert.deepEqual(await candidateNames(), beforeCandidates);

process.stdout.write("OpenF1 candidate regeneration plan tests passed.\n");
