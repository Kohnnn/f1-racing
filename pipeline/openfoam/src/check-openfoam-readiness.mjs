import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());

const defaults = {
  inputs: "pipeline/openfoam/config/mcl39-user-inputs.local.json",
  config: "pipeline/openfoam/config/mcl39-baseline-15ms.local.json",
  exampleConfig: "pipeline/openfoam/config/mcl39-baseline-15ms.example.json",
  exampleInputs: "pipeline/openfoam/config/mcl39-user-inputs.example.json",
  stl: "pipeline/openfoam/cases/mcl39-baseline/constant/triSurface/mcl39_clean.stl",
  csv: "pipeline/openfoam/exports/mcl39-baseline-15ms/car-surface.csv",
};

function parseArgs(argv) {
  const args = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--inputs" && next) {
      args.inputs = next;
      index += 1;
    } else if (current === "--config" && next) {
      args.config = next;
      index += 1;
    }
  }

  return args;
}

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

function isPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function parseCsvHeaders(content) {
  const firstLine = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return [];
  }

  return firstLine.split(",").map((item) => item.trim());
}

function formatStatus(ok, label, detail) {
  return `${ok ? "[ok]" : "[missing]"} ${label}${detail ? ` - ${detail}` : ""}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputsPath = path.resolve(root, args.inputs);
  const configPath = path.resolve(root, args.config);
  const exampleConfigPath = path.resolve(root, args.exampleConfig);
  const exampleInputsPath = path.resolve(root, args.exampleInputs);
  const stlPath = path.resolve(root, defaults.stl);
  const csvPath = path.resolve(root, defaults.csv);

  const messages = [];
  let hasMissing = false;

  const inputsExists = await exists(inputsPath);
  messages.push(
    formatStatus(
      inputsExists,
      "Local user-input file",
      inputsExists ? path.relative(root, inputsPath) : `run npm run init:openfoam:local or copy ${path.relative(root, exampleInputsPath)} to ${path.relative(root, inputsPath)}`
    )
  );
  hasMissing ||= !inputsExists;

  const exampleConfigExists = await exists(exampleConfigPath);
  messages.push(formatStatus(exampleConfigExists, "Example overlay config", path.relative(root, exampleConfigPath)));
  hasMissing ||= !exampleConfigExists;

  const stlExists = await exists(stlPath);
  messages.push(formatStatus(stlExists, "Clean STL", path.relative(root, stlPath)));
  hasMissing ||= !stlExists;

  const csvExists = await exists(csvPath);
  messages.push(formatStatus(csvExists, "ParaView surface CSV", path.relative(root, csvPath)));
  hasMissing ||= !csvExists;

  let inputs = null;
  if (inputsExists) {
    inputs = await readJson(inputsPath);
    const licenseReady = inputs.license?.confirmedForWebsite === true;
    const areaReady = isPositiveNumber(inputs.reference?.areaM2);
    const lengthReady = isPositiveNumber(inputs.reference?.lengthM);
    const triangleReady = isPositiveInteger(inputs.meshBinding?.triangleCount);

    messages.push(formatStatus(licenseReady, "License confirmation", licenseReady ? "ready" : "set license.confirmedForWebsite to true after checking the model license"));
    messages.push(formatStatus(areaReady, "Reference area", areaReady ? `${inputs.reference.areaM2} m^2` : "fill reference.areaM2"));
    messages.push(formatStatus(lengthReady, "Reference length", lengthReady ? `${inputs.reference.lengthM} m` : "fill reference.lengthM"));
    messages.push(formatStatus(triangleReady, "Triangle binding", triangleReady ? `${inputs.meshBinding.triangleCount} triangles` : "fill meshBinding.triangleCount"));

    hasMissing ||= !licenseReady || !areaReady || !lengthReady || !triangleReady;
  }

  if (csvExists) {
    const headers = parseCsvHeaders(await readFile(csvPath, "utf-8"));
    const requiredHeaders = ["p", "wallShearStress:0", "wallShearStress:1", "wallShearStress:2"];
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    const csvReady = missingHeaders.length === 0;
    messages.push(
      formatStatus(
        csvReady,
        "CSV headers",
        csvReady ? requiredHeaders.join(", ") : `missing ${missingHeaders.join(", ")}`
      )
    );
    hasMissing ||= !csvReady;
  }

  const configExists = await exists(configPath);
  messages.push(
    formatStatus(
      configExists,
      "Local overlay config",
      configExists ? path.relative(root, configPath) : "run npm run apply:openfoam:inputs after filling the local inputs file"
    )
  );

  if (configExists && inputs) {
    const config = await readJson(configPath);
    const areaMatches = config.reference?.areaM2 === inputs.reference?.areaM2;
    const lengthMatches = config.reference?.lengthM === inputs.reference?.lengthM;
    const triangleMatches = config.meshBinding?.triangleCount === inputs.meshBinding?.triangleCount;

    messages.push(formatStatus(areaMatches, "Config area sync", areaMatches ? "matches local inputs" : "re-run npm run apply:openfoam:inputs"));
    messages.push(formatStatus(lengthMatches, "Config length sync", lengthMatches ? "matches local inputs" : "re-run npm run apply:openfoam:inputs"));
    messages.push(formatStatus(triangleMatches, "Config triangle sync", triangleMatches ? "matches local inputs" : "re-run npm run apply:openfoam:inputs"));

    hasMissing ||= !areaMatches || !lengthMatches || !triangleMatches;
  } else {
    hasMissing ||= !configExists;
  }

  process.stdout.write("OpenFOAM readiness checklist\n");
  process.stdout.write(`${"=".repeat(27)}\n`);
  process.stdout.write(`${messages.join("\n")}\n\n`);

  if (hasMissing) {
    process.stdout.write("Next step\n");
    process.stdout.write("---------\n");
    if (!inputsExists) {
      process.stdout.write(`Run npm run init:openfoam:local, then fill ${path.relative(root, inputsPath)}.\n`);
    } else if (!stlExists) {
      process.stdout.write(`Export your cleaned STL to ${path.relative(root, stlPath)}.\n`);
    } else if (!configExists) {
      process.stdout.write("Run npm run apply:openfoam:inputs after filling the local inputs file.\n");
    } else if (!csvExists) {
      process.stdout.write("Run the OpenFOAM case, export the ParaView surface CSV, then run this check again.\n");
    } else {
      process.stdout.write("Fill the remaining missing items listed above, then run this check again.\n");
    }
    process.exit(1);
  }

  process.stdout.write("Ready. Next command:\n");
  process.stdout.write(`npm run build:openfoam:overlay -- --config ${path.relative(root, configPath)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
