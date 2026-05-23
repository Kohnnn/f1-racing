// Dump density-thresholded silhouette grid for any constructor.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GRID_NX = 192;
const GRID_NY = 72;

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

  function multiplyMat4(a,b){const o=new Float64Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
  function tp(m,x,y,z){return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}
  function visit(node,parent){const local=new Float64Array(node.getMatrix());const world=parent?multiplyMat4(parent,local):local;const mesh=node.getMesh();if(mesh)for(const p of mesh.listPrimitives()){const pos=p.getAttribute('POSITION');if(!pos)continue;const a=pos.getArray();if(!a)continue;const s=pos.getElementSize();const c=pos.getCount();const cap=200000;const step=Math.max(1,Math.floor(c/cap));for(let i=0;i<c;i+=step){const o=i*s;points.push(tp(world,a[o],a[o+1],a[o+2]));}}for(const ch of node.listChildren())visit(ch,world);}
  for (const node of scene.listChildren()) visit(node, null);
  return points;
}

function pct(arr, p) {
  return arr[Math.max(0, Math.min(arr.length - 1, Math.floor(arr.length * p)))];
}

async function main() {
  const slug = process.argv[2] || "fia-2026";
  const catalog = JSON.parse(await readFile(path.join(root, "data", "packs", "cars", "catalog.json"), "utf-8"));
  const entry = catalog.models.find((m) => m.constructorSlug === slug);
  if (!entry) throw new Error("not found: " + slug);
  const glbPath = path.join(root, "apps", "web", "public", entry.file.replace(/^\//, ""));
  const points = await loadPositions(glbPath);
  const ys = points.map((p) => p[1]).sort((a, b) => a - b);
  const zs = points.map((p) => p[2]).sort((a, b) => a - b);
  const yMin = pct(ys, 0.005), yMax = pct(ys, 0.995);
  const zMin = pct(zs, 0.005), zMax = pct(zs, 0.995);
  console.log(`y trim: ${yMin.toFixed(3)} .. ${yMax.toFixed(3)}, z trim: ${zMin.toFixed(3)} .. ${zMax.toFixed(3)}, aspect=${((zMax-zMin)/(yMax-yMin)).toFixed(2)}`);

  const counts = new Uint32Array(GRID_NX * GRID_NY);
  const padX = 0.04;
  const usableW = GRID_NX * (1 - 2 * padX);
  const aspect = (zMax - zMin) / (yMax - yMin);
  const usableH = Math.min(GRID_NY * 0.94, usableW / aspect);
  const offsetX = GRID_NX * padX;
  const offsetY = (GRID_NY - usableH) * 0.5;
  for (const p of points) {
    if (p[2] < zMin || p[2] > zMax || p[1] < yMin || p[1] > yMax) continue;
    const nx = (p[2] - zMin) / (zMax - zMin || 1);
    const ny = (p[1] - yMin) / (yMax - yMin || 1);
    const gx = Math.max(0, Math.min(GRID_NX - 1, Math.floor(offsetX + nx * usableW)));
    const gy = Math.max(0, Math.min(GRID_NY - 1, Math.floor(offsetY + (1 - ny) * usableH)));
    counts[gy * GRID_NX + gx] += 1;
  }
  const occ = [];
  for (const c of counts) if (c > 0) occ.push(c);
  occ.sort((a, b) => a - b);
  const median = occ[Math.floor(occ.length * 0.5)];
  console.log(`median count = ${median}, threshold = ${Math.max(2, Math.floor(median * 0.6))}`);

  const thresholds = [Math.max(2, Math.floor(median * 0.3)), Math.max(2, Math.floor(median * 0.6)), Math.max(2, Math.floor(median * 1.0)), Math.max(2, Math.floor(median * 1.5))];
  for (const t of thresholds) {
    const grid = new Uint8Array(GRID_NX * GRID_NY);
    for (let i = 0; i < counts.length; i += 1) if (counts[i] >= t) grid[i] = 1;
    let yMinGrid = GRID_NY, yMaxGrid = -1, xMinGrid = GRID_NX, xMaxGrid = -1;
    for (let y = 0; y < GRID_NY; y += 1) for (let x = 0; x < GRID_NX; x += 1) {
      if (grid[y*GRID_NX+x]) { if (y<yMinGrid)yMinGrid=y; if (y>yMaxGrid)yMaxGrid=y; if (x<xMinGrid)xMinGrid=x; if (x>xMaxGrid)xMaxGrid=x; }
    }
    const dx = xMaxGrid - xMinGrid;
    const dy = yMaxGrid - yMinGrid;
    console.log(`\nthreshold ${t}: bbox x[${xMinGrid}..${xMaxGrid}]=${dx}, y[${yMinGrid}..${yMaxGrid}]=${dy}, aspect=${(dx/(dy||1)).toFixed(2)}`);
    if (t === Math.max(2, Math.floor(median * 0.6))) {
      for (let y = 0; y < GRID_NY; y += 1) {
        let row = "";
        for (let x = 0; x < GRID_NX; x += 1) row += grid[y * GRID_NX + x] ? "#" : ".";
        if (row.includes("#")) console.log(row);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
