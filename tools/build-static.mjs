import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertCandidateRoot, workspaceRoot } from "./release-data.mjs";

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const executable = command === "npm" ? process.execPath : command;
    const executableArgs = command === "npm"
      ? [process.env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), ...args]
      : args;
    const child = spawn(executable, executableArgs, { cwd: workspaceRoot, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function replacePublicProjection(sourcePublicRoot, candidatePublicRoot, artifactRoot) {
  for (const entry of await readdir(sourcePublicRoot, { withFileTypes: true })) {
    await rm(path.join(artifactRoot, entry.name), { recursive: true, force: true });
  }
  for (const entry of await readdir(candidatePublicRoot, { withFileTypes: true })) {
    const source = path.join(candidatePublicRoot, entry.name);
    const destination = path.join(artifactRoot, entry.name);
    await rm(destination, { recursive: true, force: true });
    await cp(source, destination, { recursive: entry.isDirectory(), force: true });
  }
}

export async function localizeModelViewerFallbacks(artifactRoot) {
  const replacements = new Map([
    ["https://www.gstatic.com/draco/versioned/decoders/1.5.6/", "/draco/"],
    ["https://www.gstatic.com/basis-universal/versioned/2021-04-15-ba1c3e4/", "/basis/"],
    ["https://cdn.jsdelivr.net/npm/three@0.149.0/examples/jsm/loaders/LottieLoader.js", "/lottie/LottieLoader.js"],
  ]);
  const counts = new Map([...replacements.keys()].map((value) => [value, 0]));
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;
      const original = await readFile(filePath, "utf8");
      let localized = original;
      for (const [remote, local] of replacements) {
        const matches = localized.split(remote).length - 1;
        if (!matches) continue;
        counts.set(remote, counts.get(remote) + matches);
        localized = localized.replaceAll(remote, local);
      }
      if (localized !== original) await writeFile(filePath, localized, "utf8");
    }
  }
  await visit(path.join(artifactRoot, "_next", "static", "chunks"));
  for (const [remote, count] of counts) {
    if (!count) throw new Error(`Missing model-viewer fallback during localization: ${remote}`);
  }
}

async function main() {
  const candidateRoot = process.env.F1_CANDIDATE_ROOT;
  if (!candidateRoot) {
    await run("npm", ["run", "next:build", "-w", "@f1-racing/web"], process.env);
    await localizeModelViewerFallbacks(path.join(workspaceRoot, "apps", "web", "out"));
    return;
  }
  const paths = await assertCandidateRoot(candidateRoot);
  const releaseBuildId = process.env.F1_RELEASE_BUILD_ID;
  if (!/^[a-f0-9]{40}$/.test(releaseBuildId ?? "")) throw new Error("Candidate build requires F1_RELEASE_BUILD_ID with the clean source commit.");
  const appRoot = path.join(workspaceRoot, "apps", "web");
  const relativeBuildRoot = path.join(".release-builds", path.basename(paths.root));
  const buildRoot = path.join(appRoot, relativeBuildRoot);
  await rm(buildRoot, { recursive: true, force: true });
  await rm(paths.artifactRoot, { recursive: true, force: true });
  try {
    await run("npm", ["run", "next:build", "-w", "@f1-racing/web"], {
      ...process.env,
      F1_DATA_ROOT: paths.publicData,
      F1_NEXT_DIST_DIR: relativeBuildRoot,
      F1_RELEASE_BUILD_ID: releaseBuildId,
    });
    await mkdir(path.dirname(paths.artifactRoot), { recursive: true });
    await cp(buildRoot, paths.artifactRoot, { recursive: true, force: true });
    await replacePublicProjection(path.join(appRoot, "public"), paths.publicRoot, paths.artifactRoot);
    await localizeModelViewerFallbacks(paths.artifactRoot);
    await rm(paths.releaseManifest, { force: true });
  } finally {
    await rm(buildRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
