import { chromium } from "playwright";

function getBaseUrl() {
  const baseIndex = process.argv.indexOf("--base");
  const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
  const raw = baseArg?.slice("--base=".length) ?? (baseIndex >= 0 ? process.argv[baseIndex + 1] : null);
  return (raw || "http://127.0.0.1:4199").replace(/\/$/, "");
}

const constructors = ["red-bull", "ferrari", "mercedes", "aston-martin", "alpine", "mclaren"];
const baseUrl = getBaseUrl();
const browser = await chromium.launch({ headless: true });
let anyFail = false;

for (const slug of constructors) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const failedReqs = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("requestfailed", (r) => { if (!r.url().includes("favicon")) failedReqs.push(r.url()); });

  let silhouetteStatus = null;
  page.on("response", (resp) => {
    if (resp.url().includes(`/data/silhouettes/${slug}.json`)) silhouetteStatus = resp.status();
  });

  const url = `${baseUrl}/cars/current-spec/?season=2025&constructor=${slug}&focus=front-wing`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  // SVG-art is the default mode for curated constructors. Confirm the active
  // mode button and the source label both report SVG.
  const activeMode = await page.evaluate(() => {
    const btn = document.querySelector(".wind-tunnel__mode-button--active");
    return btn ? btn.textContent.trim() : null;
  });
  let sourceLabel = null;
  try {
    sourceLabel = (await page.locator(".wind-tunnel__mode-source strong").first().innerText()).trim();
  } catch { /* ignore */ }

  // Sanity: the canvas must paint non-blank pixels (the silhouette).
  const nonBlank = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return false;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return true; // webgl canvas; skip pixel test
    const { data } = g.getImageData(0, 0, c.width, c.height);
    let nonZero = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] || data[i + 1] || data[i + 2]) nonZero += 1;
      if (nonZero > 200) return true;
    }
    return nonZero > 200;
  });

  const ok = silhouetteStatus === 200 && (sourceLabel || "").toLowerCase() === "svg" && activeMode === "SVG art" && nonBlank && errors.length === 0 && failedReqs.length === 0;
  if (!ok) anyFail = true;
  console.log(
    `${slug.padEnd(13)} ${ok ? "OK " : "FAIL"} | svgFetch=${silhouetteStatus} activeMode='${activeMode}' source=${sourceLabel} nonBlank=${nonBlank} errors=${errors.length} failedReq=${failedReqs.length}`,
  );
  errors.slice(0, 4).forEach((e) => console.log("    ERR:", e));
  failedReqs.slice(0, 4).forEach((u) => console.log("    REQFAIL:", u));
  await page.close();
}

await browser.close();
console.log(anyFail ? "\nSOME PROBES FAILED" : "\nALL SVG-ART PROBES OK");
process.exitCode = anyFail ? 1 : 0;
