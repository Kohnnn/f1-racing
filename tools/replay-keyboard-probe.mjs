import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = process.env.F1_CANDIDATE_ROOT ? path.resolve(process.env.F1_CANDIDATE_ROOT) : null;
const outRoot = candidateRoot ? path.join(candidateRoot, "apps", "web", "out") : path.join(root, "apps", "web", "out");
const source = (relativePath) => readFile(path.join(root, relativePath), "utf-8");

const [routeClientSource, replayViewSource, replayPageSource, raceDeskPageSource, liveRouteSource, styles, packageSource] = await Promise.all([
  source("apps/web/src/components/replay/replay-route-client.tsx"),
  source("apps/web/src/components/replay/ReplayView.tsx"),
  source("apps/web/src/app/replay/[season]/[grandPrix]/[session]/page.tsx"),
  source("apps/web/src/app/race-desk/page.tsx"),
  source("apps/web/src/components/live/live-route-client.tsx"),
  source("apps/web/src/app/globals.css"),
  source("package.json"),
]);

assert.match(routeClientSource, /previous\.chunkFailures\.filter\(\(failure\) => failure\.chunkIndex !== chunkIndex\)/);
assert.match(routeClientSource, /state\.chunkFailures\.map\(\(failure\) =>/);
assert.match(routeClientSource, /document\.getElementById\("replay-session-title"\)\?\.focus\(\)/);
assert.match(routeClientSource, /if \(retryingChunkIndexRef\.current !== null\)/);
assert.match(routeClientSource, /aria-disabled=\{retryingChunkIndex !== null\}/);
assert.doesNotMatch(routeClientSource, /if \(state\.status !== "ready" \|\| !state\.chunkFailure\)/);
assert.match(replayViewSource, /data-driver-code=\{driver\.driverCode\}/);
assert.match(replayViewSource, /event\.shiftKey \|\| event\.metaKey \|\| event\.ctrlKey/);
assert.match(replayViewSource, /aria-pressed=\{isSelected\}/);
assert.match(replayViewSource, /aria-live="polite"/);
assert.match(replayPageSource, /href=\{`\/replay\/\$\{season\}\/\$\{grandPrix\}\/\$\{session\}`\}>Retry replay/);
assert.doesNotMatch(raceDeskPageSource, /notFound\(\)/);
assert.match(raceDeskPageSource, /href="\/race-desk">Retry historical replay/);
assert.match(liveRouteSource, /\[activeSession, apiOrigin, closeTimer, delaySeconds, isRaceDesk, reloadKey, speed\]/);
assert.doesNotMatch(`${routeClientSource}\n${raceDeskPageSource}\n${liveRouteSource}`, /replay\.json/);
assert.ok(styles.lastIndexOf("@media (max-width: 800px)") > styles.indexOf(".replay-driver-picker {"));
assert.match(styles, /#replay-session-title:focus/);
assert.ok(JSON.parse(packageSource).scripts["quality:source"].includes("check:replay-keyboard"));

if (!process.argv.includes("--browser")) process.exit(0);

await access(outRoot);

async function collectReplayMetaFiles(directory) {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectReplayMetaFiles(filePath));
    } else if (entry.name === "replay.meta.json") {
      files.push(filePath);
    }
  }
  return files;
}

async function findReplayFixture() {
  const seasonsRoot = path.join(outRoot, "data", "packs", "seasons");
  for (const metaPath of await collectReplayMetaFiles(seasonsRoot)) {
    const replay = JSON.parse(await readFile(metaPath, "utf-8"));
    if (!Array.isArray(replay.frameChunkIndex) || replay.frameChunkIndex.length < 3 || replay.drivers?.length < 2) {
      continue;
    }
    const relative = path.relative(seasonsRoot, metaPath).split(path.sep);
    if (relative.length !== 4) {
      continue;
    }
    const [season, grandPrix, session] = relative;
    const routePath = `/replay/${season}/${grandPrix}/${session}/`;
    try {
      await access(path.join(outRoot, routePath.slice(1), "index.html"));
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    const dataBasePath = `/data/packs/seasons/${season}/${grandPrix}/${session}`;
    const manifest = JSON.parse(await readFile(path.join(path.dirname(metaPath), "manifest.json"), "utf-8"));
    return { dataBasePath, manifest, replay, routePath };
  }
  throw new Error("No exported replay route with at least three chunks and two drivers was found.");
}

async function findRaceDeskFixture() {
  const latestManifest = JSON.parse(await readFile(path.join(outRoot, "data", "manifests", "latest.json"), "utf-8"));
  assert.ok(latestManifest.latest, "Race Desk browser acceptance requires a featured replay.");
  const dataBasePath = latestManifest.latest.path.replace(/^\/sessions\//, "/data/packs/seasons/");
  const replay = JSON.parse(await readFile(path.join(outRoot, dataBasePath.slice(1), "replay.meta.json"), "utf-8"));
  assert.ok(replay.frameChunkIndex?.length, "The featured Race Desk replay has no frame chunks.");
  return { dataBasePath, replay };
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".glb": "model/gltf-binary",
    ".hdr": "application/octet-stream",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  }[extension] || "application/octet-stream";
}

async function launchBrowser(chromium) {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!String(error).includes("Executable doesn't exist")) throw error;
    return chromium.launch({ channel: "chrome", headless: true });
  }
}

