import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.F1_BROWSER_ORIGIN;
assert.ok(origin, "Set F1_BROWSER_ORIGIN to the changed-source server.");
const browser = await chromium.launch({ headless: true });
const presets = [0.1, 0.2, 0.5, 1, 2, 4, 8, 16, 20];
let checks = 0;
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${origin}/replay/2025/abu-dhabi-grand-prix/race/?tab=telemetry&t=120`);
    const buttons = page.locator(".replay-controls-v2__speeds");
    await buttons.waitFor();
    async function selection(speed) {
      await page.waitForFunction((speed) => document.querySelector('.replay-controls-v2__speeds button[aria-pressed="true"]')?.textContent.trim() === `${speed}x`, speed);
      assert.deepEqual(await buttons.locator("button").evaluateAll((nodes) => nodes.map((node) => [node.textContent.trim(), node.getAttribute("aria-pressed"), node.classList.contains("replay-controls-v2__speed--active")])), presets.map((preset) => [`${preset}x`, String(preset === speed), preset === speed]));
      checks++;
    }
    await selection(1);
    for (const activation of ["click", "Enter", "Space"]) {
      for (const speed of presets) {
        const button = buttons.getByRole("button", { name: `${speed}x`, exact: true });
        if (activation === "click") await button.click();
        else { await button.focus(); await button.press(activation); }
        await selection(speed);
        assert.equal(await button.evaluate((node) => node === document.activeElement), true);
        assert.equal(await page.getByRole("button", { name: "Play", exact: true }).isVisible(), true);
        checks += 2;
        await button.press("Digit2");
        await selection(speed);
      }
    }
    const title = page.locator("#replay-session-title");
    await title.focus();
    for (const [index, speed] of [0.5, 1, 2, 4, 8].entries()) {
      await title.press(`Digit${index + 1}`);
      await selection(speed);
    }
    const canvas = page.locator(".replay-track-panel__canvas canvas").first();
    const height = (await canvas.boundingBox()).height;
    await page.waitForTimeout(300);
    assert.ok(Math.abs((await canvas.boundingBox()).height - height) < 2, "Canvas height must settle rather than feed back into its parent.");
    assert.ok(height < 2000, "Track canvas must not grow into a multi-screen surface.");
    assert.equal(await page.getByText("Loaded window:", { exact: false }).isVisible(), true);
    assert.equal(await page.locator(".replay-session-banner__note").filter({ hasText: "Whole pack:" }).isVisible(), true);
    checks += 4;
    await page.goto(`${origin}/replay/`);
    assert.ok(await page.getByText(/Whole pack:/).count() > 0);
    assert.ok(await page.getByText(/Provider lineage:/).count() > 0);
    checks += 2;
    console.log(`${viewport.width}px: playback, canvas stability, summary and discovery passed.`);
    await page.close();
  }
} finally {
  await browser.close();
  console.log(`${checks} assertions completed.`);
}
