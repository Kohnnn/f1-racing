import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = process.env.F1_CANDIDATE_ROOT ? path.resolve(process.env.F1_CANDIDATE_ROOT) : null;
const outRoot = candidateRoot ? path.join(candidateRoot, "apps", "web", "out") : path.join(root, "apps", "web", "out");
const source = (relativePath) => readFile(path.join(root, relativePath), "utf-8");

const [pageSource, raceDeskSource, handoffSource, generatorSource, styles, packageSource] = await Promise.all([
  source("apps/web/src/app/page.tsx"),
  source("apps/web/src/app/race-desk/page.tsx"),
  source("apps/web/src/components/story/dashboard-handoff.tsx"),
  source("pipeline/export/src/build-evidence-briefs.mjs"),
  source("apps/web/src/app/globals.css"),
  source("package.json"),
]);

assert.match(pageSource, /getEvidenceBriefIndex\(\)/);
assert.match(pageSource, /<LearningTrail \/>/);
assert.match(pageSource, /canonical: "\/"/);
assert.match(raceDeskSource, /<span>Historical replay simulation — not live timing<\/span>/);
assert.doesNotMatch(pageSource, /const featuredBrief|const nextBriefs/);
assert.match(handoffSource, /saveApprovedBriefInBrowser\(trail\)/);
assert.equal((generatorSource.match(/learningOutcome:/g) ?? []).length, 3);
assert.match(styles, /@media \(max-width: 800px\)/);
assert.ok(JSON.parse(packageSource).scripts["quality:source"].includes("check:dashboard"));

if (!process.argv.includes("--browser")) process.exit(0);

await access(outRoot);
const headers = await readFile(path.join(outRoot, "_headers"), "utf-8");
const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1];
assert.ok(csp, "Static CSP is missing.");

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

