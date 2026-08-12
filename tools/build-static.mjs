import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { candidatePaths, workspaceRoot } from "./release-data.mjs";

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

async function main() {
  const candidateRoot = process.env.F1_CANDIDATE_ROOT;
  if (!candidateRoot) {
    await run("npm", ["run", "next:build", "-w", "@f1-racing/web"], process.env);
    return;
  }
  const paths = candidatePaths(path.resolve(candidateRoot));
  const outRoot = path.join(workspaceRoot, "apps", "web", "out");
  await run("npm", ["run", "next:build", "-w", "@f1-racing/web"], { ...process.env, F1_DATA_ROOT: paths.publicData });
  for (const name of ["data", "models", "posters", "release-manifest.json"]) {
    await rm(path.join(outRoot, name), { recursive: true, force: true });
    await cp(path.join(paths.publicRoot, name), path.join(outRoot, name), { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
