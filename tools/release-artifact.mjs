import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  artifactBudgetErrors,
  assertCandidateRoot,
  cachePolicy,
  candidateMarker,
  candidatePaths,
  candidatesRoot,
  mimeType,
  sha256,
  summarizeArtifactMeasurements,
  summarizeReleaseData,
  utcTimestamp,
  walk,
  workspaceRoot,
} from "./release-data.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    options[token.slice(2)] = value;
    index += 1;
  }
  return options;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeReleaseTime(value, fallbackNow = Date.now()) {
  const now = value === undefined ? fallbackNow : Date.parse(value);
  if (!Number.isFinite(now) || (value !== undefined && !utcTimestamp(value))) {
    throw new Error(`Invalid --now timestamp: ${value}`);
  }
  return { now, generatedAt: new Date(now).toISOString() };
}

function runNpm(script, env) {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, "run", script], {
      cwd: workspaceRoot,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`npm run ${script} exited ${code}`)));
  });
}

function gitOutput(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd: workspaceRoot, stdio: ["ignore", "pipe", "inherit"] });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`git ${args.join(" ")} exited ${code}`)));
  });
}

async function assertCleanSource(expectedCommit) {
  const [commit, status] = await Promise.all([
    gitOutput(["rev-parse", "HEAD"]),
    gitOutput(["status", "--porcelain", "--untracked-files=all"]),
  ]);
  if (status) throw new Error("Release artifact requires a clean source revision.");
  if (expectedCommit && commit !== expectedCommit) throw new Error("Source revision changed while building the release candidate.");
  return commit;
}

async function buildEntries(artifactRoot) {
  const entries = [];
  for (const relativePath of (await walk(artifactRoot)).filter((entry) => entry !== "release-manifest.json").sort()) {
    const filePath = path.join(artifactRoot, relativePath);
    entries.push({
      path: relativePath,
      bytes: (await stat(filePath)).size,
      mimeType: mimeType(relativePath),
      cachePolicy: cachePolicy(relativePath),
      sha256: await sha256(filePath),
    });
  }
  return entries;
}

export async function finalizeCandidate(candidateRoot, options = {}) {
  const paths = await assertCandidateRoot(candidateRoot);
  const entries = await buildEntries(paths.artifactRoot);
  if (!entries.length) throw new Error(`Candidate has no built release unit: ${paths.artifactRoot}`);
  const budgetErrors = artifactBudgetErrors(entries);
  if (budgetErrors.length) throw new Error(`Release artifact budget failed:\n${budgetErrors.map((error) => `- ${error}`).join("\n")}`);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sourceCommitValue = options.sourceCommitValue || await gitOutput(["rev-parse", "HEAD"]);
  const assetManifestSha256 = digest(`${JSON.stringify(entries)}\n`);
  const assetReleaseId = `sha256-${assetManifestSha256}`;
  const manifestSha256 = digest(`${sourceCommitValue}\n${JSON.stringify(entries)}\n`);
  const releaseId = `sha256-${manifestSha256}`;
  const measurements = await summarizeArtifactMeasurements(entries, paths.artifactRoot);
  const data = await summarizeReleaseData(paths.artifactRoot);
  const manifest = {
    schemaVersion: 1,
    releaseId,
    assetReleaseId,
    sourceCommit: sourceCommitValue,
    generatedAt,
    manifestSha256,
    assetManifestSha256,
    fileCount: entries.length,
    totalBytes: measurements.outputBytes,
    measurements,
    data,
    entries,
  };
  await writeFile(paths.releaseManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const releaseRecord = {
    schemaVersion: 1,
    releaseId,
    assetReleaseId,
    sourceCommit: sourceCommitValue,
    generatedAt,
    publishedAt: null,
    previousReleaseId: null,
    promotion: null,
    featured: {
      status: data.latestPath ? "featured" : "none",
      path: data.latestPath,
      selectedBy: ["sourceEventEndAt desc", "sessionKey desc", "path asc"],
    },
    manifestSha256,
    gateEvidence: options.gateEvidence || null,
  };
  await writeFile(paths.releaseRecord, `${JSON.stringify(releaseRecord, null, 2)}\n`, "utf8");
  return { paths, manifest, releaseRecord };
}

export async function createCandidate() {
  await mkdir(candidatesRoot, { recursive: true });
  const candidateRoot = await mkdtemp(path.join(candidatesRoot, "candidate-"));
  const paths = candidatePaths(candidateRoot);
  await writeFile(paths.marker, `${JSON.stringify(candidateMarker, null, 2)}\n`, "utf8");
  await mkdir(path.dirname(paths.canonicalData), { recursive: true });
  await cp(path.join(workspaceRoot, "data"), paths.canonicalData, { recursive: true, force: true });
  await cp(path.join(workspaceRoot, "apps", "web", "public"), paths.publicRoot, { recursive: true, force: true });
  return paths;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options["candidate-root"] || process.env.F1_CANDIDATE_ROOT) {
    throw new Error("release:artifact creates a fresh candidate path; use release:data to audit an existing candidate.");
  }
  const { now, generatedAt } = normalizeReleaseTime(options.now);
  const sourceCommitValue = await assertCleanSource();
  const paths = await createCandidate();
  const env = { ...process.env, F1_CANDIDATE_ROOT: paths.root, F1_RELEASE_BUILD_ID: sourceCommitValue };
  const commands = ["quality", "check:featured", "build", "smoke:static"];
  try {
    const { auditCandidate } = await import("./release-data.mjs");
    await auditCandidate(paths.root, { requireReleaseRecord: false, now });
    for (const command of commands) await runNpm(command, env);
    await assertCleanSource(sourceCommitValue);
    const result = await finalizeCandidate(paths.root, {
      sourceCommitValue,
      generatedAt,
      gateEvidence: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        commands: commands.map((command) => ({ command: `npm run ${command}`, status: "passed" })),
      },
    });
    await auditCandidate(paths.root, { now });
    process.stdout.write(`Release artifact candidate passed: ${paths.root}\nRelease ID: ${result.manifest.releaseId}\n`);
  } catch (error) {
    process.stderr.write(`Candidate retained for inspection: ${paths.root}\n`);
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
