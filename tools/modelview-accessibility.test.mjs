import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath) => readFile(path.join(root, relativePath), "utf-8");

const [loader, browserSource, windTunnel, replayScene, styles, headers] = await Promise.all([
  source("apps/web/src/lib/model-viewer-loader.ts"),
  source("apps/web/src/components/model-viewer/car-model-browser.tsx"),
  source("apps/web/src/components/wind/canvas-wind-tunnel.tsx"),
  source("apps/web/src/components/replay/three/ReplayScene3D.tsx"),
  source("apps/web/src/app/globals.css"),
  source("apps/web/public/_headers"),
]);

for (const file of ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]) {
  await access(path.join(root, "apps/web/public/draco", file));
}

assert.match(loader, /new URL\(`\$\{basePath\}\/draco\/`, scriptUrl\.origin\)/);
assert.doesNotMatch(loader, /gstatic|googleapis/);
assert.doesNotMatch(replayScene, /useGLTF/);
assert.match(replayScene, /useLoader\(GLTFLoader,/);
assert.doesNotMatch(headers, /gstatic|googleapis/);
for (const label of ["Camera zoom controls", "Zoom in", "Zoom out", "Reset view"]) {
  assert.ok(browserSource.includes(label), `Missing accessible camera control: ${label}`);
}
assert.match(browserSource, /aria-pressed=\{Boolean\(compareSlug\)\}/);
assert.match(browserSource, /aria-pressed=\{interactionMode === "inspect"\}/);
assert.match(browserSource, /aria-pressed=\{studioQuality === "studio"\}/);
assert.match(windTunnel, /aria-pressed=\{controls\.quality === preset\}/);
assert.match(windTunnel, /aria-pressed=\{controls\.overlayMode === mode\}/);
assert.match(windTunnel, /aria-pressed=\{paused \|\| reducedMotion\}/);
assert.match(windTunnel, /setPaused\(query\.matches\)/);
assert.match(windTunnel, /if \(pausedRef\.current\) return;/);
assert.match(windTunnel, /drawSilhouette\(elapsed\)/);
assert.doesNotMatch(windTunnel, /performance\.now\(\) \* controls\.airspeed/);
assert.match(styles, /\.car-viewer-canvas--mode-inspect \.car-model-hotspot--rear-wing,/);

if (!process.argv.includes("--browser")) process.exit(0);

const candidateRoot = process.env.F1_CANDIDATE_ROOT ? path.resolve(process.env.F1_CANDIDATE_ROOT) : null;
const outRoot = candidateRoot ? path.join(candidateRoot, "apps", "web", "out") : path.join(root, "apps", "web", "out");
await access(outRoot);
const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1];
assert.ok(csp, "Static CSP is missing.");

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".glb": "model/gltf-binary",
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

async function fulfillArtifact(route) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(route.request().url()).pathname);
  } catch {
    await route.fulfill({ status: 400 });
    return;
  }
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

async function launchBrowser(chromium) {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!String(error).includes("Executable doesn't exist")) throw error;
    return chromium.launch({ channel: "chrome", headless: true });
  }
}

async function press(locator) {
  await locator.focus();
  await locator.press("Enter");
}

async function newArtifactPage(browser, contextOptions) {
  const context = await browser.newContext(contextOptions);
  await context.route("http://f1.test/**", fulfillArtifact);
  return { context, page: await context.newPage() };
}

