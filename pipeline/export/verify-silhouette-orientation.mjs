import { readFile } from "node:fs/promises";

// Verify orientation of each generated silhouette using physical invariants,
// with the curated McLaren as the ground-truth control (known nose-left).
function analyze(polygon) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const sx = maxX - minX || 1, sy = maxY - minY || 1;
  // Rear = taller end. Front wheel should be left of rear wheel (post-sort).
  const band = 0.14;
  let lMin = Infinity, lMax = -Infinity, rMin = Infinity, rMax = -Infinity;
  for (const [x, y] of polygon) {
    const tx = (x - minX) / sx;
    if (tx <= band) { lMin = Math.min(lMin, y); lMax = Math.max(lMax, y); }
    if (tx >= 1 - band) { rMin = Math.min(rMin, y); rMax = Math.max(rMax, y); }
  }
  const leftExtent = (lMax - lMin) / sy;
  const rightExtent = (rMax - rMin) / sy;
  // Floor band check: bottom quartile should be wider than top quartile.
  const topXs = [], botXs = [];
  for (const [x, y] of polygon) {
    const ty = (y - minY) / sy;
    if (ty <= 0.25) topXs.push(x); if (ty >= 0.75) botXs.push(x);
  }
  const span = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
  return {
    rearOnRight: rightExtent >= leftExtent,
    rearConfidence: Math.abs(rightExtent - leftExtent),
    leftExtent, rightExtent,
    floorAtBottom: span(botXs) >= span(topXs),
    botSpan: span(botXs), topSpan: span(topXs),
  };
}

const slugs = ["red-bull", "ferrari", "mercedes", "aston-martin", "alpine", "mclaren"];
for (const slug of slugs) {
  const p = JSON.parse(await readFile(`data/silhouettes/${slug}.json`, "utf8"));
  const a = analyze(p.polygon);
  const wheels = p.wheelArches.map((w) => w.cx.toFixed(2)).join(",");
  const tag = slug === "mclaren" ? " [CONTROL: curated nose-left]" : "";
  console.log(
    `${slug.padEnd(13)} rearOnRight=${a.rearOnRight} (conf ${a.rearConfidence.toFixed(2)}, L=${a.leftExtent.toFixed(2)} R=${a.rightExtent.toFixed(2)}) ` +
    `floorBottom=${a.floorAtBottom} (bot=${a.botSpan.toFixed(2)} top=${a.topSpan.toFixed(2)}) wheels[${wheels}]${tag}`,
  );
}
