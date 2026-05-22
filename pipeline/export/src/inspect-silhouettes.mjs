import { readFile } from "node:fs/promises";
import path from "node:path";

const slugs = ["red-bull", "ferrari", "mclaren", "mercedes", "aston-martin", "alpine", "fia-2026"];
for (const slug of slugs) {
  const p = JSON.parse(await readFile(path.join("data", "wind-profiles", `${slug}.json`), "utf-8"));
  const W = 90; const H = 16;
  const grid = Array.from({ length: H }, () => Array(W).fill(" "));
  const xs = p.polygon.map(([x]) => x);
  const ys = p.polygon.map(([, y]) => y);
  const xMin = Math.min(...xs); const xMax = Math.max(...xs);
  const yMin = Math.min(...ys); const yMax = Math.max(...ys);
  function setCell(gx, gy) { if (gx >= 0 && gy >= 0 && gx < W && gy < H) grid[gy][gx] = "#"; }
  for (let i = 0; i < p.polygon.length; i += 1) {
    const [x1, y1] = p.polygon[i];
    const [x2, y2] = p.polygon[(i + 1) % p.polygon.length];
    const u1 = (x1 - xMin) / (xMax - xMin || 1);
    const v1 = (y1 - yMin) / (yMax - yMin || 1);
    const u2 = (x2 - xMin) / (xMax - xMin || 1);
    const v2 = (y2 - yMin) / (yMax - yMin || 1);
    const steps = 60;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      setCell(Math.round((u1 + (u2 - u1) * t) * (W - 1)), Math.round((v1 + (v2 - v1) * t) * (H - 1)));
    }
  }
  console.log(`=== ${slug} (${p.pointCount} pts, ${p.samples} samples, wheels=${p.wheelArches?.length ?? 0}) ===`);
  for (const row of grid) console.log(row.join(""));
  console.log();
}
