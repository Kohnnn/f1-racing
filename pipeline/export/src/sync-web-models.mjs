import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DECODER_MAPPINGS = [
  "draco_decoder.js",
  "draco_decoder.wasm",
  "draco_wasm_wrapper.js",
].map((file) => ({
  source: path.join(root, "node_modules", "three", "examples", "jsm", "libs", "draco", file),
  destination: path.join(root, "apps", "web", "public", "draco", file),
}));

const MODEL_MAPPINGS = [
  {
    source: path.join(root, "glb_model", "f1_2025_rb21.glb"),
    destination: path.join(root, "apps", "web", "public", "models", "2025", "red-bull", "rb21.glb"),
  },
  {
    source: path.join(root, "glb_model", "f1_2025_mclaren_mcl39-compressed.glb"),
    destination: path.join(root, "apps", "web", "public", "models", "2025", "mclaren", "mcl39.glb"),
  },
  {
    source: path.join(root, "glb_model", "ferrari_sf-25.glb"),
    destination: path.join(root, "apps", "web", "public", "models", "2025", "ferrari", "sf25.glb"),
  },
  {
    source: path.join(root, "glb_model", "mercedes_w15.glb"),
    destination: path.join(root, "apps", "web", "public", "models", "2025", "mercedes", "w15.glb"),
  },
  {
    source: path.join(root, "glb_model", "aston_martin_aramco_amr25.glb"),
    destination: path.join(root, "apps", "web", "public", "models", "2025", "aston-martin", "amr25.glb"),
  },
  {
    source: path.join(root, "glb_model", "2025_alpine_a525.glb"),
    destination: path.join(root, "apps", "web", "public", "models", "2025", "alpine", "a525.glb"),
  },
  {
    source: path.join(root, "glb_model", "fia_f1_2026_car.glb"),
    destination: path.join(root, "apps", "web", "public", "models", "2026", "fia-spec", "fia-2026.glb"),
  },
];

async function main() {
  for (const mapping of [...MODEL_MAPPINGS, ...DECODER_MAPPINGS]) {
    await mkdir(path.dirname(mapping.destination), { recursive: true });
    await copyFile(mapping.source, mapping.destination);
    process.stdout.write(`Synced ${path.basename(mapping.source)} -> ${path.relative(root, mapping.destination)}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
