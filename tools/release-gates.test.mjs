import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { localizeModelViewerFallbacks } from "./build-static.mjs";
import {
  allowedNetworkOrigins,
  assertResponseHeaderPolicy,
  auditEvidence,
  fulfillLocalArtifact,
  createSecretScanner,
  evidenceFileName,
  headerPolicyFromText,
  isAnalyticsRequest,
  loadNetlifyDeployMetadata,
  localServer,
  netlifyCliArgs,
  netlifySiteId,
  normalizeCacheControl,
  normalizeContentType,
  parseCommand,
  releaseRedirects,
  runEvidenceGate,
  safeRemotePath,
  selectCriticalSamples,
  validateDeployMetadata,
  validateRedirectTarget,
  validateTargetUrl,
} from "./release-gates.mjs";

const deployId = "6a62d1baea5f475a562d2f46";
const deployPermalink = `https://${deployId}--f1-demo.netlify.app`;
assert.equal(validateTargetUrl("https://f1-demo.netlify.app"), "https://f1-demo.netlify.app");
assert.equal(validateTargetUrl("https://build-123--f1-demo.netlify.app/"), "https://build-123--f1-demo.netlify.app");
assert.equal(validateTargetUrl(`${deployPermalink}/`, { immutable: true }), deployPermalink);
for (const value of ["http://f1-demo.netlify.app", "https://user@f1-demo.netlify.app", "https://f1-demo.netlify.app/?x=1", "https://f1-demo.netlify.app/path", "https://example.com"]) {
  assert.throws(() => validateTargetUrl(value), /Release URL/);
}
for (const value of ["https://f1-demo.netlify.app", "https://build-123--f1-demo.netlify.app", `https://${"g".repeat(24)}--f1-demo.netlify.app`]) {
  assert.throws(() => validateTargetUrl(value, { immutable: true }), /Deploy permalink/);
}
assert.equal(normalizeContentType("Application/JSON; charset=utf-8"), "application/json");
assert.equal(normalizeCacheControl("immutable, Public, max-age=31536000"), "immutable, max-age=31536000, public");

const headerText = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' blob: https://f1-api.129.150.58.64.sslip.io wss://f1-api.129.150.58.64.sslip.io; worker-src 'self' blob:; child-src 'self' blob:
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), fullscreen=(self), xr-spatial-tracking=(self)

