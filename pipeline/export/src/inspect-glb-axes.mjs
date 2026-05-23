// Inspect the world-space axis ranges of every catalog GLB so we know
// which axis is forward/up.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function loadPositions(glbPath) {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });
  const document = await io.read(glbPath);
  const points = [];
  const docRoot = document.getRoot();
  const scene = docRoot.getDefaultScene() || docRoot.listScenes()[0];

  function multiplyMat4(a, b) {
    const out = new Float64Array(16);
    for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
    return out;
  }
  function transformPoint(m, x, y, z) {
    return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
  }
  function visit(node, parent) {
    const local = new Float64Array(node.getMatrix());
    const world = parent ? multiplyMat4(parent, local) : local;
    const mesh = node.getMesh();
    if (mesh) for (const primitive of mesh.listPrimitives()) {
      const pos = primitive.getAttribute("POSITION");
      if (!pos) continue;
      const array = pos.getArray();
      if (!array) continue;
      const stride = pos.getElementSize();
      const count = pos.getCount();
      const cap = 50000;
      const step = Math.max(1, Math.floor(count / cap));
      for (let i = 0; i < count; i += step) {
        const o = i * stride;
        const p = transformPoint(world, array[o], array[o+1], array[o+2]);
        points.push(p);
      }
    }
    for (const child of node.listChildren()) visit(child, world);
  }
  for (const node of scene.listChildren()) visit(node, null);
  return points;
}

function pct(arr, p) {
  const idx = Math.max(0, Math.min(arr.length - 1, Math.floor(arr.length * p)));
  return arr[idx];
}

async function main() {
  const catalogPath = path.join(root, "data", "packs", "cars", "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf-8"));
  for (const entry of catalog.models) {
    const glbPath = path.join(root, "apps", "web", "public", entry.file.replace(/^\//, ""));
    const points = await loadPositions(glbPath);
    if (!points.length) { console.log(entry.constructorSlug, "EMPTY"); continue; }
    const xs = points.map((p) => p[0]).sort((a, b) => a - b);
    const ys = points.map((p) => p[1]).sort((a, b) => a - b);
    const zs = points.map((p) => p[2]).sort((a, b) => a - b);
    const rx = pct(xs, 0.995) - pct(xs, 0.005);
    const ry = pct(ys, 0.995) - pct(ys, 0.005);
    const rz = pct(zs, 0.995) - pct(zs, 0.005);
    console.log(entry.constructorSlug.padEnd(15), `dx=${rx.toFixed(3)} dy=${ry.toFixed(3)} dz=${rz.toFixed(3)}  long=${["x","y","z"][[rx,ry,rz].indexOf(Math.max(rx,ry,rz))]}  short=${["x","y","z"][[rx,ry,rz].indexOf(Math.min(rx,ry,rz))]}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
