/**
 * Generate realistic exploded technical illustrations for every car in the
 * catalog by calling the 9Router image gateway (default model: cx/gpt-5.5-image).
 *
 * Reads .env at the repo root for `9router_endpoint` and `9router_api`.
 * Output: apps/web/public/exploded-views/<season>/<constructorSlug>.png
 *
 * Usage:
 *   node pipeline/export/src/build-exploded-views.mjs                # all
 *   node pipeline/export/src/build-exploded-views.mjs --slug=red-bull
 *   node pipeline/export/src/build-exploded-views.mjs --force        # overwrite
 *
 * The prompt is per-constructor and includes:
 *   - the actual chassis name (e.g. "Red Bull RB21")
 *   - the team livery palette
 *   - explicit subsystem labels (front wing, nose, sidepod, halo, floor,
 *     diffuser, rear wing, suspension, wheels, brake ducts, engine cover)
 *   - "exploded view" framing with parts pulled apart along their axes
 *   - "studio render", "soft three-point lighting", "matte technical study"
 *   - black backdrop so the asset composites cleanly inside our dark UI
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip inline comments after the value (split on ` # ` only).
    const comment = value.indexOf(" #");
    if (comment >= 0) value = value.slice(0, comment).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadEnv() {
  let text = "";
  try {
    text = await readFile(path.join(root, ".env"), "utf-8");
  } catch {
    return {};
  }
  return parseEnv(text);
}

function parseArgs(argv) {
  const out = { slug: null, force: false, season: null };
  for (const arg of argv.slice(2)) {
    if (arg === "--force") out.force = true;
    else if (arg.startsWith("--slug=")) out.slug = arg.slice("--slug=".length);
    else if (arg.startsWith("--season=")) out.season = Number(arg.slice("--season=".length));
  }
  return out;
}

const PALETTES = {
  "red-bull": "deep navy blue chassis with crimson red accents and matte yellow trim",
  "mclaren": "papaya orange and deep onyx black with electric blue trim",
  "ferrari": "scuderia rosso red with black sidepods and yellow shield highlights",
  "mercedes": "silver arrow black livery with petrol turquoise accents",
  "aston-martin": "british racing green chassis with lime green trim and matte black wing surfaces",
  "alpine": "deep alpine blue with pink hi-vis accents and white floor edges",
  "apx-gp": "carbon black with metallic teal racing stripes and silver chrome accents",
  "fia-2026": "matte unpainted carbon-fiber prototype with soft white accent lines and orange ride-height markers",
};

const CHASSIS_NAMES = {
  "red-bull": "Red Bull RB21",
  "mclaren": "McLaren MCL39",
  "ferrari": "Ferrari SF-25",
  "mercedes": "Mercedes W15",
  "aston-martin": "Aston Martin AMR25",
  "alpine": "Alpine A525",
  "apx-gp": "APXGP01 (F1 movie chassis)",
  "fia-2026": "FIA 2026 spec prototype",
};

function buildPrompt(entry) {
  const palette = PALETTES[entry.constructorSlug] || "team livery";
  const chassis = CHASSIS_NAMES[entry.constructorSlug] || entry.displayName;
  return [
    `Photorealistic exploded technical view of a 2024-2026 generation Formula 1 car (${chassis}).`,
    `Side three-quarter angle, slight rear-up tilt, parts pulled apart along their natural assembly axes with thin straight grey guide lines connecting each component back to its origin.`,
    `Visible subsystems clearly separated and labelled by silhouette: front wing assembly with endplates and flaps, nose cone, front suspension wishbones, brake ducts, front wheel and tyre, sidepod inlet and engine cover, halo cockpit ring, fuel cell housing, floor with edge wing and venturi tunnels, diffuser, rear suspension, gearbox housing, rear wheel and tyre, beam wing, rear wing main plane and flap with DRS gap, T-tray.`,
    `Livery: ${palette}. Carbon fibre weave visible on raw composite surfaces.`,
    `Studio render, soft three-point lighting, matte black seamless background, sharp focus, deep shadows, no text overlays, no logos, no watermarks, professional engineering exhibition presentation.`,
    `Style: realistic technical exhibit photograph, museum-grade physical model, very high detail, clean composition, 2K resolution.`,
  ].join(" ");
}

async function generateImage({ endpoint, key, model, prompt, size }) {
  const url = `${endpoint.replace(/\/$/, "")}/images/generations`;
  // cx/* models on 9Router stream via SSE. Streaming keeps the Cloudflare
  // proxy connection alive while gpt-image-1.5 thinks; otherwise we hit a
  // 524 at 120s.
  const body = { model, prompt, size, output_format: "png", stream: true };
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 360000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        const snippet = text.length > 400 ? `${text.slice(0, 400)}...` : text;
        lastError = new Error(`9Router ${response.status}: ${snippet}`);
        clearTimeout(timer);
        if ((response.status === 524 || response.status === 502) && attempt < maxAttempts) {
          process.stdout.write(`    retry ${attempt}/${maxAttempts - 1} after ${response.status}\n`);
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
        throw lastError;
      }
      // Read the SSE stream until we see a final image payload.
      const reader = response.body?.getReader();
      if (!reader) throw new Error("9Router response has no body");
      const decoder = new TextDecoder();
      let buffer = "";
      let lastB64 = null;
      let lastUrl = null;
      let dotCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Parse complete SSE events separated by \n\n.
        let sep;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const event = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const lines = event.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              const data = json?.data?.[0] || json;
              if (data?.b64_json) lastB64 = data.b64_json;
              if (data?.url) lastUrl = data.url;
              // Some streams report partial b64 chunks under different fields.
              if (data?.image_b64) lastB64 = data.image_b64;
              if (data?.image_url) lastUrl = data.image_url;
              dotCount += 1;
              if (dotCount % 6 === 0) process.stdout.write(".");
            } catch {
              // Non-JSON keepalive line (e.g. the leading ":" comment).
            }
          }
        }
      }
      clearTimeout(timer);
      if (dotCount) process.stdout.write("\n");
      if (lastB64) return Buffer.from(lastB64, "base64");
      if (lastUrl) {
        const imgRes = await fetch(lastUrl);
        if (!imgRes.ok) throw new Error(`Image URL returned ${imgRes.status}`);
        return Buffer.from(await imgRes.arrayBuffer());
      }
      throw new Error("9Router stream ended without an image payload");
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt >= maxAttempts) throw error;
      if (error?.name === "AbortError") {
        process.stdout.write(`    retry ${attempt}/${maxAttempts - 1} after client timeout\n`);
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error("9Router image generation failed");
}

async function fileExists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function main() {
  const args = parseArgs(process.argv);
  const env = await loadEnv();
  const endpoint = env["9router_endpoint"] || process.env.NINEROUTER_URL;
  const key = env["9router_api"] || process.env.NINEROUTER_KEY;
  const model = env["GAMPO_IMAGE_MODEL"] || "cx/gpt-5.5-image";
  if (!endpoint || !key) {
    process.stderr.write("Missing 9router_endpoint or 9router_api in .env\n");
    process.exit(1);
  }

  const catalogPath = path.join(root, "data", "packs", "cars", "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf-8"));

  const queue = catalog.models.filter((m) => {
    if (args.slug && m.constructorSlug !== args.slug) return false;
    if (args.season && m.season !== args.season) return false;
    return true;
  });

  process.stdout.write(`Generating ${queue.length} exploded views via ${model}\n`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const entry of queue) {
    const outDir = path.join(root, "apps", "web", "public", "exploded-views", String(entry.season));
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `${entry.constructorSlug}.png`);
    if (!args.force && await fileExists(outPath)) {
      process.stdout.write(`  skip ${entry.constructorSlug} (already exists; use --force to regenerate)\n`);
      skipped += 1;
      continue;
    }
    const prompt = buildPrompt(entry);
    process.stdout.write(`  gen ${entry.constructorSlug} (${entry.season}) ...\n`);
    try {
      const buffer = await generateImage({ endpoint, key, model, prompt, size: "1024x1024" });
      await writeFile(outPath, buffer);
      process.stdout.write(`    ok ${(buffer.byteLength / 1024).toFixed(0)} KB -> ${path.relative(root, outPath)}\n`);
      ok += 1;
    } catch (error) {
      process.stdout.write(`    FAIL: ${error instanceof Error ? error.message : error}\n`);
      failed += 1;
    }
  }
  process.stdout.write(`\nDone. ok=${ok} skipped=${skipped} failed=${failed}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
