import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { auditCandidate, cachePolicy, candidateRootFrom, canonicalHostname, mimeType, utcTimestamp, walk, workspaceRoot } from "./release-data.mjs";
const execFileAsync = promisify(execFile);
export const netlifySiteId = "d783914b-0638-46bc-ae4b-371b66cca51e";
const textExtensions = new Set([".css", ".csv", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".webmanifest", ".xml", ".yml", ".yaml"]);
const secretFilePattern = /(?:^|\/)(?:\.env(?:\.|$)|[^/]*(?:secret|credential|private[-_]?key|token)[^/]*)(?:$|\/)/i;
const secretPatterns = [
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i,
  /(?:AKIA|ASIA)[A-Z0-9]{16}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/,
  /(?:netlify|ntl)[-_]?(?:api[-_]?key|token)?[=:"'\s]+[A-Za-z0-9_-]{20,}/i,
  /C:\\Users\\/i,
  /(?:^|[^A-Za-z])\/(?:Users|home)\//,
  /(?:npm run|node\s+tools\/|python\s+-m\s+)(?:release|build|deploy|publish)[\w:.-]*/i,
  /(?:navigator\.)?sendBeacon\s*\(|\bgtag\s*\(|\bdataLayer\s*(?:\.|\[|=)|\/(?:api\/)?analytics(?:\/|\b)|(?:google-analytics\.com|googletagmanager\.com|sentry\.io|segment\.com|plausible\.io|mixpanel\.com|amplitude\.com)\b/i,
  /(?:gstatic\.com|googleapis\.com).*draco|draco.*(?:gstatic\.com|googleapis\.com)/i,
  /sourceMappingURL\s*=/i,
];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizePathname(value) {
  const pathname = decodeURIComponent(value);
  if (!pathname.startsWith("/") || pathname.includes("\\") || pathname.includes("\0") || pathname.split("/").includes("..")) {
    throw new Error(`Unsafe remote path: ${value}`);
  }
  return pathname;
}

export function safeRemotePath(value) {
  return normalizePathname(value);
}

export function validateTargetUrl(value, { immutable = false } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid release URL: ${value}`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`Release URL must be HTTPS with no credentials, query, or hash: ${value}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "f1-demo.netlify.app" && !hostname.endsWith("--f1-demo.netlify.app")) {
    throw new Error(`Release URL hostname is not approved: ${hostname}`);
  }
  if (parsed.pathname !== "/") throw new Error(`Release URL must not include a path: ${value}`);
  if (immutable && !/^[a-f0-9]{24}--f1-demo\.netlify\.app$/.test(hostname)) {
    throw new Error("Deploy permalink must begin with its 24-character Netlify deploy ID.");
  }
  return `https://${hostname}`;
}

export function normalizeContentType(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

export function normalizeCacheControl(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(", ");
}

export function validateRedirectTarget(location, expectedPath, sourceUrl) {
  if (!location) throw new Error("Redirect lacks a Location header.");
  const target = new URL(location, sourceUrl);
  if (target.origin !== new URL(sourceUrl).origin || target.pathname !== expectedPath) {
    throw new Error(`Unexpected redirect target: ${location}`);
  }
  return target;
}

export function validateDeployMetadata(metadata, target, deployPermalink) {
  const normalizedTarget = validateTargetUrl(target);
  const immutable = validateTargetUrl(deployPermalink, { immutable: true });
  const deployId = new URL(immutable).hostname.split("--", 1)[0];
  const providerPermalink = metadata?.deploy_ssl_url || metadata?.links?.permalink;
  const canonicalAlias = metadata?.links?.alias || metadata?.ssl_url;
  if (metadata?.id !== deployId || !/^[a-f0-9]{24}$/.test(metadata?.id ?? "")) throw new Error("Netlify deploy metadata ID does not match the deploy permalink.");
  if (metadata?.site_id !== netlifySiteId) throw new Error("Netlify deploy metadata belongs to the wrong site.");
  if (!new Set(["active", "ready"]).has(metadata?.state)) throw new Error(`Netlify deploy is not ready: ${metadata?.state}.`);
  if (validateTargetUrl(providerPermalink, { immutable: true }) !== immutable) throw new Error("Netlify deploy metadata permalink does not match.");
  if (metadata?.published_at !== null && metadata?.published_at !== undefined && !utcTimestamp(metadata.published_at)) throw new Error("Netlify deploy metadata has an invalid published_at.");
  if (normalizedTarget === canonicalHostname) {
    if (metadata?.context !== "production") throw new Error("Netlify canonical deploy metadata is not production context.");
    if (metadata?.draft === true) throw new Error("Netlify canonical deploy metadata identifies a draft deploy.");
    if (!utcTimestamp(metadata?.published_at)) throw new Error("Netlify production deploy metadata lacks published_at.");
    if (validateTargetUrl(canonicalAlias) !== canonicalHostname) throw new Error("Netlify production alias does not match the canonical hostname.");
  } else {
    if (normalizedTarget !== immutable) throw new Error("Preview parity target must be the immutable deploy permalink.");
    if (metadata?.draft !== true) throw new Error("Netlify preview deploy metadata does not identify a draft deploy.");
    if (metadata?.published_at !== null && metadata?.published_at !== undefined) throw new Error("Netlify preview deploy metadata is already published.");
  }
  return {
    deployId,
    siteId: metadata.site_id,
    state: metadata.state,
    context: metadata.context ?? null,
    draft: metadata.draft ?? null,
    deployPermalink: immutable,
    canonicalAlias: normalizedTarget === canonicalHostname ? canonicalHostname : null,
    publishedAt: metadata.published_at ?? null,
  };
}

async function runNetlifyCli(args) {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const npxCli = path.join(path.dirname(npmCli), "npx-cli.js");
  try {
    const { stdout } = await execFileAsync(process.execPath, [npxCli, "--no-install", "netlify", ...args], {
      cwd: path.join(workspaceRoot, "apps", "web"),
      encoding: "utf8",
      env: process.env,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    const code = typeof error?.code === "number" || /^[A-Z0-9]+$/.test(error?.code ?? "") ? ` (${error.code})` : "";
    throw new Error(`Netlify CLI deploy metadata query failed${code}.`);
  }
}

export async function loadNetlifyDeployMetadata(deployPermalink, runner = runNetlifyCli) {
  const immutable = validateTargetUrl(deployPermalink, { immutable: true });
  const deployId = new URL(immutable).hostname.split("--", 1)[0];
  const output = await runner(["api", "getDeploy", "--data", JSON.stringify({ deploy_id: deployId })]);
  let metadata;
  try {
    metadata = JSON.parse(output);
  } catch {
    throw new Error("Netlify CLI deploy metadata response is not JSON.");
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("Netlify CLI deploy metadata response is invalid.");
  return metadata;
}

export async function assertPermanentRedirect(target, from, to, search = "?proof=1") {
  const response = await fetch(`${target}${from}${search}`, { redirect: "manual" });
  if (![301, 308].includes(response.status)) throw new Error(`${from} is not a permanent redirect.`);
  const redirected = validateRedirectTarget(response.headers.get("location"), to, target);
  if (redirected.search !== search) throw new Error(`${from} redirect does not preserve the query.`);
  return { from, to, status: response.status, location: redirected.toString() };
}

export function releaseRedirects(latest) {
  const redirects = [["/live", "/race-desk"], ["/sessions", "/replay"]];
  if (latest?.latest?.path) redirects.push([latest.latest.path, latest.latest.path.replace(/^\/sessions\//, "/replay/")]);
  return redirects;
}

export function createSecretScanner() {
  let tail = "";
  return {
    scan(chunk) {
      const text = tail + Buffer.from(chunk).toString("utf8");
      const match = secretPatterns.find((pattern) => pattern.test(text));
      tail = text.slice(-512);
      return match ? match.toString() : null;
    },
  };
}

function sourcePathForSession(sessionPath) {
  const segments = sessionPath.replace(/^\/sessions\//, "").split("/");
  if (segments.length !== 3 || segments.some((part) => !/^[a-z0-9-]+$/i.test(part))) throw new Error(`Invalid session path: ${sessionPath}`);
  return `data/packs/seasons/${segments.join("/")}`;
}

function htmlAssets(html) {
  const values = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    const value = match[1];
    if (value.startsWith("/") && !value.startsWith("//")) values.add(value.slice(1).split(/[?#]/, 1)[0]);
  }
  return [...values].sort();
}

export function selectCriticalSamples(manifest, rootHtml, latest, replayHtml = "") {
  const entries = new Map((manifest.entries || []).map((entry) => [entry.path, entry]));
  const include = new Set(["index.html", "replay/index.html", "data/manifests/latest.json", "data/manifests/seasons.json"]);
  for (const asset of [...htmlAssets(rootHtml), ...htmlAssets(replayHtml)]) if (entries.has(asset)) include.add(asset);
  if (latest?.latest?.path) {
    const base = sourcePathForSession(latest.latest.path);
    const replayPage = `${latest.latest.path.replace(/^\/sessions\//, "replay/")}/index.html`;
    if (entries.has(replayPage)) include.add(replayPage);
    for (const suffix of ["replay.meta.json", "replay.laps.json", "replay.race-control.json"]) {
      if (entries.has(`${base}/${suffix}`)) include.add(`${base}/${suffix}`);
    }
    const chunks = (manifest.entries || [])
      .filter((entry) => entry.path.startsWith(`${base}/replay.frames/`) && entry.path.endsWith(".json"))
      .sort((left, right) => left.path.localeCompare(right.path));
    for (const entry of chunks) include.add(entry.path);
  }
  for (const prefix of ["fonts/", "data/silhouettes/", "posters/"]) {
    const entry = (manifest.entries || []).find((candidate) => candidate.path.startsWith(prefix));
    if (entry) include.add(entry.path);
  }
  for (const entry of (manifest.entries || []).filter((entry) => entry.path.endsWith(".glb")).sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path)).slice(0, 2)) include.add(entry.path);
  return [...include].filter((entry) => entries.has(entry)).sort();
}

function parseHeaders(text) {
  const rules = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      current = line.trim();
      rules.set(current, new Map());
    } else if (current) {
      const split = line.trim().indexOf(":");
      if (split > 0) rules.get(current).set(line.trim().slice(0, split).toLowerCase(), line.trim().slice(split + 1).trim());
    }
  }
  return rules;
}

const reviewedSecurityHeaders = Object.freeze({
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' blob: https://f1-api.129.150.58.64.sslip.io wss://f1-api.129.150.58.64.sslip.io; worker-src 'self' blob:; child-src 'self' blob:",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), fullscreen=(self), xr-spatial-tracking=(self)",
});

const reviewedCacheRules = Object.freeze({
  "/_next/static/*": "public, max-age=31536000, immutable",
  "/data/manifests/*": "public, max-age=60",
  "/data/packs/*": "public, max-age=300",
  "/data/silhouettes/*": "public, max-age=300",
  "/models/*": "public, max-age=86400",
  "/posters/*": "public, max-age=86400",
  "/*": "no-cache",
});

function headerValue(headers, name) {
  return typeof headers?.get === "function" ? headers.get(name) : headers?.[name] || headers?.[name.toLowerCase()];
}

export function headerPolicyFromText(text) {
  const rules = parseHeaders(text);
  const root = rules.get("/*");
  if (!root) throw new Error("_headers lacks a reviewed /* rule.");
  for (const [name, expected] of Object.entries(reviewedSecurityHeaders)) {
    if (root.get(name) !== expected) throw new Error(`_headers must set exact ${name}.`);
  }
  for (const [rule, expected] of Object.entries(reviewedCacheRules)) {
    if (normalizeCacheControl(rules.get(rule)?.get("cache-control")) !== normalizeCacheControl(expected)) throw new Error(`_headers cache rule missing: ${rule}.`);
  }
  return Object.freeze({ security: Object.fromEntries(Object.entries(reviewedSecurityHeaders)), cacheRules: Object.fromEntries(Object.entries(reviewedCacheRules)) });
}

export function assertResponseHeaderPolicy(headers, policy, requestPath, expectedCacheControl = cachePolicy(requestPath === "/" ? "index.html" : requestPath.slice(1))) {
  for (const [name, expected] of Object.entries(policy.security)) {
    if (headerValue(headers, name) !== expected) throw new Error(`${requestPath} ${name} does not match the reviewed policy.`);
  }
  if (normalizeCacheControl(headerValue(headers, "cache-control")) !== normalizeCacheControl(expectedCacheControl)) {
    throw new Error(`${requestPath} Cache-Control does not match the release manifest.`);
  }
}

export function allowedNetworkOrigins(csp) {
  const connectSource = csp.split(";").find((directive) => directive.trim().startsWith("connect-src")) || "";
  return new Set(connectSource.trim().split(/\s+/).slice(1).filter((source) => /^wss?:|^https?:/.test(source)));
}

async function createEvidenceDirectory(paths, gate) {
  const stagingRoot = path.join(paths.root, "evidence", ".staging");
  await mkdir(stagingRoot, { recursive: true });
  return mkdtemp(path.join(stagingRoot, `${gate}-`));
}

export async function auditEvidence(directory) {
  const index = JSON.parse(await readFile(path.join(directory, "evidence-index.json"), "utf8"));
  const report = JSON.parse(await readFile(path.join(directory, "report.json"), "utf8"));
  const entries = [];
  for (const relativePath of (await walk(directory)).filter((entry) => entry !== "evidence-index.json").sort()) {
    const bytes = await readFile(path.join(directory, relativePath));
    entries.push({ path: relativePath, bytes: bytes.length, sha256: digest(bytes) });
  }
  const evidenceSha256 = digest(`${JSON.stringify(entries)}\n`);
  const metadataMatches = index.gate === report.gate
    && index.releaseId === report.manifestReleaseId
    && index.manifestSha256 === report.manifestSha256
    && path.basename(directory) === index.evidenceId
    && path.basename(path.dirname(directory)) === index.gate
    && path.basename(path.dirname(path.dirname(directory))) === index.releaseId;
  if (!metadataMatches || index.schemaVersion !== 1 || index.evidenceSha256 !== evidenceSha256 || index.evidenceId !== `sha256-${evidenceSha256}` || JSON.stringify(stable(index.entries)) !== JSON.stringify(stable(entries))) {
    throw new Error(`Evidence digest mismatch: ${directory}`);
  }
  return index;
}

export async function finalizeEvidence(paths, gate, directory, report, manifest) {
  await writeFile(path.join(directory, "report.json"), `${JSON.stringify(stable(report), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const entries = [];
  for (const relativePath of (await walk(directory)).sort()) {
    const bytes = await readFile(path.join(directory, relativePath));
    entries.push({ path: relativePath, bytes: bytes.length, sha256: digest(bytes) });
  }
  const evidenceSha256 = digest(`${JSON.stringify(entries)}\n`);
  const evidenceId = `sha256-${evidenceSha256}`;
  const index = {
    schemaVersion: 1,
    evidenceId,
    evidenceSha256,
    gate,
    releaseId: manifest.releaseId,
    manifestSha256: manifest.manifestSha256,
    entries,
  };
  await writeFile(path.join(directory, "evidence-index.json"), `${JSON.stringify(stable(index), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const parent = path.join(paths.root, "evidence", manifest.releaseId, gate);
  const destination = path.join(parent, evidenceId);
  await mkdir(parent, { recursive: true });
  try {
    await rename(directory, destination);
  } catch (error) {
    if (!new Set(["EEXIST", "EPERM"]).has(error?.code)) throw error;
    await rm(directory, { recursive: true, force: true });
    throw new Error(`Immutable ${gate} evidence already exists: ${destination}`);
  }
  await auditEvidence(destination);
  return destination;
}

export async function runEvidenceGate(paths, gate, manifest, baseReport, action) {
  const directory = await createEvidenceDirectory(paths, gate);
  const report = {
    ...baseReport,
    gate,
    candidate: paths.root,
    manifestReleaseId: manifest.releaseId,
    manifestSha256: manifest.manifestSha256,
  };
  let failure = null;
  try {
    await action(directory, report);
    report.status = "passed";
  } catch (error) {
    failure = error;
    report.status = "failed";
    report.error = {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  let evidencePath;
  try {
    evidencePath = await finalizeEvidence(paths, gate, directory, report, manifest);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  if (failure) {
    const error = new Error(`${report.error.message}\nEvidence: ${evidencePath}`);
    error.evidence = evidencePath;
    throw error;
  }
  return { ...report, evidence: evidencePath };
}

async function loadManifest(paths) {
  return JSON.parse(await readFile(paths.releaseManifest, "utf8"));
}

async function scanSecurity(paths) {
  const files = await walk(paths.artifactRoot);
  const findings = [];
  for (const relativePath of files) {
    if (secretFilePattern.test(relativePath)) findings.push(`${relativePath}: suspicious secret-bearing filename`);
    if (relativePath.endsWith(".map")) findings.push(`${relativePath}: source maps are forbidden`);
    const filePath = path.join(paths.artifactRoot, relativePath);
    if (!textExtensions.has(path.extname(relativePath).toLowerCase())) continue;
    const scanner = createSecretScanner();
    const handle = await (await import("node:fs/promises")).open(filePath, "r");
    try {
      const buffer = Buffer.alloc(32768);
      let position = 0;
      while (true) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        position += bytesRead;
        const match = scanner.scan(buffer.subarray(0, bytesRead));
        if (match) {
          findings.push(`${relativePath}: forbidden content ${match}`);
          break;
        }
      }
    } finally {
      await handle.close();
    }
  }
  const headers = await readFile(path.join(paths.artifactRoot, "_headers"), "utf8");
  headerPolicyFromText(headers);
  const draco = ["draco/draco_decoder.js", "draco/draco_decoder.wasm", "draco/draco_wasm_wrapper.js"];
  for (const relativePath of draco) {
    try {
      if ((await stat(path.join(paths.artifactRoot, relativePath))).size <= 0) findings.push(`${relativePath}: empty Draco decoder asset`);
    } catch {
      findings.push(`${relativePath}: missing local Draco decoder asset`);
    }
  }
  return { files: files.length, findings, draco };
}

function resolveLocal(root, requestUrl) {
  const pathname = normalizePathname(new URL(requestUrl, "http://127.0.0.1").pathname);
  let filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;
  return filePath;
}

async function localServer(root) {
  const server = createServer(async (request, response) => {
    try {
      let filePath = resolveLocal(root, request.url || "/");
      if (!filePath) throw new Error("forbidden");
      if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, "index.html");
      const relativePath = path.relative(root, filePath).split(path.sep).join("/");
      const data = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": mimeType(relativePath),
        "Cache-Control": cachePolicy(relativePath),
        ...Object.fromEntries(Object.entries(reviewedSecurityHeaders).map(([name, value]) => [name, value])),
      }).end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local gate server did not bind.");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function fetchChecked(url, requestPath, options = {}) {
  normalizePathname(requestPath);
  const response = await fetch(`${url}${requestPath}`, { redirect: options.redirect || "error", headers: { "Accept-Encoding": "identity" } });
  if (!response.ok) throw new Error(`${requestPath} returned ${response.status}.`);
  return response;
}

async function validateRemoteHeaders(target, manifest, policy) {
  const interesting = new Set(["/", "/release-manifest.json"]);
  for (const prefix of ["_next/static/", "data/manifests/", "data/packs/", "data/silhouettes/", "models/", "posters/"]) {
    const entry = manifest.entries.find((candidate) => candidate.path.startsWith(prefix));
    if (entry) interesting.add(`/${entry.path}`);
  }
  const results = [];
  for (const requestPath of interesting) {
    const response = await fetchChecked(target, requestPath);
    const entry = manifest.entries.find((candidate) => `/${candidate.path}` === requestPath);
    assertResponseHeaderPolicy(response.headers, policy, requestPath, entry?.cachePolicy || cachePolicy(requestPath === "/" ? "index.html" : requestPath.slice(1)));
    results.push({ path: requestPath, status: response.status, contentType: normalizeContentType(response.headers.get("content-type")), cacheControl: normalizeCacheControl(response.headers.get("cache-control")) });
  }
  return results;
}

async function securityGate(paths, target) {
  const manifest = await loadManifest(paths);
  return runEvidenceGate(paths, "security", manifest, { target: target || "local" }, async (_evidence, report) => {
    const headers = await readFile(path.join(paths.artifactRoot, "_headers"), "utf8");
    const policy = headerPolicyFromText(headers);
    report.local = await scanSecurity(paths);
    if (target) report.remote = await validateRemoteHeaders(target, manifest, policy);
    if (report.local.findings.length) throw new Error(`Security gate failed:\n${report.local.findings.map((item) => `- ${item}`).join("\n")}`);
  });
}

function routeDirectory(route) {
  return route === "/" ? "index.html" : `${route.slice(1)}/index.html`;
}

export function evidenceFileName(browserName, viewport, route) {
  const label = new URL(route, canonicalHostname).pathname.replace(/[^a-z0-9]+/gi, "-") || "root";
  return `${browserName}-${viewport.width}x${viewport.height}-${label}-${digest(route).slice(0, 12)}`;
}

export function isAnalyticsRequest(value) {
  const url = new URL(value);
  return /(?:google-analytics\.com|googletagmanager\.com|sentry\.io|segment\.com|plausible\.io|mixpanel\.com|amplitude\.com)$/i.test(url.hostname)
    || /\/(?:api\/)?(?:analytics|collect|events?|beacon|track)(?:\/|$)/i.test(url.pathname);
}

async function assertVisibleFocus(locator, label) {
  const visible = await locator.evaluate((element) => {
    if (element !== document.activeElement) return false;
    const style = getComputedStyle(element);
    return (style.outlineStyle !== "none" && style.outlineWidth !== "0px") || style.boxShadow !== "none";
  });
  if (!visible) throw new Error(`${label} lacks visible keyboard focus.`);
}

async function browserFailureProbes(browser, baseUrl, replayPath, evidence, browserName) {
  const probes = [
    ...(replayPath ? [
      { name: "replay-chunk", route: replayPath, match: "/replay.frames/" },
      { name: "replay-3d", route: replayPath, match: "/replay-3d/" },
    ] : []),
    { name: "model-glb", route: "/cars/current-spec/", match: "/models/" },
  ];
  const results = [];
  for (const probe of probes) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const diagnostics = [];
    let injected = 0;
    page.on("request", (request) => diagnostics.push({ type: "request", method: request.method(), url: request.url() }));
    page.on("response", (response) => diagnostics.push({ type: "response", status: response.status(), url: response.url() }));
    page.on("requestfailed", (request) => diagnostics.push({ type: "requestfailed", text: request.failure()?.errorText || "failed", url: request.url() }));
    page.on("console", (message) => diagnostics.push({ type: "console", level: message.type(), text: message.text() }));
    page.on("pageerror", (error) => diagnostics.push({ type: "pageerror", text: error.message }));
    page.on("crash", () => diagnostics.push({ type: "crash" }));
    await page.route("**/*", async (route) => {
      if (new URL(route.request().url()).pathname.includes(probe.match)) {
        injected += 1;
        await route.fulfill({ status: 503, contentType: "text/plain", body: "release gate injected failure" });
        return;
      }
      await route.continue();
    });
    let error = null;
    try {
      await page.goto(`${baseUrl}${probe.route}`, { waitUntil: "networkidle", timeout: 30000 });
      if (!await page.locator("main").count() || !await page.locator("h1").count()) throw new Error(`${probe.name} failure caused a page crash.`);
      if (probe.name === "replay-chunk") {
        const workspace = page.getByRole("button", { name: "Workspace", exact: true });
        await workspace.focus();
        await workspace.press("Enter");
        const play = page.getByRole("button", { name: "Play", exact: true });
        await play.focus();
        await play.press("Enter");
        await page.locator(".replay-error-panel").waitFor({ state: "visible", timeout: 10000 });
        await page.getByRole("button", { name: /Retry chunk/i }).waitFor({ state: "visible", timeout: 10000 });
      }
      if (probe.name === "replay-3d") {
        const workspace = page.getByRole("button", { name: "Workspace", exact: true });
        await workspace.focus();
        await workspace.press("Enter");
        const threeD = page.getByRole("button", { name: "3D", exact: true });
        await threeD.focus();
        await threeD.press("Enter");
        await page.getByRole("status").filter({ hasText: /2D|unavailable|fallback/i }).waitFor({ state: "visible", timeout: 10000 });
        const twoD = page.getByRole("button", { name: "2D", exact: true });
        await twoD.waitFor({ state: "visible", timeout: 10000 });
        if (await twoD.getAttribute("aria-pressed") !== "true") throw new Error("Replay 3D failure did not automatically restore explicit 2D state.");
      }
      if (probe.name === "model-glb") await page.getByRole("button", { name: /Retry 3D (viewer|model)/i }).waitFor({ state: "visible", timeout: 10000 });
      if (!injected) throw new Error(`${probe.name} failure was not injected.`);
      const failures = diagnostics.filter((entry) => entry.type === "pageerror" || entry.type === "crash" || entry.type === "requestfailed");
      if (failures.length) throw new Error(`${probe.name} failure emitted diagnostics: ${JSON.stringify(failures)}`);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      try {
        await page.screenshot({ path: path.join(evidence, `${browserName}-failure-${probe.name}.png`), fullPage: true });
      } catch (caught) {
        if (!error) error = caught instanceof Error ? caught.message : String(caught);
      }
      await writeFile(path.join(evidence, `${browserName}-failure-${probe.name}.json`), `${JSON.stringify(stable({ name: probe.name, injected, diagnostics, error }), null, 2)}\n`, "utf8");
      await page.close();
    }
    if (error) throw new Error(error);
    results.push({ name: probe.name, injected, status: "passed" });
  }
  return results;
}

async function exerciseBrowsers(paths, target, evidence, report) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error("Playwright is required for release:browser.");
  }
  const latest = JSON.parse(await readFile(path.join(paths.artifactRoot, "data", "manifests", "latest.json"), "utf8"));
  const replayPath = latest.latest?.path ? latest.latest.path.replace(/^\/sessions\//, "/replay/") : null;
  const replayMeta = latest.latest?.path ? JSON.parse(await readFile(path.join(paths.artifactRoot, sourcePathForSession(latest.latest.path), "replay.meta.json"), "utf8")) : null;
  const drivers = replayMeta?.drivers?.slice(0, 2).map((driver) => driver.driverCode);
  const sharePath = replayPath && drivers?.length === 2 ? `${replayPath}?tab=compare&drivers=${drivers.join(",")}#analysis` : null;
  const redirectTargets = new Map(releaseRedirects(latest));
  const cases = [...new Set(["/", "/replay/", ...(replayPath ? [replayPath] : []), ...(sharePath ? [sharePath] : []), "/race-desk/", "/compare/", "/stints/", "/learn/", "/cars/current-spec/", ...redirectTargets.keys()])];
  const policy = headerPolicyFromText(await readFile(path.join(paths.artifactRoot, "_headers"), "utf8"));
  const allowedOrigins = allowedNetworkOrigins(policy.security["content-security-policy"]);
  const local = !target ? await localServer(paths.artifactRoot) : null;
  const baseUrl = target || local.url;
  const results = report.results;
  try {
    if (target) {
      report.redirects = [];
      for (const [from, to] of releaseRedirects(latest)) report.redirects.push(await assertPermanentRedirect(target, from, to, "?browser=1"));
    }
    for (const [name, browserType] of Object.entries({ chromium: playwright.chromium, firefox: playwright.firefox, webkit: playwright.webkit })) {
      let browser;
      try {
        browser = await browserType.launch({ headless: true });
      } catch (error) {
        throw new Error(`Playwright ${name} is not installed. Run npx playwright install ${name}. ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
          for (const route of cases) {
            const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
            const events = [];
            const badRequests = [];
            const privacyViolations = [];
            let error = null;
            page.on("console", (message) => events.push({ type: "console", level: message.type(), text: message.text() }));
            page.on("pageerror", (caught) => events.push({ type: "pageerror", text: caught.message }));
            page.on("requestfailed", (request) => events.push({ type: "requestfailed", url: request.url(), text: request.failure()?.errorText || "failed" }));
            page.on("response", (response) => events.push({ type: "response", url: response.url(), status: response.status() }));
            page.on("request", (request) => {
              const requestUrl = new URL(request.url());
              events.push({ type: "request", url: request.url(), method: request.method() });
              if (isAnalyticsRequest(request.url())) privacyViolations.push({ url: request.url(), method: request.method(), hasCookie: Boolean(request.headers()["cookie"]), postDataBytes: request.postDataBuffer()?.length || 0 });
              if (!["data:", "blob:", "about:"].includes(requestUrl.protocol) && requestUrl.origin !== baseUrl && !allowedOrigins.has(requestUrl.origin)) badRequests.push(request.url());
            });
            try {
              const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30000 });
              if (!response || response.status() >= 400) throw new Error(`${name} ${route} failed with ${response?.status()}.`);
              const redirectTarget = redirectTargets.get(new URL(route, canonicalHostname).pathname);
              if (redirectTarget) {
                const actualPath = new URL(page.url()).pathname.replace(/\/$/, "") || "/";
                const expectedPath = redirectTarget.replace(/\/$/, "") || "/";
                if (actualPath !== expectedPath) throw new Error(`${route} browser navigation did not reach ${redirectTarget}.`);
              }
              if (!target && route === "/live") {
                const html = await readFile(path.join(paths.artifactRoot, routeDirectory(route)), "utf8");
                if (!/race-desk/i.test(html)) throw new Error("Local /live fallback does not point to Race Desk.");
              }
              if (!await page.locator("main").count() || !await page.locator("h1").count()) throw new Error(`${route} lacks main or h1.`);
              if (route === "/race-desk/" && !await page.getByText("Historical replay simulation — not live timing", { exact: true }).count()) throw new Error("Race Desk lacks the historical replay notice.");
              if (!await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)) throw new Error("Reduced-motion media query is not active.");
              if (viewport.width === 390 && await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error(`${route} has horizontal overflow at 390px.`);
              if (route === replayPath) {
                const workspace = page.getByRole("button", { name: "Workspace", exact: true });
                await workspace.focus();
                await assertVisibleFocus(workspace, "Workspace");
                await workspace.press("Enter");
                if (await workspace.getAttribute("aria-pressed") !== "true") throw new Error("Workspace did not expose selected state.");
                const firstDriver = page.locator("[data-driver-code]").first();
                await firstDriver.focus();
                await assertVisibleFocus(firstDriver, "Replay driver");
                await firstDriver.press("Enter");
                if (await firstDriver.getAttribute("aria-pressed") !== "true") throw new Error("Replay driver picker did not expose selected state.");
                const play = page.getByRole("button", { name: "Play", exact: true });
                await play.focus();
                await play.press("Enter");
                const pause = page.getByRole("button", { name: "Pause", exact: true });
                if (await pause.getAttribute("aria-label") !== "Pause") throw new Error("Replay play state did not become Pause.");
                await pause.focus();
                await pause.press("Enter");
                const clock = page.locator(".replay-controls-v2__meta-clock strong").first();
                const before = await clock.textContent();
                await page.locator("#replay-session-title").focus();
                await page.keyboard.press("ArrowRight");
                await page.waitForFunction((previous) => document.querySelector(".replay-controls-v2__meta-clock strong")?.textContent !== previous, before);
                const analysis = page.locator(".replay-support-panel__tabs").getByRole("tab").nth(1);
                await analysis.focus();
                await analysis.press("Enter");
                if (await analysis.getAttribute("aria-selected") !== "true") throw new Error("Replay analysis tab did not expose selected state.");
                const canvas = page.getByLabel("Interactive 2D race track map");
                await canvas.focus();
                await assertVisibleFocus(canvas, "Replay canvas");
                if (await canvas.getAttribute("data-view-transform") !== "0,0,1,0") throw new Error("Replay 2D canvas did not start at its reset transform.");
                await canvas.press("ArrowRight");
                if (await canvas.getAttribute("data-view-transform") !== "-24,0,1,0") throw new Error("Replay 2D canvas keyboard pan did not change its transform.");
                await canvas.press("+");
                if (await canvas.getAttribute("data-view-transform") !== "-24,0,1.15,0") throw new Error("Replay 2D canvas keyboard zoom did not change its transform.");
                await canvas.press("0");
                if (await canvas.getAttribute("data-view-transform") !== "0,0,1,0") throw new Error("Replay 2D canvas keyboard reset did not restore its transform.");
                if (await page.getByRole("button", { name: "2D", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("Replay does not expose active 2D state.");
              }
              if (route === "/cars/current-spec/") {
                const inspect = page.getByRole("button", { name: "Inspect", exact: true });
                await inspect.focus();
                await assertVisibleFocus(inspect, "Modelview Inspect");
                await inspect.press("Enter");
                if (await inspect.getAttribute("aria-pressed") !== "true") throw new Error("Modelview Inspect did not expose selected state.");
                const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
                await zoomIn.focus();
                await zoomIn.press("Enter");
                const reset = page.getByRole("button", { name: "Reset view", exact: true });
                await reset.focus();
                await reset.press("Enter");
                if (await page.locator("model-viewer[auto-rotate]").count()) throw new Error("Modelview auto-rotates under reduced motion.");
                const paused = page.locator(".wind-tunnel__action-button", { hasText: "Paused" });
                await paused.waitFor({ state: "visible", timeout: 10000 });
                if (!await paused.isDisabled()) throw new Error("Wind field is not paused under reduced motion.");
              }
              const undersizedActions = await page.locator("button, a").evaluateAll((elements) => elements.filter((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                const classNames = [...element.classList];
                const primary = classNames.includes("button") || classNames.some((name) => name.endsWith("--primary") || name.endsWith("__play") || name.endsWith("__load-more"));
                return style.visibility !== "hidden" && style.display !== "none" && primary && (rect.width < 44 || rect.height < 44);
              }).map((element) => ({ text: element.textContent?.trim(), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
              if (undersizedActions.length) throw new Error(`Primary action targets below 44px: ${JSON.stringify(undersizedActions)}`);
              if (badRequests.length) throw new Error(`Unexpected external browser request: ${badRequests[0]}`);
              if (privacyViolations.length) throw new Error(`Browser analytics request is forbidden: ${JSON.stringify(privacyViolations[0])}`);
              const errors = events.filter((event) => event.type === "pageerror" || event.type === "requestfailed" || (event.type === "console" && event.level === "error") || (event.type === "response" && event.status >= 400 && !new URL(event.url).pathname.startsWith("/exploded-views/")));
              if (errors.length) throw new Error(`${name} ${route} emitted browser errors: ${JSON.stringify(errors)}`);
            } catch (caught) {
              error = caught instanceof Error ? caught.message : String(caught);
            } finally {
              const fileName = evidenceFileName(name, viewport, route);
              try {
                await page.screenshot({ path: path.join(evidence, `${fileName}.png`), fullPage: true });
              } catch (caught) {
                if (!error) error = caught instanceof Error ? caught.message : String(caught);
              }
              await writeFile(path.join(evidence, `${fileName}.json`), `${JSON.stringify(stable({ browser: name, route, viewport, events, badRequests, privacyViolations, error }), null, 2)}\n`, "utf8");
              await page.close();
            }
            if (error) throw new Error(error);
            results.push({ browser: name, version: browser.version(), route, viewport, reducedMotion: "reduce", status: "passed" });
          }
        }
        const failureResults = await browserFailureProbes(browser, baseUrl, replayPath, evidence, name);
        results.push(...failureResults.map((result) => ({ browser: name, version: browser.version(), viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", failureProbe: result })));
      } finally {
        if (browser) await browser.close();
      }
    }
  } finally {
    if (local) await new Promise((resolve, reject) => local.server.close((error) => error ? reject(error) : resolve()));
  }
}

async function browserGate(paths, target) {
  const manifest = await loadManifest(paths);
  return runEvidenceGate(paths, "browser", manifest, { target: target || "local", results: [] }, (evidence, report) => exerciseBrowsers(paths, target, evidence, report));
}

async function compareOrigin(origin, manifestBytes, manifest, samples, entries) {
  const manifestResponse = await fetchChecked(origin, "/release-manifest.json");
  const remoteManifestBytes = Buffer.from(await manifestResponse.arrayBuffer());
  let remoteManifest;
  try {
    remoteManifest = JSON.parse(remoteManifestBytes.toString("utf8"));
  } catch {
    throw new Error(`${origin} release manifest is not JSON.`);
  }
  if (!remoteManifestBytes.equals(manifestBytes) || remoteManifest.canonicalHostname !== canonicalHostname || JSON.stringify(stable(remoteManifest)) !== JSON.stringify(stable(manifest))) {
    throw new Error(`${origin} release manifest does not exactly match the candidate.`);
  }
  const compared = [];
  for (const relativePath of samples) {
    const entry = entries.get(relativePath);
    const response = await fetchChecked(origin, `/${relativePath}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length !== entry.bytes || digest(body) !== entry.sha256) throw new Error(`${origin} parity mismatch: ${relativePath}.`);
    if (normalizeContentType(response.headers.get("content-type")) !== normalizeContentType(entry.mimeType)) throw new Error(`${origin} Content-Type mismatch: ${relativePath}.`);
    if (normalizeCacheControl(response.headers.get("cache-control")) !== normalizeCacheControl(entry.cachePolicy)) throw new Error(`${origin} Cache-Control mismatch: ${relativePath}.`);
    compared.push({ path: relativePath, bytes: body.length, sha256: digest(body), mimeType: normalizeContentType(response.headers.get("content-type")), cacheControl: normalizeCacheControl(response.headers.get("cache-control")) });
  }
  return { origin, manifestBytes: remoteManifestBytes.length, samples: compared };
}

async function parityGate(paths, target, deployPermalink) {
  const localManifestText = await readFile(paths.releaseManifest, "utf8");
  const localManifestBytes = Buffer.from(localManifestText);
  const localManifest = JSON.parse(localManifestText);
  if (target === canonicalHostname && !deployPermalink) throw new Error("Canonical parity requires --deploy-permalink <immutable f1-demo URL>.");
  const immutable = target === canonicalHostname ? deployPermalink : validateTargetUrl(target, { immutable: true });
  if (target !== canonicalHostname && deployPermalink && deployPermalink !== immutable) throw new Error("Preview parity target and --deploy-permalink must identify the same deploy.");
  return runEvidenceGate(paths, "parity", localManifest, { target, deployPermalink: immutable }, async (_evidence, report) => {
    const metadata = await loadNetlifyDeployMetadata(immutable);
    report.deployment = validateDeployMetadata(metadata, target, immutable);
    const [rootHtml, replayHtml, latest] = await Promise.all([
      readFile(path.join(paths.artifactRoot, "index.html"), "utf8"),
      readFile(path.join(paths.artifactRoot, "replay", "index.html"), "utf8"),
      readFile(path.join(paths.artifactRoot, "data", "manifests", "latest.json"), "utf8").then(JSON.parse),
    ]);
    const samples = selectCriticalSamples(localManifest, rootHtml, latest, replayHtml);
    const entries = new Map(localManifest.entries.map((entry) => [entry.path, entry]));
    const origins = [target, ...(target === immutable ? [] : [immutable])];
    report.origins = [];
    for (const origin of origins) report.origins.push(await compareOrigin(origin, localManifestBytes, localManifest, samples, entries));
    report.redirects = [];
    for (const origin of origins) {
      for (const [from, to] of releaseRedirects(latest)) report.redirects.push({ origin, ...await assertPermanentRedirect(origin, from, to) });
    }
    report.manifestBytes = localManifestBytes.length;
    report.samples = samples;
  });
}

export function parseCommand(argv) {
  const [gate, ...rest] = argv;
  const values = [];
  let deployPermalink = null;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--deploy-permalink") {
      deployPermalink = rest[index + 1];
      if (!deployPermalink) throw new Error("Missing value for --deploy-permalink.");
      index += 1;
    } else values.push(rest[index]);
  }
  if (!new Set(["browser", "security", "parity"]).has(gate)) throw new Error("Use browser, security, or parity.");
  if (gate === "parity" ? values.length !== 1 : values.length > 1) throw new Error(`${gate} requires ${gate === "parity" ? "one" : "zero or one"} positional URL.`);
  if (deployPermalink && gate !== "parity") throw new Error("--deploy-permalink is only valid for parity.");
  return { gate, target: values[0] ? validateTargetUrl(values[0]) : null, deployPermalink: deployPermalink ? validateTargetUrl(deployPermalink, { immutable: true }) : null };
}

async function main() {
  const { gate, target, deployPermalink } = parseCommand(process.argv.slice(2));
  const candidateRoot = candidateRootFrom({});
  const { paths } = await auditCandidate(candidateRoot);
  const report = gate === "browser"
    ? await browserGate(paths, target)
    : gate === "security"
      ? await securityGate(paths, target)
      : await parityGate(paths, target, deployPermalink);
  process.stdout.write(`Release ${gate} gate passed: ${paths.root}\n${JSON.stringify(report)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
