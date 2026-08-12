import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(root, "apps", "web", "out");

async function serveFile(requestUrl, response) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  const requested = path.resolve(outRoot, `.${pathname}`);
  if (!requested.startsWith(`${outRoot}${path.sep}`) && requested !== outRoot) {
    response.writeHead(403).end();
    return;
  }
  try {
    const filePath = (await stat(requested)).isDirectory() ? path.join(requested, "index.html") : requested;
    response.writeHead(200).end(await readFile(filePath));
  } catch {
    response.writeHead(404).end();
  }
}

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
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const latestResponse = await fetch(`http://127.0.0.1:${address.port}/data/manifests/latest.json`);
    assert.equal(latestResponse.status, 200, "Latest replay manifest is unavailable.");
    const latest = await latestResponse.json();
    const replayPath = latest.latest.path.replace(/^\/sessions\//, "/replay/");
    await page.goto(`http://127.0.0.1:${address.port}${replayPath}/?tab=telemetry`, { waitUntil: "networkidle" });
    const picker = page.locator('select[aria-label="Select a replay driver"]');
    await picker.waitFor();
    const driverCodes = await picker.locator("option").evaluateAll((options) => options.slice(1).map((option) => option.value));
    assert.ok(driverCodes.length > 1, "Driver picker must expose every available driver.");
    const selectedDriver = driverCodes[0];
    await picker.focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction((driverCode) => new URL(window.location.href).searchParams.get("drivers") === driverCode, selectedDriver);
    await assert.doesNotReject(() => page.locator(`.replay-leaderboard__row[aria-pressed="true"]`).waitFor());
    assert.equal(await page.locator(`#replay-driver-picker-status`).textContent(), `Focused ${selectedDriver}. Selected ${selectedDriver}.`);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
