import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = process.env.F1_CANDIDATE_ROOT ? path.resolve(process.env.F1_CANDIDATE_ROOT) : null;
const outRoot = candidateRoot
  ? path.join(candidateRoot, "apps", "web", "out")
  : path.join(root, "apps", "web", "out");
const publicRoot = candidateRoot ? outRoot : path.join(root, "apps", "web", "public");
const replay3dAssetPaths = [
  "/replay-3d/formula-car.glb",
  "/replay-3d/kloofendal-pure-sky-1k.hdr",
  "/replay-3d/asphalt-color.webp",
  "/replay-3d/asphalt-normal.webp",
  "/replay-3d/asphalt-roughness.webp",
  "/replay-3d/props/barrierWall.glb",
  "/replay-3d/props/fenceStraight.glb",
  "/replay-3d/props/grandStandCovered.glb",
  "/replay-3d/props/lightPostLarge.glb",
  "/replay-3d/props/overhead.glb",
  "/replay-3d/props/pitsGarage.glb",
  "/replay-3d/props/pitsOffice.glb",
  "/replay-3d/props/pylon.glb",
  "/replay-3d/props/tent.glb",
  "/replay-3d/props/treeLarge.glb",
];

async function findFile(directory, predicate) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const result = await findFile(filePath, predicate);
      if (result) return result;
    } else if (await predicate(filePath)) {
      return filePath;
    }
  }
  return null;
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".glb")) return "model/gltf-binary";
  return "application/octet-stream";
}

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  const requestedPath = path.resolve(outRoot, `.${pathname}`);
  if (!requestedPath.startsWith(`${outRoot}${path.sep}`) && requestedPath !== outRoot) {
    return null;
  }
  return requestedPath;
}

async function serveFile(requestUrl, response) {
  let filePath;
  try {
    filePath = resolveRequestPath(requestUrl);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (!filePath) {
    response.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, "index.html");
    const file = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType(filePath) }).end(file);
  } catch {
    response.writeHead(404).end();
  }
}

