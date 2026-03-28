import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());

const defaults = {
  inputs: "pipeline/openfoam/config/mcl39-user-inputs.local.json",
  exampleConfig: "pipeline/openfoam/config/mcl39-baseline-15ms.example.json",
  output: "pipeline/openfoam/config/mcl39-baseline-15ms.local.json",
};

function parseArgs(argv) {
  const args = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--inputs" && next) {
      args.inputs = next;
      index += 1;
    } else if (current === "--example-config" && next) {
      args.exampleConfig = next;
      index += 1;
    } else if (current === "--output" && next) {
      args.output = next;
      index += 1;
    }
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

function assertPositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected ${label} to be a positive number.`);
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected ${label} to be a positive integer.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputsPath = path.resolve(root, args.inputs);
  const exampleConfigPath = path.resolve(root, args.exampleConfig);
  const outputPath = path.resolve(root, args.output);

  const inputs = await readJson(inputsPath);
  const config = await readJson(exampleConfigPath);

  assertPositiveNumber(inputs.reference?.areaM2, "reference.areaM2");
  assertPositiveNumber(inputs.reference?.lengthM, "reference.lengthM");
  assertPositiveInteger(inputs.meshBinding?.triangleCount, "meshBinding.triangleCount");

  const nextConfig = {
    ...config,
    generatedAt: new Date().toISOString(),
    reference: {
      ...config.reference,
      areaM2: inputs.reference.areaM2,
      lengthM: inputs.reference.lengthM,
    },
    meshBinding: {
      ...config.meshBinding,
      triangleCount: inputs.meshBinding.triangleCount,
    },
    source: {
      ...config.source,
      notes: Array.from(
        new Set([
          ...(config.source?.notes ?? []),
          inputs.license?.confirmedForWebsite
            ? "Local inputs file marks the source-model license as checked for website use."
            : "Local inputs file still needs a positive website-license confirmation.",
        ])
      ),
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf-8");

  process.stdout.write(`Wrote local overlay config: ${path.relative(root, outputPath)}\n`);
  process.stdout.write("Use this for the build command after your STL and CSV are ready.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
