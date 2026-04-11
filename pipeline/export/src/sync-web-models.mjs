import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());

const MODEL_MAPPINGS = [
  {
    source: path.join(root, "glb_model", "f1_2025_rb21.glb"),
    destination: path.join(root, "apps", "web", "public", "models", "2025", "red-bull", "rb21.glb"),
  },
  {
    source: path.join(root, "glb_model", "f1_2025_apx_gp_apx01.glb"),
    destination: path.join(root, "apps", "web", "public", "models", "2025", "apx-gp", "apx01.glb"),
  },
  {
    source: path.join(root, "glb_model", "f1_2025_mclaren_mcl39-compressed.glb"),
    destination: path.join(root, "apps", "web", "public", "models", "2025", "mclaren", "mcl39.glb"),
  },
];

async function main() {
  for (const mapping of MODEL_MAPPINGS) {
    await mkdir(path.dirname(mapping.destination), { recursive: true });
    await copyFile(mapping.source, mapping.destination);
    process.stdout.write(`Synced ${path.basename(mapping.source)} -> ${path.relative(root, mapping.destination)}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
