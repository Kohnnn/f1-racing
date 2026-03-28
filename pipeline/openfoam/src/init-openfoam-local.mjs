import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());

const exampleRelativePath = "pipeline/openfoam/config/mcl39-user-inputs.example.json";
const localRelativePath = "pipeline/openfoam/config/mcl39-user-inputs.local.json";

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const examplePath = path.resolve(root, exampleRelativePath);
  const localPath = path.resolve(root, localRelativePath);

  if (await exists(localPath)) {
    process.stdout.write(`Local inputs already exist: ${localRelativePath}\n`);
    return;
  }

  await mkdir(path.dirname(localPath), { recursive: true });
  await copyFile(examplePath, localPath);
  process.stdout.write(`Created local inputs file: ${localRelativePath}\n`);
  process.stdout.write("Fill the null values, then run npm run check:openfoam:ready\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