async function waitUntil(predicate, message, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(message);
}

const fixture = await findReplayFixture();
const raceDeskFixture = await findRaceDeskFixture();
const headers = await readFile(path.join(outRoot, "_headers"), "utf-8");
const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1];
assert.ok(csp, "Static CSP is missing from the artifact.");
const chunkEntries = [...fixture.replay.frameChunkIndex].sort((left, right) => left.index - right.index);
const failedChunkPaths = chunkEntries.slice(1, 3).map((entry) => `${fixture.dataBasePath}/${entry.path}`);
const delayedChunkPath = `${fixture.dataBasePath}/${chunkEntries[0].path}`;
const optionalPackPaths = new Set([
  fixture.manifest.drivers,
  fixture.manifest.laps,
  fixture.manifest.strategy,
  fixture.manifest.stints,
  ...Object.values(fixture.manifest.compare ?? {}),
].filter((value) => typeof value === "string").map((value) => `${fixture.dataBasePath}/${value}`));
assert.ok(optionalPackPaths.size > 0, "Replay fixture has no optional insight pack to degrade.");

const origin = "http://f1.test";
const chunkRequests = new Map();
const completedChunks = new Set();
const expectedFailures = new Set([...optionalPackPaths, ...failedChunkPaths]);
const failedChunkAttempts = new Map(failedChunkPaths.map((chunkPath) => [chunkPath, 0]));
const allowedChunkPaths = new Set();
let releaseInitialFailures;
const initialFailuresReleased = new Promise((resolve) => {
  releaseInitialFailures = resolve;
});
let releaseDelayedChunk;
const delayedChunkReleased = new Promise((resolve) => {
  releaseDelayedChunk = resolve;
});
let releaseFirstRetry;
const firstRetryReleased = new Promise((resolve) => {
  releaseFirstRetry = resolve;
});
let latestManifestRequests = 0;
const raceDeskMetaPath = `${raceDeskFixture.dataBasePath}/replay.meta.json`;
const raceDeskChunkPaths = new Set(raceDeskFixture.replay.frameChunkIndex.map((entry) => `${raceDeskFixture.dataBasePath}/${entry.path}`));
const raceDeskChunkRequests = new Set();
let raceDeskMetaRequests = 0;
let allowRaceDeskMeta = false;

async function fulfillStaticArtifact(route, pathname) {
  const requested = path.resolve(outRoot, `.${pathname}`);
  if (requested !== outRoot && !requested.startsWith(`${outRoot}${path.sep}`)) {
    await route.fulfill({ status: 403 });
    return;
  }

  try {
    const filePath = (await stat(requested)).isDirectory() ? path.join(requested, "index.html") : requested;
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": contentType(filePath),
        "Content-Security-Policy": csp,
      },
      body: route.request().method() === "HEAD" ? undefined : await readFile(filePath),
    });
  } catch {
    await route.fulfill({ status: 404 });
  }
}

async function requestPathname(route) {
  try {
    return decodeURIComponent(new URL(route.request().url()).pathname);
  } catch {
    await route.fulfill({ status: 400 });
    return null;
  }
}

async function fulfillRaceDeskArtifact(route) {
  const pathname = await requestPathname(route);
  if (pathname === null) return;
  if (pathname === raceDeskMetaPath) {
    raceDeskMetaRequests += 1;
    if (!allowRaceDeskMeta) {
      await route.fulfill({ status: 503, contentType: "application/json; charset=utf-8", body: "{}" });
      return;
    }
  }
  if (raceDeskChunkPaths.has(pathname)) raceDeskChunkRequests.add(pathname);
  await fulfillStaticArtifact(route, pathname);
}