async function probe(baseUrl, requestPath) {
  const response = await fetch(`${baseUrl}${requestPath}`);
  assert.equal(response.status, 200, `${requestPath} returned ${response.status}`);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

await access(outRoot);
const liveRedirectOutput = await readFile(path.join(outRoot, "live", "index.html"), "utf-8");
assert.match(liveRedirectOutput, /race-desk/, "Static /live output does not redirect to /race-desk.");
const sessionsRedirectOutput = await readFile(path.join(outRoot, "sessions", "index.html"), "utf-8");
assert.match(sessionsRedirectOutput, /replay/, "Static /sessions output does not redirect to /replay.");
const seasonIndex = await readJson(path.join(publicRoot, "data", "manifests", "seasons.json"));
assert.ok(Array.isArray(seasonIndex?.seasons) && seasonIndex.seasons.every((season) => Array.isArray(season?.grandsPrix) && season.grandsPrix.every((grandPrix) => Array.isArray(grandPrix?.sessions))), "Season index must expose seasons[].grandsPrix[].sessions[].");
const legacySession = seasonIndex.seasons.flatMap((season) => season.grandsPrix.flatMap((grandPrix) => grandPrix.sessions))[0] ?? null;
const legacySessionPath = legacySession ? `${legacySession.season}/${legacySession.grandPrixSlug}/${legacySession.sessionSlug}` : null;
if (legacySessionPath) {
  const sessionDetailRedirectOutput = await readFile(path.join(outRoot, "sessions", legacySessionPath, "index.html"), "utf-8");
  assert.ok(sessionDetailRedirectOutput.includes(`/replay/${legacySessionPath}`), "Static session detail does not redirect to its matching Replay route.");
}
const sitemapOutput = await readFile(path.join(outRoot, "sitemap.xml"), "utf-8");
assert.doesNotMatch(sitemapOutput, /<loc>[^<]*\/sessions(?:\/|<)/, "Sitemap publishes legacy Sessions URLs.");
const homeOutput = await readFile(path.join(outRoot, "index.html"), "utf-8");
const privacyOutput = await readFile(path.join(outRoot, "privacy", "index.html"), "utf-8");
assert.match(homeOutput, /href="\/privacy"/, "Global footer does not link to /privacy.");
assert.match(privacyOutput, /Netlify Web Analytics/, "Privacy route does not disclose Netlify aggregate reports.");
assert.match(privacyOutput, /not measured/, "Privacy route does not disclose unmeasured outcomes.");
const analyticsClient = await findFile(outRoot, async (filePath) => {
  if (!/\.(?:html|js)$/.test(filePath)) return false;
  const source = await readFile(filePath, "utf-8");
  return /google-analytics\.com|googletagmanager\.com|plausible\.io|cdn\.segment\.com|app\.posthog\.com|clarity\.ms/i.test(source);
});
assert.equal(analyticsClient, null, `Static output includes an analytics client: ${analyticsClient}`);
const latestManifestPath = path.join(publicRoot, "data", "manifests", "latest.json");
const latestManifest = await readJson(latestManifestPath);
const latestReplayPath = latestManifest.latest?.path.replace(/^\/sessions\//, "/replay/") ?? null;
let latestReplayDataPaths = [];
if (latestManifest.latest) {
  const latestDataBasePath = latestManifest.latest.path.replace(/^\/sessions\//, "/data/packs/seasons/");
  const latestReplayMetaPath = `${latestDataBasePath}/replay.meta.json`;
  const latestReplayMetaFilePath = path.join(publicRoot, latestReplayMetaPath);
  latestReplayDataPaths = [latestReplayMetaPath];
  try {
    const latestReplayMeta = await readJson(latestReplayMetaFilePath);
    const chunkEntries = latestReplayMeta.frameChunkIndex ?? [];
    const chunkFrames = [];
    for (const entry of chunkEntries) {
      const chunk = await readJson(path.join(publicRoot, latestDataBasePath, entry.path));
      chunkFrames.push(...(chunk.frames ?? []));
    }
    const raceControl = await readJson(path.join(publicRoot, `${latestDataBasePath}/replay.race-control.json`));
    const stints = await readJson(path.join(publicRoot, `${latestDataBasePath}/stints.json`));
    const laps = await readJson(path.join(publicRoot, `${latestDataBasePath}/laps.json`));
    assert.equal(new Set(chunkFrames.map((frame) => frame.t)).size, latestReplayMeta.frameCount, "Featured replay chunks do not cover every published frame.");
    assert.ok(chunkFrames.at(-1)?.t >= latestReplayMeta.totalTime, "Featured replay chunks do not reach the published end time.");
    assert.ok(raceControl.some((message) => /chequered|checkered/i.test(`${message.flag ?? ""} ${message.message ?? ""}`)), "Featured replay lacks chequered-flag evidence.");
    assert.ok(stints.drivers?.some((driver) => driver.stints?.length > 1), "Featured replay lacks a recorded pit cycle.");
    assert.ok(Array.isArray(laps) && laps.length, "Featured replay lacks lap records.");
    assert.ok(chunkEntries.length, "Featured replay metadata has no frame chunks.");
    latestReplayDataPaths.push(...chunkEntries.map((entry) => `${latestDataBasePath}/${entry.path}`));
  } catch (error) {
    assert.fail(`Featured replay acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  for (const relativePath of ["index.html", path.join("replay", "index.html"), path.join("race-desk", "index.html")]) {
    const output = await readFile(path.join(outRoot, relativePath), "utf-8");
    assert.match(output, /No current featured race pack/i, `${relativePath} lacks the no-featured state.`);
  }
}
const replayMetaSource = await findFile(publicRoot, (filePath) => filePath.endsWith("replay.meta.json"));
const staleReplaySource = await findFile(publicRoot, (filePath) => filePath.endsWith("replay.json"));
const modelSource = await findFile(publicRoot, (filePath) => filePath.endsWith(".glb"));
const modelviewChunk = await findFile(path.join(outRoot, "_next", "static", "chunks"), async (filePath) => {
  if (!filePath.endsWith(".js")) return false;
  const source = await readFile(filePath, "utf-8");
  return source.includes("Retry 3D model") && source.includes("?retry=");
});
const replayShareChunk = await findFile(path.join(outRoot, "_next", "static", "chunks"), async (filePath) => {
  if (!filePath.endsWith(".js")) return false;
  return (await readFile(filePath, "utf-8")).includes("Copy evidence link");
});
const replayDebugChunk = await findFile(path.join(outRoot, "_next", "static", "chunks"), async (filePath) => {
  if (!filePath.endsWith(".js")) return false;
  const source = await readFile(filePath, "utf-8");
  return source.includes("raw frame JSON") && source.includes("active chunk");
});
const pitCycleChunk = await findFile(path.join(outRoot, "_next", "static", "chunks"), async (filePath) => {
  if (!filePath.endsWith(".js")) return false;
  return (await readFile(filePath, "utf-8")).includes("Pit-cycle outcomes");
});
const windTunnelChunk = await findFile(path.join(outRoot, "_next", "static", "chunks"), async (filePath) => {
  if (!filePath.endsWith(".js")) return false;
  const source = await readFile(filePath, "utf-8");
  return source.includes("GLB hull")
    && source.includes("SVG art")
    && source.includes("Floor \u0394")
    && source.includes("not validated CFD");
});
const replay3dChunk = await findFile(path.join(outRoot, "_next", "static", "chunks"), async (filePath) => {
  if (!filePath.endsWith(".js")) return false;
  const source = await readFile(filePath, "utf-8");
  return source.includes("REPLAY 3D")
    && source.includes("Director")
    && source.includes("Trackside")
    && source.includes("Helicopter")
    && source.includes("/replay-3d/formula-car.glb");
});
const replay3dBytes = (await Promise.all(replay3dAssetPaths.map(async (assetPath) => {
  const assetFile = path.join(publicRoot, assetPath.slice(1));
  await access(assetFile);
  return (await stat(assetFile)).size;
}))).reduce((total, size) => total + size, 0);
const attributionSource = await readFile(path.join(root, "docs", "art-attributions.md"), "utf-8");
for (const requiredAttribution of ["OpenGameArt", "Kenney", "ambientCG", "Poly Haven", "Creative Commons CC0 1.0"]) {
  assert.ok(attributionSource.includes(requiredAttribution), `Replay 3D attribution is missing ${requiredAttribution}.`);
}
assert.ok(replayMetaSource, "No replay metadata found in apps/web/public.");
assert.equal(staleReplaySource, null, "Static output retains forbidden replay.json.");
assert.ok(modelSource, "No GLB model found in apps/web/public.");
assert.ok(modelviewChunk, "Modelview retry control is missing from the static bundle.");
assert.ok(replayShareChunk, "Replay evidence-link control is missing from the static bundle.");
assert.ok(replayDebugChunk, "Replay raw frame inspector is missing from the static bundle.");
assert.ok(pitCycleChunk, "Replay pit-cycle control is missing from the static bundle.");
assert.ok(windTunnelChunk, "Wind-tunnel controls (mode switcher, Floor \u0394 chip, or CFD disclaimer) are missing from the static bundle.");
assert.ok(replay3dChunk, "Replay 3D controls or lazy scene chunk are missing from the static bundle.");
assert.ok(replay3dBytes <= 2_100_000, `Replay 3D assets exceed the 2.1 MB budget (${replay3dBytes} bytes).`);
const replayMetaPath = `/${path.relative(publicRoot, replayMetaSource).split(path.sep).join("/")}`;
const modelPath = `/${path.relative(publicRoot, modelSource).split(path.sep).join("/")}`;

const server = createServer((request, response) => {
  void serveFile(request.url || "/", response);
});

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string", "Static server did not bind to a port.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  for (const requestPath of [
    "/",
    "/cars/current-spec/",
    "/replay/",
    "/race-desk/",
    "/privacy/",
    "/sessions/",
    legacySessionPath ? `/sessions/${legacySessionPath}/` : null,
    latestReplayPath,
    "/data/manifests/latest.json",
    ...latestReplayDataPaths,
    replayMetaPath,
    modelPath,
    ...replay3dAssetPaths,
  ].filter(Boolean)) {
    await probe(baseUrl, requestPath);
  }
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
