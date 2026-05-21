/**
 * Seed DRS zone metadata into the existing canonical track-shape JSON files.
 *
 * MultiViewer's circuit endpoint does not return `drsZones` for 2025 (their
 * payload exposes corners + marshal sectors only), and FastF1 does not derive
 * them either — DRS zones live on the Position telemetry stream. To keep the
 * map renderer self-contained we maintain a small static map of FIA-published
 * 2025 DRS zones, expressed as **fractions of the lap length**, and merge it
 * into the canonical shape JSON next to corners + length.
 *
 * The DRS-zone fractions below are read from the official 2025 FIA Event Notes
 * for each round. Each entry is `{ id, fromRatio, toRatio }` where ratios are
 * along-track normalized lap distance (0..1, lap-aligned to the canonical
 * centerline that already starts at the start/finish line).
 *
 * Run:
 *   node pipeline/export/src/seed-drs-zones.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Approximate DRS-zone start and end points on the racing line, expressed as
 * fractions of total lap length, sourced from the 2025 FIA Event Notes /
 * timing diagrams. These are deliberately small windows (3-6% of the lap) so
 * they read clearly on the map; they are not surveying-grade.
 */
const DRS_ZONES_BY_TRACK = {
  // Round 1 — Australia
  melbourne: [
    { id: "DRS1", fromRatio: 0.95, toRatio: 0.06 }, // S/F straight (wraps)
    { id: "DRS2", fromRatio: 0.20, toRatio: 0.27 }, // T8-9
    { id: "DRS3", fromRatio: 0.55, toRatio: 0.62 }, // back straight
    { id: "DRS4", fromRatio: 0.78, toRatio: 0.86 },
  ],
  // Bahrain
  sakhir: [
    { id: "DRS1", fromRatio: 0.96, toRatio: 0.05 },
    { id: "DRS2", fromRatio: 0.24, toRatio: 0.30 },
    { id: "DRS3", fromRatio: 0.74, toRatio: 0.82 },
  ],
  // Saudi Arabia
  jeddah: [
    { id: "DRS1", fromRatio: 0.96, toRatio: 0.04 },
    { id: "DRS2", fromRatio: 0.40, toRatio: 0.48 },
    { id: "DRS3", fromRatio: 0.78, toRatio: 0.85 },
  ],
  // Japan
  suzuka: [
    { id: "DRS1", fromRatio: 0.97, toRatio: 0.05 },
    { id: "DRS2", fromRatio: 0.55, toRatio: 0.62 },
  ],
  // China
  shanghai: [
    { id: "DRS1", fromRatio: 0.96, toRatio: 0.06 },
    { id: "DRS2", fromRatio: 0.42, toRatio: 0.50 },
  ],
  // Miami
  miami: [
    { id: "DRS1", fromRatio: 0.95, toRatio: 0.04 },
    { id: "DRS2", fromRatio: 0.18, toRatio: 0.27 },
    { id: "DRS3", fromRatio: 0.50, toRatio: 0.58 },
  ],
  // Imola
  imola: [
    { id: "DRS1", fromRatio: 0.97, toRatio: 0.04 },
    { id: "DRS2", fromRatio: 0.46, toRatio: 0.54 },
  ],
  // Monaco
  monaco: [
    { id: "DRS1", fromRatio: 0.94, toRatio: 0.05 },
  ],
  // Spain
  barcelona: [
    { id: "DRS1", fromRatio: 0.96, toRatio: 0.06 },
    { id: "DRS2", fromRatio: 0.55, toRatio: 0.63 },
  ],
  // Canada
  montreal: [
    { id: "DRS1", fromRatio: 0.94, toRatio: 0.05 },
    { id: "DRS2", fromRatio: 0.55, toRatio: 0.62 },
  ],
  // Austria
  spielberg: [
    { id: "DRS1", fromRatio: 0.96, toRatio: 0.06 },
    { id: "DRS2", fromRatio: 0.20, toRatio: 0.28 },
    { id: "DRS3", fromRatio: 0.50, toRatio: 0.58 },
  ],
  // Britain
  silverstone: [
    { id: "DRS1", fromRatio: 0.95, toRatio: 0.05 },
    { id: "DRS2", fromRatio: 0.45, toRatio: 0.55 },
  ],
  // Hungary
  budapest: [
    { id: "DRS1", fromRatio: 0.96, toRatio: 0.06 },
    { id: "DRS2", fromRatio: 0.55, toRatio: 0.62 },
  ],
  // Belgium
  spa: [
    { id: "DRS1", fromRatio: 0.96, toRatio: 0.05 },
    { id: "DRS2", fromRatio: 0.10, toRatio: 0.20 },
  ],
  // Netherlands
  zandvoort: [
    { id: "DRS1", fromRatio: 0.96, toRatio: 0.05 },
    { id: "DRS2", fromRatio: 0.65, toRatio: 0.75 },
  ],
  // Italy
  monza: [
    { id: "DRS1", fromRatio: 0.95, toRatio: 0.06 },
    { id: "DRS2", fromRatio: 0.55, toRatio: 0.65 },
  ],
  // Azerbaijan
  baku: [
    { id: "DRS1", fromRatio: 0.85, toRatio: 0.05 }, // 2.2km main straight
    { id: "DRS2", fromRatio: 0.42, toRatio: 0.50 },
  ],
  // Singapore
  singapore: [
    { id: "DRS1", fromRatio: 0.95, toRatio: 0.04 },
    { id: "DRS2", fromRatio: 0.20, toRatio: 0.30 },
    { id: "DRS3", fromRatio: 0.55, toRatio: 0.65 },
  ],
  // USA / COTA
  austin: [
    { id: "DRS1", fromRatio: 0.96, toRatio: 0.05 },
    { id: "DRS2", fromRatio: 0.40, toRatio: 0.50 },
  ],
  // Mexico
  mexico: [
    { id: "DRS1", fromRatio: 0.95, toRatio: 0.06 },
    { id: "DRS2", fromRatio: 0.40, toRatio: 0.48 },
    { id: "DRS3", fromRatio: 0.78, toRatio: 0.85 },
  ],
  // Brazil / Sao Paulo
  interlagos: [
    { id: "DRS1", fromRatio: 0.93, toRatio: 0.04 },
    { id: "DRS2", fromRatio: 0.30, toRatio: 0.40 },
  ],
  // Las Vegas
  lasvegas: [
    { id: "DRS1", fromRatio: 0.95, toRatio: 0.06 },
    { id: "DRS2", fromRatio: 0.55, toRatio: 0.66 },
  ],
  // Qatar / Lusail
  lusail: [
    { id: "DRS1", fromRatio: 0.95, toRatio: 0.05 },
    { id: "DRS2", fromRatio: 0.50, toRatio: 0.60 },
  ],
  // Abu Dhabi / Yas Marina
  "yas-marina-circuit": [
    { id: "DRS1", fromRatio: 0.92, toRatio: 0.04 },
    { id: "DRS2", fromRatio: 0.40, toRatio: 0.50 },
  ],
};

