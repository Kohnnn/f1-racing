import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditCandidate, candidatePaths, candidateRootFrom, sha256, workspaceRoot } from "./release-data.mjs";

const execFileAsync = promisify(execFile);

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

async function walk(directory, prefix = "") {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath.split(path.sep).join("/"));
  }
  return files;
}

function mimeType(relativePath) {
  if (relativePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (relativePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (relativePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (relativePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (relativePath.endsWith(".svg")) return "image/svg+xml";
  if (relativePath.endsWith(".glb")) return "model/gltf-binary";
  if (relativePath.endsWith(".webp")) return "image/webp";
  if (relativePath.endsWith(".woff") || relativePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function cachePolicy(relativePath) {
  return relativePath === "release-manifest.json" || relativePath.endsWith(".html")
    ? "no-cache"
    : "public, max-age=31536000, immutable";
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sourceCommit() {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspaceRoot });
  return stdout.trim();
}

function isInside(target, parent) {
  const relative = path.relative(parent, target);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function buildManifest(paths) {
  const entries = await Promise.all((await walk(paths.publicRoot))
    .filter((relativePath) => relativePath !== "release-manifest.json")
    .sort()
    .map(async (relativePath) => ({
      path: relativePath,
      bytes: (await stat(path.join(paths.publicRoot, relativePath))).size,
      mimeType: mimeType(relativePath),
      cachePolicy: cachePolicy(relativePath),
      sha256: await sha256(path.join(paths.publicRoot, relativePath)),
    })));
  const manifestSha256 = digest(`${JSON.stringify(entries)}\n`);
  const releaseId = `sha256-${manifestSha256}`;
  const manifest = {
    schemaVersion: 1,
    releaseId,
    sourceCommit: await sourceCommit(),
    generatedAt: new Date().toISOString(),
    manifestSha256,
    fileCount: entries.length,
    totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    entries,
  };
  await writeFile(paths.releaseManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function finalizeCandidate(candidateRoot) {
  const paths = candidatePaths(candidateRoot);
  const manifest = await buildManifest(paths);
  const sourceCommitValue = await sourceCommit();
  await writeFile(paths.releaseRecord, `${JSON.stringify({
    schemaVersion: 1,
    releaseId: manifest.releaseId,
    assetReleaseId: manifest.releaseId,
    sourceCommit: sourceCommitValue,
    generatedAt: new Date().toISOString(),
    publishedAt: null,
    previousReleaseId: null,
    promotion: null,
    featured: { status: "none", path: null, selectedBy: ["sourceEventEndAt desc", "sessionKey desc", "path asc"] },
    manifestSha256: manifest.manifestSha256,
    gateEvidence: null,
  }, null, 2)}\n`, "utf8");
  return { paths, manifest };
}

export async function stageCandidate(candidateRoot) {
  const paths = candidatePaths(candidateRoot);
  const canonicalSource = path.join(workspaceRoot, "data");
  const publicSource = path.join(workspaceRoot, "apps", "web", "public");
  if (isInside(candidateRoot, canonicalSource) || isInside(candidateRoot, publicSource)) {
    throw new Error("Candidate root must be outside data and apps/web/public.");
  }
  await rm(candidateRoot, { recursive: true, force: true });
  await mkdir(candidateRoot, { recursive: true });
  await cp(canonicalSource, paths.canonicalData, { recursive: true, force: true });
  await cp(publicSource, paths.publicRoot, { recursive: true, force: true });
  return finalizeCandidate(candidateRoot);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidateRoot = candidateRootFrom(options);
  await stageCandidate(candidateRoot);
  await auditCandidate(candidateRoot, { now: options.now ? Date.parse(options.now) : Date.now() });
  process.stdout.write(`Release artifact candidate passed: ${candidateRoot}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