function diagnostics(page, origin) {
  const external = [];
  const failed = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin !== origin) external.push(request.url());
  });
  page.on("requestfailed", (request) => {
    if (!new URL(request.url()).pathname.startsWith("/exploded-views/")) failed.push(`${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !new URL(response.url()).pathname.startsWith("/exploded-views/")) {
      failed.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return () => {
    assert.deepEqual(external, [], `Modelview made external requests:\n${external.join("\n")}`);
    assert.deepEqual(failed, [], `Modelview had failed core requests:\n${failed.join("\n")}`);
    assert.deepEqual(consoleErrors, [], `Modelview logged console errors:\n${consoleErrors.join("\n")}`);
    assert.deepEqual(pageErrors, [], `Modelview raised page errors:\n${pageErrors.join("\n")}`);
  };
}

const origin = "http://f1.test";
const { chromium } = await import("playwright");
let browser;
try {
  browser = await launchBrowser(chromium);

  const { context: mainContext, page } = await newArtifactPage(browser);
  const decoderRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/draco/")) decoderRequests.push(url);
  });
  const assertClean = diagnostics(page, origin);
  await page.goto(`${origin}/cars/current-spec/`, { waitUntil: "domcontentloaded" });
  await page.locator(".car-viewer-zoom-controls").waitFor({ timeout: 30_000 });
  const decoderLocation = await page.evaluate(() => customElements.get("model-viewer")?.dracoDecoderLocation);
  assert.equal(decoderLocation, `${origin}/draco/`);
  assert.deepEqual(
    decoderRequests.map((url) => url.origin),
    decoderRequests.map(() => origin),
    "The compressed model requested a decoder from another origin.",
  );
  for (const decoder of ["draco_wasm_wrapper.js", "draco_decoder.wasm"]) {
    assert.ok(decoderRequests.some((url) => url.pathname === `/draco/${decoder}`), `The compressed model did not request ${decoder}.`);
  }

  await page.getByLabel("Season").selectOption("2025");
  await page.getByRole("heading", { name: "Red Bull RB21", exact: true }).waitFor();
  assert.match(await page.locator("model-viewer").first().evaluate((node) => node.src), /^\/models\/2025\//);
  await press(page.getByRole("button", { name: "Side", exact: true }));
  assert.equal(await page.getByRole("button", { name: "Side", exact: true }).getAttribute("aria-pressed"), "true");
  await press(page.getByRole("button", { name: "Inspect", exact: true }));
  assert.equal(await page.getByRole("button", { name: "Inspect", exact: true }).getAttribute("aria-pressed"), "true");
  await press(page.getByRole("button", { name: "Clean", exact: true }));
  assert.equal(await page.getByRole("button", { name: "Clean", exact: true }).getAttribute("aria-pressed"), "true");
  await press(page.getByRole("button", { name: "Compare side-by-side", exact: true }));
  assert.equal(await page.getByRole("button", { name: "Hide compare", exact: true }).getAttribute("aria-pressed"), "true");
  const primaryViewer = page.locator("model-viewer").first();
  await press(page.getByRole("button", { name: "Zoom in", exact: true }));
  assert.notEqual(await primaryViewer.evaluate((node) => node.cameraOrbit), "30deg 75deg 2.4m");
  await press(page.getByRole("button", { name: "Reset view", exact: true }));
  assert.equal(await primaryViewer.evaluate((node) => node.cameraOrbit), "30deg 75deg 2.4m");
  const windTunnel = page.locator(".wind-tunnel");
  await windTunnel.scrollIntoViewIfNeeded();
  await press(windTunnel.getByRole("button", { name: "Technical", exact: true }));
  assert.equal(await windTunnel.getByRole("button", { name: "Technical", exact: true }).getAttribute("aria-pressed"), "true");
  await press(windTunnel.getByRole("button", { name: "High", exact: true }));
  assert.equal(await windTunnel.getByRole("button", { name: "High", exact: true }).getAttribute("aria-pressed"), "true");
  await press(windTunnel.getByRole("button", { name: "Pause", exact: true }));
  assert.equal(await windTunnel.getByRole("button", { name: "Paused", exact: true }).getAttribute("aria-pressed"), "true");
  assertClean();
  await mainContext.close();

  const { context: recoveryContext, page: recovery } = await newArtifactPage(browser);
  let modelFailures = 0;
  await recovery.route(/\/models\/2025\/ferrari\/sf25\.glb(?:\?.*)?$/, async (route) => {
    modelFailures += 1;
    if (modelFailures === 1) {
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });
  await recovery.goto(`${origin}/cars/current-spec/?season=2025&constructor=ferrari`, { waitUntil: "domcontentloaded" });
  await recovery.getByRole("alert").waitFor({ timeout: 30_000 });
  await press(recovery.getByRole("button", { name: "Retry 3D model", exact: true }));
  await recovery.locator(".car-viewer-zoom-controls").waitFor({ timeout: 30_000 });
  await recoveryContext.close();

  const unsupportedContext = await browser.newContext();
  await unsupportedContext.route("http://f1.test/**", fulfillArtifact);
  await unsupportedContext.addInitScript(() => {
    Object.defineProperty(window, "customElements", { configurable: true, value: undefined });
  });
  const unsupported = await unsupportedContext.newPage();
  await unsupported.goto(`${origin}/cars/current-spec/`, { waitUntil: "domcontentloaded" });
  await unsupported.getByRole("button", { name: "Retry 3D viewer", exact: true }).waitFor({ timeout: 15_000 });
  await unsupportedContext.close();

  const { context: reducedContext, page: reduced } = await newArtifactPage(browser, {
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await reduced.goto(`${origin}/cars/current-spec/`, { waitUntil: "domcontentloaded" });
  await press(reduced.getByRole("button", { name: "Inspect", exact: true }));
  const animationName = await reduced.locator(".car-model-hotspot--rear-wing").evaluate((node) => getComputedStyle(node).animationName);
  assert.equal(animationName, "none");
  assert.equal(await reduced.locator("model-viewer[auto-rotate]").count(), 0);
  const reducedPause = reduced.locator(".wind-tunnel__action-button", { hasText: "Paused" });
  await reducedPause.waitFor({ timeout: 15_000 });
  assert.equal(await reducedPause.isDisabled(), true);
  assert.equal(await reduced.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "Modelview overflows a narrow viewport.");
  await reducedContext.close();
} finally {
  await browser?.close();
}