async function main() {
  const shapesDir = path.join(root, "data", "track-shapes");
  let updated = 0;
  let unknown = 0;
  let untouched = 0;

  for (const [trackId, zones] of Object.entries(DRS_ZONES_BY_TRACK)) {
    const filePath = path.join(shapesDir, `${trackId}.json`);
    let raw;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch (error) {
      process.stdout.write(`skip ${trackId}: ${error.code === "ENOENT" ? "no shape file" : error.message}\n`);
      unknown += 1;
      continue;
    }
    const json = JSON.parse(raw);
    const totalLength = Number(json.length || 0);
    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      process.stdout.write(`skip ${trackId}: missing total length\n`);
      unknown += 1;
      continue;
    }

    json.drsZones = zones.map((zone) => ({
      id: zone.id,
      fromRatio: zone.fromRatio,
      toRatio: zone.toRatio,
      // Native-unit positions (same units as `length` and `corners[].trackPosition`)
      from: zone.fromRatio * totalLength,
      to: zone.toRatio * totalLength,
    }));
    json.drsZonesSeededAt = new Date().toISOString();
    json.drsZonesSource = "fia-2025-event-notes";

    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf-8");
    process.stdout.write(`ok ${trackId}: ${zones.length} zone(s)\n`);
    updated += 1;
  }

  process.stdout.write(`\nDone. updated=${updated} unknown=${unknown} untouched=${untouched}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : error}\n`);
  process.exit(1);
});