async function fulfillArtifact(route) {
  const pathname = await requestPathname(route);
  if (pathname === null) return;

  if (pathname === "/data/manifests/latest.json") {
    latestManifestRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ latest: null }),
    });
    return;
  }

  if (optionalPackPaths.has(pathname)) {
    await route.fulfill({ status: 503, contentType: "application/json; charset=utf-8", body: "{}" });
    return;
  }

  if (chunkEntries.some((entry) => `${fixture.dataBasePath}/${entry.path}` === pathname)) {
    chunkRequests.set(pathname, (chunkRequests.get(pathname) ?? 0) + 1);
  }

  if (failedChunkPaths.includes(pathname)) {
    failedChunkAttempts.set(pathname, (failedChunkAttempts.get(pathname) ?? 0) + 1);
    if (!allowedChunkPaths.has(pathname)) {
      await initialFailuresReleased;
      await route.fulfill({ status: 503, contentType: "application/json; charset=utf-8", body: "{}" });
      return;
    }
    if (pathname === failedChunkPaths[0]) {
      await firstRetryReleased;
    }
  }

  if (pathname === delayedChunkPath) {
    await delayedChunkReleased;
  }

  await fulfillStaticArtifact(route, pathname);
  if (chunkEntries.some((entry) => `${fixture.dataBasePath}/${entry.path}` === pathname)) {
    completedChunks.add(pathname);
  }
}

