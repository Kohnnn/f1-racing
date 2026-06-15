import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 780, height: 300 } });
for (const slug of ["red-bull", "ferrari", "mercedes", "aston-martin", "alpine"]) {
  let svg;
  try {
    svg = await readFile("pipeline/export/silhouette-snapshots/" + slug + ".svg", "utf8");
  } catch {
    console.log(slug, "no svg");
    continue;
  }
  await page.setContent("<html><body style='margin:0'>" + svg + "</body></html>");
  await page.waitForTimeout(120);
  await page.screenshot({ path: "pipeline/export/silhouette-snapshots/" + slug + ".png" });
}
await browser.close();
console.log("rendered PNGs");