const briefs = [
  {
    id: "monza-braking",
    replay: "/replay/2025/italian-grand-prix/qualifying?tab=compare&drivers=VER,NOR#analysis",
    learn: ["/learn/braking"],
    modelview: "/cars/current-spec?focus=brakes",
  },
  {
    id: "mexico-aero",
    replay: "/replay/2025/mexico-city-grand-prix/race?tab=compare&drivers=NOR,LEC#analysis",
    learn: ["/learn/aero"],
    modelview: "/cars/current-spec?focus=rear-wing",
  },
  {
    id: "zandvoort-strategy-tyres",
    replay: "/replay/2025/dutch-grand-prix/race?tab=racecontrol#analysis",
    learn: ["/learn/strategy", "/learn/tyres"],
    modelview: "/cars/current-spec?focus=tyres",
  },
];
const origin = "http://f1.test";
const externalRequests = [];
const measurementRequests = [];
const { chromium } = await import("playwright");
let browser;
try {
  browser = await launchBrowser(chromium);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.route(`${origin}/**`, fulfillArtifact);
  const page = await context.newPage();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin !== origin) externalRequests.push(request.url());
    if (/\/(?:api\/)?(?:analytics|events|collect|beacon)(?:\/|$)/i.test(url.pathname)) measurementRequests.push(request.url());
  });

  async function openDashboard() {
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Choose one engineering question. Follow the evidence." }).waitFor();
  }

  async function activateHandoff(briefId, href) {
    await openDashboard();
    const link = page.locator(`#brief-${briefId} a[href="${href}"]`).first();
    await link.focus();
    assert.equal(await link.evaluate((node) => node === document.activeElement), true, `${briefId} handoff is not keyboard focusable.`);
    await link.press("Enter");
    await page.waitForURL(`${origin}${href}`, { timeout: 30_000 });
    const trail = await page.evaluate(() => JSON.parse(localStorage.getItem("f1-racing.learning-trail.v1") || "null")?.trail ?? null);
    assert.equal(trail?.briefId, briefId, `${briefId} did not save its browser-local trail.`);
    return trail;
  }

  await openDashboard();
  assert.equal(await page.title(), "F1 Racing — Engineering Dashboard");
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://f1-demo.netlify.app/");
  assert.equal(await page.locator('[id^="brief-"]').count(), 3);
  assert.equal(await page.locator(".dashboard-learning-outcome").count(), 3);
  assert.equal(await page.locator(".dashboard-prohibited").count(), 3);
  await page.getByText("Claiming the safety car made a stop cheap or caused a stop", { exact: true }).waitFor();
  await page.getByText("Claiming undercut success, tyre warm-up, team intent, measured pit loss, or causal advantage", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "Dashboard overflows at 390 px.");
  for (const brief of briefs) {
    const section = page.locator(`#brief-${brief.id}`);
    for (const className of ["Recorded", "Derived", "Unknown"]) {
      assert.ok(await section.locator(`[data-claim-class="${className}"]`).count(), `${brief.id} does not display ${className} evidence.`);
    }
    for (const href of [brief.replay, ...brief.learn, brief.modelview]) {
      assert.equal(await section.locator(`a[href="${href}"]`).count(), 1, `${brief.id} does not expose exact handoff ${href}.`);
    }
  }
  const primaryBox = await page.locator(`#brief-monza-braking a[href="${briefs[0].replay}"]`).boundingBox();
  assert.ok(primaryBox && primaryBox.height >= 44, "Primary Dashboard action is below 44 px.");

  for (const brief of briefs) {
    const replayTrail = await activateHandoff(brief.id, brief.replay);
    assert.equal(replayTrail.replayHref, brief.replay);
    if (brief.id === "monza-braking") {
      await page.getByRole("button", { name: "Save as resume point" }).press("Enter");
      await page.getByText("Replay resume point saved in this browser.", { exact: true }).waitFor();
      const savedReplayHref = await page.evaluate(() => JSON.parse(localStorage.getItem("f1-racing.learning-trail.v1") || "null")?.trail?.replayHref ?? null);
      const savedReplayUrl = new URL(savedReplayHref, origin);
      assert.equal(savedReplayUrl.pathname, "/replay/2025/italian-grand-prix/qualifying");
      assert.equal(savedReplayUrl.searchParams.get("tab"), "compare");
      assert.equal(savedReplayUrl.searchParams.get("drivers"), "VER,NOR");
      assert.ok(Number.isFinite(Number(savedReplayUrl.searchParams.get("t"))));
      assert.equal(savedReplayUrl.hash, "#analysis");
    }
    for (const learnHref of brief.learn) {
      const learnTrail = await activateHandoff(brief.id, learnHref);
      assert.equal(learnTrail.learn.slug, learnHref.slice("/learn/".length));
      await page.getByRole("heading", { level: 1 }).waitFor();
    }
    const modelviewTrail = await activateHandoff(brief.id, brief.modelview);
    assert.equal(modelviewTrail.modelviewHref, brief.modelview);
    await page.getByRole("heading", { name: "Rotate the car. Inspect the airflow." }).waitFor();
    if (brief.id === "monza-braking") {
      await page.locator(".car-focus-list button", { hasText: "Tyres + contact patch" }).press("Enter");
      const savedModelviewHref = await page.evaluate(() => JSON.parse(localStorage.getItem("f1-racing.learning-trail.v1") || "null")?.trail?.modelviewHref ?? null);
      const savedModelviewUrl = new URL(savedModelviewHref, origin);
      assert.equal(savedModelviewUrl.pathname, "/cars/current-spec");
      assert.ok(/^\d+$/.test(savedModelviewUrl.searchParams.get("season") ?? ""));
      assert.match(savedModelviewUrl.searchParams.get("constructor") ?? "", /^[a-z0-9-]+$/);
      assert.equal(savedModelviewUrl.searchParams.get("focus"), "tyres");
    }
  }

  await openDashboard();
  await page.getByText("Zandvoort strategy and tyres", { exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Resume", exact: true }).count(), 1);
  assert.equal(await page.locator(`.learning-trail__resume a:not(.button)[href="${briefs[2].replay}"]`).count(), 1);
  const clearButton = page.getByRole("button", { name: "Clear local progress and trail" });
  await clearButton.focus();
  await clearButton.press("Enter");
  assert.equal(await page.evaluate(() => localStorage.getItem("f1-racing.learning-trail.v1")), null);
  await page.getByText("Local progress and trail cleared from this browser.", { exact: true }).waitFor();
  assert.deepEqual(externalRequests, [], `Dashboard journey made external requests:\n${externalRequests.join("\n")}`);
  assert.deepEqual(measurementRequests, [], `Dashboard journey made client measurement requests:\n${measurementRequests.join("\n")}`);
  await context.close();

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await desktopContext.route(`${origin}/**`, fulfillArtifact);
  const desktop = await desktopContext.newPage();
  desktop.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin !== origin) externalRequests.push(request.url());
  });
  await desktop.goto(`${origin}/`, { waitUntil: "networkidle" });
  assert.equal(await desktop.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "Dashboard overflows at 1440 px.");
  assert.equal(await desktop.locator(".dashboard-feature").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length), 2);
  assert.equal(await desktop.locator(".dashboard-grid").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length), 2);
  assert.deepEqual(externalRequests, [], `Desktop Dashboard made external requests:\n${externalRequests.join("\n")}`);
  await desktopContext.close();
} finally {
  await browser?.close();
}

process.stdout.write("Dashboard browser acceptance passed.\n");
