import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const dataRoot = path.join(root, "data");
const publicRoot = path.join(root, "apps", "web", "public", "data");

function parseArgs(argv) {
  const args = {
    config: "pipeline/openfoam/config/mcl39-baseline-15ms.example.json",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--config") {
      args.config = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

async function readJson(filePath) {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content);
}

function resolveFromConfig(configPath, targetPath) {
  if (!targetPath) {
    return null;
  }

  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  return path.resolve(path.dirname(configPath), targetPath);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(content) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV input must include a header row and at least one data row.");
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((record, header, index) => {
      record[header] = values[index] ?? "";
      return record;
    }, {});
  });

  return { headers, rows };
}

function getNumericValue(rawValue, context) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Expected numeric value for ${context}, received '${rawValue}'.`);
  }
  return numeric;
}

function getScalarValue(row, scalarInput) {
  if (scalarInput.valueColumn) {
    return getNumericValue(row[scalarInput.valueColumn], `${scalarInput.name}.${scalarInput.valueColumn}`);
  }

  if (scalarInput.vectorColumns?.length === 3) {
    const [xColumn, yColumn, zColumn] = scalarInput.vectorColumns;
    const x = getNumericValue(row[xColumn], `${scalarInput.name}.${xColumn}`);
    const y = getNumericValue(row[yColumn], `${scalarInput.name}.${yColumn}`);
    const z = getNumericValue(row[zColumn], `${scalarInput.name}.${zColumn}`);
    return Math.sqrt((x * x) + (y * y) + (z * z));
  }

  throw new Error(`Scalar input '${scalarInput.name}' must define valueColumn or vectorColumns.`);
}

function normalizeValue(rawValue, scalarInput, config) {
  const speedSquared = config.inputs.speedMps ** 2;
  const offset = scalarInput.offset ?? 0;
  const scale = scalarInput.scale ?? 1;

  if (scalarInput.normalizeAs === "cp") {
    const referencePressure = config.reference.kinematicPressureRef ?? 0;
    return (((2 * (rawValue - referencePressure)) / speedSquared) * scale) + offset;
  }

  if (scalarInput.normalizeAs === "cf") {
    return (((2 * rawValue) / speedSquared) * scale) + offset;
  }

  return (rawValue * scale) + offset;
}

function summarize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    min: Number(min.toFixed(6)),
    max: Number(max.toFixed(6)),
    mean: Number(mean.toFixed(6)),
  };
}

async function writeMirrored(relativePath, content) {
  const dataPath = path.join(dataRoot, relativePath);
  const publicPath = path.join(publicRoot, relativePath);

  await mkdir(path.dirname(dataPath), { recursive: true });
  await mkdir(path.dirname(publicPath), { recursive: true });
  await writeFile(dataPath, content, "utf-8");
  await writeFile(publicPath, content, "utf-8");
}

function toPublicDataPath(relativePath) {
  return `/data/${relativePath.replace(/\\/g, "/")}`;
}

async function buildPack(configPath) {
  const config = await readJson(configPath);

  if (!config.modelId || !config.scenarioId) {
    throw new Error("Config must include modelId and scenarioId.");
  }

  if (!config.output?.packRelativePath || !config.output?.assetDirectory) {
    throw new Error("Config must include output.packRelativePath and output.assetDirectory.");
  }

  if (!Array.isArray(config.scalarInputs) || config.scalarInputs.length === 0) {
    throw new Error("Config must include at least one scalarInputs entry.");
  }

  const scalarFields = [];
  for (const scalarInput of config.scalarInputs) {
    const sourcePath = resolveFromConfig(configPath, scalarInput.sourcePath);
    if (!sourcePath) {
      throw new Error(`Scalar input '${scalarInput.name}' is missing sourcePath.`);
    }

    const csv = parseCsv(await readFile(sourcePath, "utf-8"));
    const derivedRows = csv.rows.map((row, index) => {
      const rawValue = getScalarValue(row, scalarInput);
      const value = normalizeValue(rawValue, scalarInput, config);
      const sampleId = scalarInput.sampleIdColumn ? row[scalarInput.sampleIdColumn] : String(index);
      return {
        sampleId,
        value: Number(value.toFixed(6)),
      };
    });

    const stats = summarize(derivedRows.map((row) => row.value));
    const assetRelativePath = path.join(config.output.assetDirectory, `${scalarInput.name}.csv`);
    const assetContent = ["sampleId,value", ...derivedRows.map((row) => `${row.sampleId},${row.value}`)].join("\n");
    await writeMirrored(assetRelativePath, `${assetContent}\n`);

    scalarFields.push({
      name: scalarInput.name,
      domain: scalarInput.domain,
      sourceField: scalarInput.sourceField,
      transform: scalarInput.normalizeAs || "direct",
      stats,
      storage: {
        format: "csv",
        path: toPublicDataPath(assetRelativePath),
        valueColumn: "value",
      },
    });
  }

  const pack = {
    schemaVersion: 1,
    generatedAt: config.generatedAt ?? new Date().toISOString(),
    modelId: config.modelId,
    scenarioId: config.scenarioId,
    displayName: config.displayName,
    metric: config.metric,
    units: config.units,
    source: config.source,
    inputs: config.inputs,
    reference: config.reference,
    meshBinding: config.meshBinding,
    colorScale: config.colorScale,
    scalarFields,
    overlays: config.overlays ?? {
      streamlines: [],
      hotspots: [],
    },
    artifacts: config.artifacts,
    summary: config.summary,
  };

  await writeMirrored(config.output.packRelativePath, `${JSON.stringify(pack, null, 2)}\n`);
  return {
    pack,
    outputPath: path.join(dataRoot, config.output.packRelativePath),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(root, args.config);
  const result = await buildPack(configPath);
  process.stdout.write(`Built CFD overlay pack: ${result.pack.scenarioId}\n`);
  process.stdout.write(`Output JSON: ${result.outputPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
