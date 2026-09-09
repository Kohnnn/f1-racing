import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const loaderSource = await readFile(new URL("../apps/web/src/lib/model-viewer-loader.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(loaderSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
for (const registered of [true, false]) {
  let probes = 0;
  let ready = registered;
  const context = {
    exports: {},
    URL,
    window: { location: { origin: "http://f1.test" }, customElements: { get: () => ready ? {} : undefined } },
    document: { scripts: [], createElement: () => ({ getContext: () => {
      probes += 1;
      return probes === 1 && !registered ? { getExtension: () => null } : null;
    } }) },
    require: () => { ready = true; return {}; },
  };
  vm.runInNewContext(compiled, context);
  const first = context.exports.ensureModelViewerLoaded(0);
  const second = context.exports.ensureModelViewerLoaded(0);
  await Promise.all([first, second]);
  if (!registered) assert.equal(first, second, "Concurrent callers must share the import promise");
  await context.exports.ensureModelViewerLoaded(0);
  assert.equal(probes, registered ? 0 : 1, "Cached loaders must not allocate another WebGL context");
}
console.log("2 loader cache regression cases passed.");
if (process.argv.includes("--loader-only")) process.exit(0);
const { chromium, firefox } = await import("playwright");

const out = path.resolve(process.env.F1_CANDIDATE_ROOT || ".", "apps/web/out");
let passed = 0;
for (const [name, engine, blocked] of [["chromium-no-webgl", chromium, true], ["firefox-no-webgl", firefox, false], ["firefox", firefox, false]]) {
  if (process.env.F1_BROWSER && !name.startsWith(process.env.F1_BROWSER)) continue;
  const browser = await engine.launch({ headless: true, ...(name === "firefox-no-webgl" ? { firefoxUserPrefs: { "webgl.disabled": true } } : {}) });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    if (!process.env.F1_BASE_URL) await page.route("http://f1.test/**", async (route) => {
      let file = path.resolve(out, `.${new URL(route.request().url()).pathname}`);
      assert.ok(file.startsWith(`${out}${path.sep}`));
      try {
        if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
        const contentType = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png" }[path.extname(file)] || "application/octet-stream";
        await route.fulfill({ body: await readFile(file), contentType });
      } catch {
        await route.fulfill({ status: 404 });
      }
    });
    if (blocked) await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return /webgl/.test(type) ? null : getContext.call(this, type, ...args);
      };
    });
    await page.goto(`${process.env.F1_BASE_URL || "http://f1.test"}/cars/current-spec/`, { waitUntil: "networkidle" });
    const supported = await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")));
    console.log(JSON.stringify({ name, supported, errors }));
    assert.deepEqual(errors, [], `${name}: renderer initialization errors`);
    if (supported) {
      await page.waitForFunction(() => document.querySelector("model-viewer")?.loaded);
    } else {
      await page.getByText("WebGL 2 is unavailable. Showing a static reference image; use the component list to inspect the car.", { exact: true }).waitFor({ timeout: 5000 });
      const poster = page.getByRole("img", { name: /static reference/ });
      assert.ok(await poster.isVisible());
      assert.ok(await poster.evaluate((image) => image.complete && image.naturalWidth > 0));
      assert.equal(await page.locator("model-viewer").count(), 0);
      assert.equal(await page.locator(".car-viewer-loading__spinner").count(), 0);
      const inspect = page.getByRole("button", { name: "Inspect", exact: true });
      await inspect.focus();
      assert.equal(await inspect.evaluate((element) => {
        const style = getComputedStyle(element);
        return element === document.activeElement && ((style.outlineStyle !== "none" && style.outlineWidth !== "0px") || style.boxShadow !== "none");
      }), true, "Modelview Inspect lacks visible keyboard focus.");
      await inspect.press("Enter");
      assert.equal(await inspect.getAttribute("aria-pressed"), "true");
      const component = page.locator(".car-focus-item").first();
      assert.equal(await component.evaluate((element) => element === document.activeElement), true, "Inspect must focus the component list without WebGL");
      await component.press("Enter");
      assert.equal(await component.getAttribute("aria-pressed"), "true");
      assert.ok(await page.locator(".car-inspector-copy").first().isVisible());
      assert.ok(new URL(page.url()).searchParams.has("focus"));
      const image = page.getByAltText("Exploded technical view");
      await image.waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const image = document.querySelector('img[alt="Exploded technical view"]');
        return image?.complete && image.naturalWidth > 0;
      });
      assert.match(await image.getAttribute("src"), /^\/exploded-views\/\d{4}\/[^/]+\.png$/);
      const width = await image.evaluate((element) => element.getBoundingClientRect().width);
      const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
      await zoomIn.focus();
      await zoomIn.press("Enter");
      assert.ok(await image.evaluate((element) => element.getBoundingClientRect().width) > width);
      const reset = page.getByRole("button", { name: "Reset view", exact: true });
      await reset.focus();
      await reset.press("Enter");
      assert.equal(await image.evaluate((element) => element.getBoundingClientRect().width), width);
      assert.equal(await page.locator("model-viewer[auto-rotate]").count(), 0);
      const paused = page.locator(".wind-tunnel__action-button", { hasText: "Paused" });
      await paused.waitFor({ state: "visible" });
      assert.ok(await paused.isDisabled());
      const selections = page.locator(".car-viewer-toolbar select");
      if (await selections.count() > 1) await selections.first().selectOption("2025");
      await page.locator(".car-viewer-toolbar select").last().selectOption("ferrari");
      await page.getByRole("img", { name: "Ferrari SF-25 static reference" }).waitFor();
      await page.getByRole("group", { name: "2D illustration zoom controls" }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    assert.deepEqual(errors, []);
    passed += 1;
  } finally {
    await browser.close();
  }
}
console.log(`${passed} WebGL fallback browser cases passed.`);
