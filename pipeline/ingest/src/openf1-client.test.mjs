import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { candidatesRoot } from "../../../tools/release-data.mjs";
import { openF1Fetch, readOpenF1Evidence } from "./openf1-client.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "openf1-client-test-"));
await mkdir(candidatesRoot, { recursive: true });
const candidateRoot = await mkdtemp(path.join(candidatesRoot, "openf1-client-test-"));
const cacheRoot = path.join(candidateRoot, "private", "openf1-responses");
const originalCandidateRoot = process.env.F1_CANDIDATE_ROOT;
const body = Buffer.from('[{"driver_number":4}]\n', "utf8");
let fetchCount = 0;

try {
  await writeFile(path.join(candidateRoot, ".f1-release-candidate.json"), '{"schemaVersion":1,"kind":"f1-release-candidate"}\n', "utf8");
  process.env.F1_CANDIDATE_ROOT = candidateRoot;

  const result = await openF1Fetch("drivers", { session_key: 123 }, {
    cacheRoot,
    fetch: async () => {
      fetchCount += 1;
      return new Response(body, { status: 200, statusText: "OK" });
    },
    now: () => new Date("2026-08-22T12:34:56.789Z"),
  });
  assert.deepEqual(result, [{ driver_number: 4 }]);
  assert.equal(fetchCount, 1);

  const key = createHash("sha256").update("https://api.openf1.org/v1/drivers?session_key=123").digest("hex");
  const entryRoot = path.join(cacheRoot, key);
  const cachedBody = await readFile(path.join(entryRoot, "response.body"));
  const metadata = JSON.parse(await readFile(path.join(entryRoot, "metadata.json"), "utf8"));
  assert.deepEqual(cachedBody, body);
  assert.deepEqual(metadata, {
    schemaVersion: 1,
    provider: "openf1",
    identifier: "https://api.openf1.org/v1/drivers?session_key=123",
    retrievedAt: "2026-08-22T12:34:56.789Z",
    responseSha256: createHash("sha256").update(body).digest("hex"),
    bytes: body.length,
    status: 200,
    statusText: "OK",
  });
  assert.deepEqual(await readOpenF1Evidence("drivers", { session_key: 123 }, { cacheRoot }), {
    metadata,
    payload: result,
  });
  await assert.rejects(() => openF1Fetch("drivers", { session_key: 999 }, {
    cacheRoot,
    cacheOnly: true,
    fetch: async () => {
      throw new Error("network invoked");
    },
  }), /Missing OpenF1 response cache entry/);

  assert.deepEqual(await openF1Fetch("drivers", { session_key: 123 }, {
    cacheRoot,
    fetch: async () => {
      throw new Error("cache miss");
    },
  }), result);
  assert.equal(fetchCount, 1);

  const automaticResult = await openF1Fetch("drivers", { session_key: 124 }, {
    fetch: async () => new Response('[{"driver_number":44}]\n', { status: 200, statusText: "OK" }),
  });
  assert.deepEqual(automaticResult, [{ driver_number: 44 }]);
  const automaticKey = createHash("sha256").update("https://api.openf1.org/v1/drivers?session_key=124").digest("hex");
  assert.equal(JSON.parse(await readFile(path.join(cacheRoot, automaticKey, "metadata.json"), "utf8")).status, 200);

  const concurrentParams = { session_key: 125 };
  const concurrentResults = await Promise.all([
    openF1Fetch("drivers", concurrentParams, { fetch: async () => new Response('[{"driver_number":1}]\n', { status: 200, statusText: "OK" }) }),
    openF1Fetch("drivers", concurrentParams, { fetch: async () => new Response('[{"driver_number":2}]\n', { status: 200, statusText: "OK" }) }),
  ]);
  assert.deepEqual(concurrentResults[0], concurrentResults[1]);

  const emptyParams = { session_key: 404 };
  const emptyKey = createHash("sha256").update("https://api.openf1.org/v1/drivers?session_key=404").digest("hex");
  assert.deepEqual(await openF1Fetch("drivers", emptyParams, {
    cacheRoot,
    fetch: async () => new Response('{"detail":"No results found"}\n', { status: 404, statusText: "Not Found" }),
  }), []);
  assert.deepEqual(await openF1Fetch("drivers", emptyParams, {
    cacheRoot,
    fetch: async () => {
      throw new Error("cache miss");
    },
  }), []);
  assert.equal(JSON.parse(await readFile(path.join(cacheRoot, emptyKey, "metadata.json"), "utf8")).status, 404);

  const waits = [];
  let retryCount = 0;
  assert.deepEqual(await openF1Fetch("laps", { session_key: 429 }, {
    fetch: async () => {
      retryCount += 1;
      return retryCount === 1
        ? new Response('{"detail":"rate limited"}\n', { status: 429, statusText: "Too Many Requests" })
        : new Response("[]\n", { status: 200, statusText: "OK" });
    },
    sleep: async (delay) => waits.push(delay),
  }), []);
  assert.deepEqual(waits, [12000]);
  await assert.rejects(() => openF1Fetch("laps", { session_key: 500 }, {
    fetch: async () => new Response("not-json", { status: 500, statusText: "Server Error" }),
  }), /invalid JSON/);

  await writeFile(path.join(entryRoot, "response.body"), "[]\n", "utf8");
  await assert.rejects(() => openF1Fetch("drivers", { session_key: 123 }, { cacheRoot }), /Invalid OpenF1 response cache entry/);
  await rm(path.join(entryRoot, "response.body"));
  await assert.rejects(() => openF1Fetch("drivers", { session_key: 123 }, { cacheRoot }), /Incomplete OpenF1 response cache entry/);
  const symlinkTarget = path.join(root, "outside-body.json");
  await writeFile(symlinkTarget, body);
  await symlink(symlinkTarget, path.join(entryRoot, "response.body"), process.platform === "win32" ? "file" : undefined);
  await assert.rejects(() => openF1Fetch("drivers", { session_key: 123 }, { cacheRoot }), /Unsafe OpenF1 response cache entry/);
  const emptyEntryKey = createHash("sha256").update("https://api.openf1.org/v1/drivers?session_key=126").digest("hex");
  await mkdir(path.join(cacheRoot, emptyEntryKey));
  await assert.rejects(() => openF1Fetch("drivers", { session_key: 126 }, { cacheRoot }), /Incomplete OpenF1 response cache entry/);
  await assert.rejects(() => openF1Fetch("drivers", {}, { cacheRoot: root }), /inside F1_CANDIDATE_ROOT\/private/);
  await assert.rejects(() => openF1Fetch("drivers", {}, { cacheRoot: path.join(candidateRoot, "public", "responses") }), /inside F1_CANDIDATE_ROOT\/private/);
  delete process.env.F1_CANDIDATE_ROOT;
  await assert.rejects(() => openF1Fetch("drivers", {}, { cacheRoot }), /Set F1_CANDIDATE_ROOT/);
} finally {
  if (originalCandidateRoot === undefined) delete process.env.F1_CANDIDATE_ROOT;
  else process.env.F1_CANDIDATE_ROOT = originalCandidateRoot;
  await Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(candidateRoot, { recursive: true, force: true }),
  ]);
}

process.stdout.write("OpenF1 response cache tests passed.\n");