/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/data/manifests/*
  Cache-Control: public, max-age=60

/data/packs/*
  Cache-Control: public, max-age=300

/data/silhouettes/*
  Cache-Control: public, max-age=300

/models/*
  Cache-Control: public, max-age=86400

/posters/*
  Cache-Control: public, max-age=86400
`;
const headerPolicy = headerPolicyFromText(headerText);
assert.deepEqual([...allowedNetworkOrigins(headerPolicy.security["content-security-policy"])].sort(), ["https://f1-api.129.150.58.64.sslip.io", "wss://f1-api.129.150.58.64.sslip.io"]);
assertResponseHeaderPolicy({
  "content-security-policy": headerPolicy.security["content-security-policy"],
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": headerPolicy.security["permissions-policy"],
  "cache-control": "public, max-age=60",
}, headerPolicy, "/data/manifests/latest.json");
assert.throws(() => headerPolicyFromText(headerText.replace("X-Frame-Options: SAMEORIGIN", "X-Frame-Options: DENY")), /exact x-frame-options/);
assert.throws(() => headerPolicyFromText(headerText.replace("/*\n", "/*\n  Cache-Control: no-cache\n")), /default static Cache-Control/);
assert.throws(() => headerPolicyFromText(headerText.replace(/\/\*[\s\S]+?(?=\n\/_next)/, "").concat(headerText.slice(0, headerText.indexOf("\n/_next")))), /must follow/);
assert.throws(() => assertResponseHeaderPolicy({ "cache-control": "no-cache" }, headerPolicy, "/"), /content-security-policy/);
assert.throws(() => assertResponseHeaderPolicy({
  "content-security-policy": headerPolicy.security["content-security-policy"],
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": headerPolicy.security["permissions-policy"],
  "cache-control": "no-cache",
}, headerPolicy, "/data/manifests/latest.json"), /Cache-Control/);

const scanner = createSecretScanner();
assert.equal(scanner.scan("prefix AKIA12345678"), null);
assert.match(scanner.scan("90ABCDEF suffix"), /AKIA/);
assert.equal(createSecretScanner().scan("Driver telemetry remains available in the replay."), null);
assert.match(createSecretScanner().scan("navigator.sendBeacon('/capture', payload)"), /sendBeacon/);
assert.match(createSecretScanner().scan("window.dataLayer = []"), /dataLayer/);
assert.equal(isAnalyticsRequest("https://example.com/api/analytics"), true);
assert.equal(isAnalyticsRequest("https://example.com/data/manifests/latest.json"), false);
assert.notEqual(evidenceFileName("chromium", { width: 390, height: 844 }, "/replay/?tab=compare"), evidenceFileName("chromium", { width: 390, height: 844 }, "/replay/?tab=stints"));
assert.throws(() => safeRemotePath("/../secret"), /Unsafe remote path/);
assert.throws(() => safeRemotePath("/data\\secret"), /Unsafe remote path/);
assert.equal(safeRemotePath("/data/manifests/latest.json"), "/data/manifests/latest.json");

const manifest = {
  entries: [
    { path: "index.html", bytes: 1 },
    { path: "replay/index.html", bytes: 1 },
    { path: "replay/2026/test-grand-prix/race/index.html", bytes: 1 },
    { path: "data/manifests/latest.json", bytes: 1 },
    { path: "data/manifests/seasons.json", bytes: 1 },
    { path: "data/packs/seasons/2026/test-grand-prix/race/replay.meta.json", bytes: 1 },
    { path: "data/packs/seasons/2026/test-grand-prix/race/replay.laps.json", bytes: 1 },
    { path: "data/packs/seasons/2026/test-grand-prix/race/replay.race-control.json", bytes: 1 },
    { path: "data/packs/seasons/2026/test-grand-prix/race/replay.frames/chunk-000.json", bytes: 1 },
    { path: "_next/static/a.js", bytes: 1 },
    { path: "_next/static/a.css", bytes: 1 },
    { path: "_next/static/replay.js", bytes: 1 },
    { path: "models/small.glb", bytes: 10 },
    { path: "models/large.glb", bytes: 20 },
    { path: "models/largest.glb", bytes: 30 },
  ],
};
const sample = selectCriticalSamples(manifest, '<script src="/_next/static/a.js"></script><link href="/_next/static/a.css">', {
  latest: { path: "/sessions/2026/test-grand-prix/race" },
}, '<script src="/_next/static/replay.js"></script>');
assert.deepEqual(sample, [
  "_next/static/a.css",
  "_next/static/a.js",
  "_next/static/replay.js",
  "data/manifests/latest.json",
  "data/manifests/seasons.json",
  "data/packs/seasons/2026/test-grand-prix/race/replay.frames/chunk-000.json",
  "data/packs/seasons/2026/test-grand-prix/race/replay.laps.json",
  "data/packs/seasons/2026/test-grand-prix/race/replay.meta.json",
  "data/packs/seasons/2026/test-grand-prix/race/replay.race-control.json",
  "index.html",
  "models/large.glb",
  "models/largest.glb",
  "replay/2026/test-grand-prix/race/index.html",
  "replay/index.html",
]);
assert.equal(validateRedirectTarget("/replay?proof=1", "/replay", "https://f1-demo.netlify.app").search, "?proof=1");
assert.throws(() => validateRedirectTarget("https://example.com/replay", "/replay", "https://f1-demo.netlify.app"), /Unexpected redirect/);
assert.throws(() => validateRedirectTarget("/other?proof=1", "/replay", "https://f1-demo.netlify.app"), /Unexpected redirect/);
assert.deepEqual(releaseRedirects({ latest: null }), [["/live", "/race-desk"], ["/sessions", "/replay"]]);
assert.deepEqual(releaseRedirects({ latest: { path: "/sessions/2026/test-grand-prix/race" } }), [
  ["/live", "/race-desk"],
  ["/sessions", "/replay"],
  ["/sessions/2026/test-grand-prix/race", "/replay/2026/test-grand-prix/race"],
]);
const productionMetadata = {
  id: deployId,
  site_id: netlifySiteId,
  state: "ready",
  context: "production",
  published_at: "2026-07-24T02:50:31.367Z",
  deploy_ssl_url: deployPermalink,
  ssl_url: "https://f1-demo.netlify.app",
  links: { permalink: deployPermalink, alias: "https://f1-demo.netlify.app" },
  skew_protection_token: "must-not-be-recorded",
};
assert.deepEqual(validateDeployMetadata(productionMetadata, "https://f1-demo.netlify.app", deployPermalink), {
  deployId,
  siteId: netlifySiteId,
  state: "ready",
  context: "production",
  draft: null,
  deployPermalink,
  canonicalAlias: "https://f1-demo.netlify.app",
  publishedAt: "2026-07-24T02:50:31.367Z",
});
assert.deepEqual(validateDeployMetadata({ ...productionMetadata, context: "deploy-preview", published_at: null }, deployPermalink, deployPermalink), {
  deployId,
  siteId: netlifySiteId,
  state: "ready",
  context: "deploy-preview",
  draft: null,
  deployPermalink,
  canonicalAlias: null,
  publishedAt: null,
});
assert.throws(() => validateDeployMetadata({ ...productionMetadata, draft: false }, deployPermalink, deployPermalink), /does not identify a draft/);
assert.throws(() => validateDeployMetadata({ ...productionMetadata, draft: true }, deployPermalink, deployPermalink), /already published/);
for (const [change, pattern] of [
  [{ id: "a".repeat(24) }, /ID does not match/],
  [{ site_id: "wrong-site" }, /wrong site/],
  [{ state: "building" }, /not ready/],
  [{ deploy_ssl_url: `https://${"b".repeat(24)}--f1-demo.netlify.app`, links: {} }, /permalink does not match/],
  [{ context: "deploy-preview" }, /not production context/],
  [{ published_at: null }, /lacks published_at/],
  [{ links: { permalink: deployPermalink, alias: "https://build-123--f1-demo.netlify.app" } }, /production alias/],
]) {
  assert.throws(() => validateDeployMetadata({ ...productionMetadata, ...change }, "https://f1-demo.netlify.app", deployPermalink), pattern);
}
let metadataArgs;
assert.deepEqual(await loadNetlifyDeployMetadata(deployPermalink, async (args) => {
  metadataArgs = args;
  return JSON.stringify(productionMetadata);
}), productionMetadata);
assert.deepEqual(metadataArgs, ["api", "getDeploy", "--data", JSON.stringify({ deploy_id: deployId })]);
assert.deepEqual(netlifyCliArgs(metadataArgs), ["--yes", "netlify@27.1.2", ...metadataArgs]);
await assert.rejects(() => loadNetlifyDeployMetadata(deployPermalink, async () => "not-json"), /not JSON/);
await assert.rejects(() => loadNetlifyDeployMetadata(deployPermalink, async () => "[]"), /response is invalid/);
assert.deepEqual(parseCommand(["security"]), { gate: "security", target: null, deployPermalink: null });
assert.deepEqual(parseCommand(["parity", "https://f1-demo.netlify.app", "--deploy-permalink", deployPermalink]), {
  gate: "parity",
  target: "https://f1-demo.netlify.app",
  deployPermalink,
});
assert.throws(() => parseCommand(["parity"]), /requires one positional URL/);
assert.throws(() => parseCommand(["browser", "https://f1-demo.netlify.app", "extra"]), /requires zero or one positional URL/);
assert.throws(() => parseCommand(["parity", "https://f1-demo.netlify.app", "--deploy-permalink"]), /Missing value/);

const root = await mkdtemp(path.join(os.tmpdir(), "release-gates-test-"));
try {
  const chunks = path.join(root, "_next", "static", "chunks");
  const fallbackChunk = path.join(chunks, "model-viewer.js");
  await mkdir(chunks, { recursive: true });
  await writeFile(fallbackChunk, [
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
    "https://www.gstatic.com/basis-universal/versioned/2021-04-15-ba1c3e4/",
    "https://cdn.jsdelivr.net/npm/three@0.149.0/examples/jsm/loaders/LottieLoader.js",
  ].join("\n"), "utf8");
  await localizeModelViewerFallbacks(root);
  assert.equal(await readFile(fallbackChunk, "utf8"), "/draco/\n/basis/\n/lottie/LottieLoader.js");
  await writeFile(fallbackChunk, "dependency drift", "utf8");
  await assert.rejects(localizeModelViewerFallbacks(root), /Missing model-viewer fallback/);

  const headFixture = path.join(root, "head-fixture.txt");
  await writeFile(headFixture, "fixture", "utf8");
  const local = await localServer(root);
  try {
    const headResponse = await fetch(`${local.url}/head-fixture.txt`, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("content-length"), "7");
    assert.equal((await headResponse.arrayBuffer()).byteLength, 0);
  } finally {
    await new Promise((resolve, reject) => local.server.close((error) => error ? reject(error) : resolve()));
  }
  const fulfilled = [];
  const route = (url, method = "GET") => ({
    request: () => ({ url: () => url, method: () => method }),
    fulfill: async (response) => fulfilled.push(response),
  });
  await fulfillLocalArtifact(route("http://f1.test/head-fixture.txt"), root);
  assert.equal(fulfilled.at(-1).status, 200);
  assert.equal(fulfilled.at(-1).body.toString(), "fixture");
  await fulfillLocalArtifact(route("http://f1.test/head-fixture.txt", "HEAD"), root);
  assert.equal(fulfilled.at(-1).headers["Content-Length"], "7");
  assert.equal(fulfilled.at(-1).body, undefined);
  await fulfillLocalArtifact(route("http://f1.test/missing.txt"), root);
  assert.equal(fulfilled.at(-1).status, 404);

  const paths = { root };
  const releaseId = `sha256-${"a".repeat(64)}`;
  const manifestSha256 = "b".repeat(64);
  const evidenceManifest = { releaseId, manifestSha256 };
  const passed = await runEvidenceGate(paths, "passing", evidenceManifest, { target: "local" }, async (directory, report) => {
    report.result = "verified";
    await writeFile(path.join(directory, "detail.txt"), "fixture", "utf8");
  });
  assert.equal(passed.status, "passed");
  assert.equal((await auditEvidence(passed.evidence)).releaseId, releaseId);
  assert.equal(await readFile(path.join(passed.evidence, "detail.txt"), "utf8"), "fixture");
  let failed;
  try {
    await runEvidenceGate(paths, "failing", evidenceManifest, {}, async (directory, report) => {
      report.partial = "retained";
      await writeFile(path.join(directory, "partial.txt"), "diagnostic", "utf8");
      throw new Error("expected gate failure");
    });
    assert.fail("Expected runEvidenceGate to reject.");
  } catch (error) {
    failed = error;
  }
  assert.match(failed.message, /expected gate failure/);
  assert.equal((await auditEvidence(failed.evidence)).releaseId, releaseId);
  const failedReport = JSON.parse(await readFile(path.join(failed.evidence, "report.json"), "utf8"));
  assert.equal(failedReport.status, "failed");
  assert.equal(failedReport.partial, "retained");
  assert.equal(failedReport.error.message, "expected gate failure");
  assert.deepEqual(await readdir(path.join(root, "evidence", ".staging")), []);
} finally {
  await rm(root, { recursive: true, force: true });
}

process.stdout.write("release-gates tests passed\n");
