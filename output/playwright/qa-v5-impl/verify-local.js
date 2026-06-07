async (page) => {
  const baseUrl = "http://127.0.0.1:4174";
  const out = "C:/Users/Admin/Desktop/PersonalWebsite/interactive-note/f1-racing/output/playwright/qa-v5-impl";
  const consoleErrors = [];
  const consoleWarnings = [];
  const silhouetteResponses = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
    if (msg.type() === "warning") consoleWarnings.push(msg.text());
  });
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/data/silhouettes/")) {
      silhouetteResponses.push({ url, status: response.status() });
    }
  });

  async function readout() {
    const raw = await page.locator(".wind-tunnel__readout").innerText({ timeout: 15000 });
    const drag = Number((raw.match(/Drag\s+(-?\d+(?:\.\d+)?)/i) || [])[1]);
    const cy = Number((raw.match(/Cy est\s+(-?\d+(?:\.\d+)?)/i) || [])[1]);
    const state = (await page.locator(".wind-tunnel__solver-state").first().innerText()).trim().toLowerCase();
    return { raw, drag, cy, state };
  }

  async function waitForSettled(maxMs = 6500) {
    const start = Date.now();
    let sample = await readout();
    while (Date.now() - start < maxMs) {
      if (sample.state === "settled") return sample;
      await page.waitForTimeout(650);
      sample = await readout();
    }
    return sample;
  }

  async function afterControlChange() {
    await page.waitForTimeout(1400);
    return waitForSettled(9000);
  }

  await page.setViewportSize({ width: 1440, height: 1150 });
  await page.goto(`${baseUrl}/cars/current-spec/?season=2026&constructor=fia-2026&focus=front-wing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(9000);
  const modelLoaded = await page.locator("model-viewer").first().evaluate((el) => Boolean(el.loaded)).catch(() => false);
  const loadingBadgeCount = await page.locator(".car-viewer-loading:visible").count();
  const defaultParticles = await page.locator("input[type=\"range\"][max=\"800\"]").inputValue().catch(() => null);
  await waitForSettled();
  await page.screenshot({ path: `${out}/primary-procedural.png`, fullPage: false });

  await page.getByRole("tab", { name: "SVG art" }).click();
  await afterControlChange();
  const svgReadout = await readout();
  await page.screenshot({ path: `${out}/mode-svg-art.png`, fullPage: false });

  await page.getByRole("tab", { name: "GLB hull" }).click();
  await afterControlChange();
  const glbReadout = await readout();
  await page.screenshot({ path: `${out}/mode-glb-hull.png`, fullPage: false });

  await page.getByRole("tab", { name: "Procedural" }).click();
  const closed = await afterControlChange();
  await page.getByRole("checkbox", { name: "DRS open" }).check();
  const drsOpen = await afterControlChange();

  await page.getByRole("checkbox", { name: "DRS open" }).uncheck();
  await afterControlChange();
  await page.getByRole("checkbox", { name: "Rolling road" }).uncheck();
  await page.getByRole("checkbox", { name: "Wheels rotating" }).uncheck();
  const rollingOff = await afterControlChange();
  await page.screenshot({ path: `${out}/rolling-road-wheels-off.png`, fullPage: false });
  await page.getByRole("checkbox", { name: "Rolling road" }).check();
  await page.getByRole("checkbox", { name: "Wheels rotating" }).check();
  const rollingOn = await afterControlChange();
  await page.screenshot({ path: `${out}/rolling-road-wheels-on.png`, fullPage: false });

  const yawSlider = page.getByRole("slider", { name: /Yaw/i });
  await yawSlider.fill("-15");
  const yawMinus = await afterControlChange();
  await yawSlider.fill("15");
  const yawPlus = await afterControlChange();

  await page.getByRole("tab", { name: "Vectors" }).click();
  await page.screenshot({ path: `${out}/overlay-vectors.png`, fullPage: false });
  await page.getByRole("tab", { name: "Pressure" }).click();
  await page.screenshot({ path: `${out}/overlay-pressure.png`, fullPage: false });
  await page.getByRole("tab", { name: "Vorticity" }).click();
  await page.screenshot({ path: `${out}/overlay-vorticity.png`, fullPage: false });

  const learnErrorsBefore = consoleErrors.length;
  const learnStatuses = [];
  for (let i = 0; i < 3; i += 1) {
    await page.goto(`${baseUrl}/learn/aero/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3500);
    const modelReady = await page.locator(".learn-model-embed model-viewer").evaluate((el) => Boolean(el.loaded)).catch(() => false);
    const controlledError = await page.locator(".learn-model-embed__overlay--error").count();
    learnStatuses.push({ pass: i + 1, readyOrControlledError: modelReady || controlledError > 0, modelReady, controlledError: controlledError > 0, title: await page.title() });
  }
  await page.screenshot({ path: `${out}/learn-aero.png`, fullPage: false });

  return {
    modelLoaded,
    loadingBadgeCount,
    defaultParticles,
    silhouetteResponses,
    svgReadout,
    glbReadout,
    drsDeltaPct: ((drsOpen.drag - closed.drag) / closed.drag) * 100,
    rollingDeltaPct: ((rollingOn.drag - rollingOff.drag) / rollingOff.drag) * 100,
    yawCy: { minus: yawMinus.cy, plus: yawPlus.cy },
    finalSolverState: rollingOn.state,
    learnStatuses,
    newLearnConsoleErrors: consoleErrors.slice(learnErrorsBefore),
    consoleErrors,
    consoleWarnings
  };
}