function diagnostics(page, label = "Replay", allowedFailures = expectedFailures) {
  const external = [];
  const failed = [];
  const forbiddenReplayRequests = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin !== origin) external.push(request.url());
    if (url.pathname.endsWith("/replay.json")) forbiddenReplayRequests.push(request.url());
  });
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 400 && !allowedFailures.has(pathname)) failed.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => failed.push(`${request.method()} ${request.url()}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource: the server responded with a status of 503")) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return () => {
    assert.deepEqual(external, [], `${label} made external requests:\n${external.join("\n")}`);
    assert.deepEqual(failed, [], `${label} had unexpected failed requests:\n${failed.join("\n")}`);
    assert.deepEqual(forbiddenReplayRequests, [], `${label} requested forbidden replay.json:\n${forbiddenReplayRequests.join("\n")}`);
    assert.deepEqual(consoleErrors, [], `${label} logged unexpected console errors:\n${consoleErrors.join("\n")}`);
    assert.deepEqual(pageErrors, [], `${label} raised page errors:\n${pageErrors.join("\n")}`);
  };
}

async function selectedCodes(page) {
  return page.locator('.replay-driver-picker__option[aria-pressed="true"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-driver-code")).filter(Boolean));
}

async function assertSelection(page, expected) {
  const expectedSet = [...expected].sort();
  await page.waitForFunction((codes) => {
    const value = new URL(window.location.href).searchParams.get("drivers");
    return value === codes.join(",");
  }, expected);
  assert.deepEqual((await selectedCodes(page)).sort(), expectedSet);
  for (const driverCode of expected) {
    assert.equal(await page.locator(".replay-leaderboard__row", { hasText: driverCode }).first().getAttribute("aria-pressed"), "true");
  }
  const telemetryCodes = await page.locator(".replay-telemetry-strip__driver strong").allTextContents();
  assert.deepEqual(telemetryCodes.sort(), expectedSet);
  assert.equal(await page.locator("#analysis-title").textContent(), "Selected telemetry strips");
  assert.ok((await page.locator(".replay-track-panel__chips").textContent()).includes(`Selected ${expected.length}`));
}

const { chromium } = await import("playwright");
let browser;
try {
  browser = await launchBrowser(chromium);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route(`${origin}/**`, fulfillArtifact);
  const page = await context.newPage();
  const assertClean = diagnostics(page);
  const initialTime = Math.min(chunkEntries[0].toTime, chunkEntries[0].fromTime + 120);
  await page.goto(`${origin}${fixture.routePath}?tab=telemetry&t=${initialTime}`, { waitUntil: "domcontentloaded" });
  await page.locator(".replay-driver-picker__option").first().waitFor({ timeout: 30_000 });
  const [firstDriver, secondDriver] = fixture.replay.drivers.slice(0, 2).map((driver) => driver.driverCode);
  const firstOption = page.locator(`.replay-driver-picker__option[data-driver-code="${firstDriver}"]`);
  const secondOption = page.locator(`.replay-driver-picker__option[data-driver-code="${secondDriver}"]`);
  await firstOption.focus();
  releaseInitialFailures();
  const retryButtons = page.getByRole("button", { name: /^Retry chunk \d+$/ });
  await waitUntil(async () => await retryButtons.count() === 2, "Every failed replay chunk did not receive a Retry action.");
  assert.equal(await firstOption.evaluate((node) => node === document.activeElement), true, "A background chunk failure stole focus.");
  releaseDelayedChunk();
  await waitUntil(() => completedChunks.has(delayedChunkPath), "The concurrent successful replay chunk did not finish loading.", 30_000);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await retryButtons.count(), 2, "A successful concurrent chunk cleared another chunk's failure.");
  await page.getByText("Some optional analysis packs are unavailable.", { exact: false }).waitFor();
  await firstOption.focus();
  await firstOption.press("Enter");
  await assertSelection(page, [firstDriver]);
  assert.equal(await page.locator("#replay-driver-picker-status").textContent(), `Focused ${firstDriver}. Selected ${firstDriver}.`);
  await page.locator(".replay-leaderboard__row", { hasText: firstDriver }).first().click();
  await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("drivers"));
  assert.deepEqual(await selectedCodes(page), []);
  await firstOption.focus();
  await firstOption.press("Enter");
  await assertSelection(page, [firstDriver]);
  await secondOption.focus();
  await secondOption.press("Shift+Enter");
  await assertSelection(page, [firstDriver, secondDriver]);

  const selectedBeforeRetry = await selectedCodes(page);
  const clockBeforeRetry = await page.locator(".replay-controls-v2__meta-clock strong").first().textContent();
  const analysisBeforeRetry = await page.locator(".replay-support-panel__select select").inputValue();
  const cachedRequestCounts = new Map(chunkRequests);
  const failedAttemptsBeforeRetry = new Map(failedChunkAttempts);
  const [firstFailedEntry, secondFailedEntry] = chunkEntries.slice(1, 3);
  const firstRetryButton = page.locator(".replay-error-panel", { hasText: `Replay chunk ${firstFailedEntry.index} (` }).getByRole("button");
  const secondRetryButton = page.locator(".replay-error-panel", { hasText: `Replay chunk ${secondFailedEntry.index} (` }).getByRole("button");
  allowedChunkPaths.add(failedChunkPaths[0]);
  await firstRetryButton.focus();
  await firstRetryButton.press("Enter");
  await waitUntil(async () => await firstRetryButton.textContent() === `Retrying chunk ${firstFailedEntry.index}`, "Retry did not expose its loading state.");
  assert.equal(await firstRetryButton.getAttribute("aria-disabled"), "true");
  assert.equal(await firstRetryButton.evaluate((node) => node === document.activeElement), true, "Retry loading lost focus.");
  await firstRetryButton.press("Enter");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(failedChunkAttempts.get(failedChunkPaths[0]), (failedAttemptsBeforeRetry.get(failedChunkPaths[0]) ?? 0) + 1, "A pending Retry accepted a duplicate activation.");
  assert.equal(await firstRetryButton.textContent(), `Retrying chunk ${firstFailedEntry.index}`);
  releaseFirstRetry();
  await firstRetryButton.waitFor({ state: "detached", timeout: 30_000 });
  await page.waitForFunction((chunkIndex) => document.activeElement?.textContent?.trim() === `Retry chunk ${chunkIndex}`, secondFailedEntry.index);
  assert.equal(await secondRetryButton.isVisible(), true, "Recovering one failed chunk removed another chunk's Retry action.");
  assert.equal(failedChunkAttempts.get(failedChunkPaths[0]), (failedAttemptsBeforeRetry.get(failedChunkPaths[0]) ?? 0) + 1);
  assert.equal(failedChunkAttempts.get(failedChunkPaths[1]), failedAttemptsBeforeRetry.get(failedChunkPaths[1]));
  assert.equal(chunkRequests.get(delayedChunkPath), cachedRequestCounts.get(delayedChunkPath), "Retry refetched a cached successful chunk.");

  allowedChunkPaths.add(failedChunkPaths[1]);
  await secondRetryButton.press("Enter");
  await secondRetryButton.waitFor({ state: "detached", timeout: 30_000 });
  await page.waitForFunction(() => document.activeElement?.id === "replay-session-title");
  assert.equal(failedChunkAttempts.get(failedChunkPaths[1]), (failedAttemptsBeforeRetry.get(failedChunkPaths[1]) ?? 0) + 1);
  assert.deepEqual(await selectedCodes(page), selectedBeforeRetry);
  assert.equal(await page.locator(".replay-controls-v2__meta-clock strong").first().textContent(), clockBeforeRetry);
  assert.equal(await page.locator(".replay-support-panel__select select").inputValue(), analysisBeforeRetry);
  await assertSelection(page, [firstDriver, secondDriver]);

  await secondOption.focus();
  await secondOption.press("Enter");
  await assertSelection(page, [secondDriver]);
  await secondOption.press("Enter");
  await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("drivers"));
  assert.deepEqual(await selectedCodes(page), []);

  const trackCanvas = page.getByLabel("Interactive 2D race track map");
  await trackCanvas.focus();
  assert.equal(await trackCanvas.getAttribute("data-view-transform"), "0,0,1,0");
  await trackCanvas.press("ArrowRight");
  assert.equal(await trackCanvas.getAttribute("data-view-transform"), "-24,0,1,0");
  await trackCanvas.press("+");
  assert.equal(await trackCanvas.getAttribute("data-view-transform"), "-24,0,1.15,0");
  await trackCanvas.press("0");
  assert.equal(await trackCanvas.getAttribute("data-view-transform"), "0,0,1,0");

  const storyButton = page.getByRole("button", { name: "Story", exact: true });
  await storyButton.focus();
  await storyButton.press("Enter");
  assert.equal(await storyButton.evaluate((node) => node === document.activeElement), true);
  const workspaceButton = page.getByRole("button", { name: "Workspace", exact: true });
  await workspaceButton.focus();
  await workspaceButton.press("Enter");
  assert.equal(await workspaceButton.evaluate((node) => node === document.activeElement), true);

  await page.setViewportSize({ width: 390, height: 844 });
  await firstOption.scrollIntoViewIfNeeded();
  await firstOption.focus();
  assert.equal(await page.locator(".replay-driver-picker").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "Replay overflows a narrow viewport.");
  const focusedBounds = await firstOption.boundingBox();
  assert.ok(focusedBounds && focusedBounds.x >= 0 && focusedBounds.x + focusedBounds.width <= 391, "Focused driver is outside the narrow viewport.");
  assert.notEqual(await firstOption.evaluate((node) => getComputedStyle(node).outlineStyle), "none");
  assert.ok(latestManifestRequests <= 1, "Replay repeatedly requested the no-featured manifest.");
  assertClean();
  await page.close();

  await context.unroute(`${origin}/**`, fulfillArtifact);
  await context.route(`${origin}/**`, fulfillRaceDeskArtifact);
  const raceDeskPage = await context.newPage();
  const raceDeskSockets = [];
  raceDeskPage.on("websocket", (socket) => raceDeskSockets.push(socket.url()));
  const assertRaceDeskClean = diagnostics(raceDeskPage, "Race Desk", new Set([raceDeskMetaPath]));
  await raceDeskPage.goto(`${origin}/race-desk/`, { waitUntil: "domcontentloaded" });
  await raceDeskPage.getByRole("heading", { name: "Historical replay unavailable" }).waitFor({ timeout: 30_000 });
  assert.equal(raceDeskMetaRequests, 1, "Race Desk did not fail on its initial metadata request.");
  allowRaceDeskMeta = true;
  await raceDeskPage.getByRole("button", { name: "Retry historical replay" }).click();
  await waitUntil(
    () => raceDeskChunkRequests.size === raceDeskChunkPaths.size,
    "Race Desk did not request every declared frame chunk after Retry.",
    30_000,
  );
  await raceDeskPage.getByRole("heading", { name: "Historical replay unavailable" }).waitFor({ state: "detached", timeout: 30_000 });
  await raceDeskPage.getByText("Historical replay simulation — not live timing", { exact: true }).waitFor({ timeout: 30_000 });
  assert.ok(raceDeskMetaRequests >= 2, "Race Desk Retry did not reload replay metadata.");
  assert.deepEqual(raceDeskSockets, [], "Historical Race Desk opened a WebSocket.");
  assertRaceDeskClean();
  await context.close();
} finally {
  await browser?.close();
}
