# Art attributions and provenance

This document tracks where every piece of imagery in the F1 racing app
comes from, so any future replacement with licensed art is traceable.

Last updated: 2026-05-23

---

## Manifests (canonical, machine-readable)

| File | Purpose |
| --- | --- |
| `apps/web/src/data/art/teams.json` | Team registry: slug, display name, brand colours, seasons, asset paths |
| `apps/web/src/data/art/drivers.json` | Driver registry: code, racing number, country, season + team mapping, portrait + number-plate paths |
| `apps/web/src/data/art/circuits.json` | Circuit registry: GP slug, length, corners, first GP year, hero + map asset paths |

Same files are mirrored to `apps/web/public/data/art/*.json` for static
fetching by the client.

---

## 1. Teams

Generated assets live under `apps/web/public/images/teams/<slug>/`:

```
logo.svg     240x240 letter-mark logo coloured by team baseColor / accentColor
mark.svg     64x64 favicon-style team mark
stripe.svg   8x40 colour stripe used for leaderboard rows / hover lines
```

Generator: `pipeline/export/src/build-team-art.mjs` (Node, no network).
The script reads `apps/web/src/data/art/teams.json` and emits letter-mark
SVGs in each team's brand colour. Run with `--force` to regenerate.

### Upstream sources to consult when replacing letter-marks with the
licensed brand asset

For each team, the upstream brand source priorities are:

1. **F1.com** team page: `https://www.formula1.com/en/teams/<slug>`
   (typically PNG or WebP photography + occasional SVG logo).
2. **Wikipedia** Constructor page: `https://en.wikipedia.org/wiki/<Team>`
   (usually offers a Commons SVG logo under CC-BY-SA).
3. **F1 fandom wiki**: `https://f1.fandom.com/wiki/<Team>`.

Per-team upstream candidates:

| Slug | F1.com page | Wikipedia |
| --- | --- | --- |
| red-bull | https://www.formula1.com/en/teams/red-bull-racing | https://en.wikipedia.org/wiki/Red_Bull_Racing |
| mclaren | https://www.formula1.com/en/teams/mclaren | https://en.wikipedia.org/wiki/McLaren |
| ferrari | https://www.formula1.com/en/teams/ferrari | https://en.wikipedia.org/wiki/Scuderia_Ferrari |
| mercedes | https://www.formula1.com/en/teams/mercedes | https://en.wikipedia.org/wiki/Mercedes-Benz_in_Formula_One |
| aston-martin | https://www.formula1.com/en/teams/aston-martin | https://en.wikipedia.org/wiki/Aston_Martin_in_Formula_One |
| alpine | https://www.formula1.com/en/teams/alpine | https://en.wikipedia.org/wiki/Alpine_F1_Team |
| williams | https://www.formula1.com/en/teams/williams | https://en.wikipedia.org/wiki/Williams_Racing |
| rb (2024) | https://www.formula1.com/en/teams/rb (archived) | https://en.wikipedia.org/wiki/RB_(Formula_One_team) |
| racing-bulls | https://www.formula1.com/en/teams/racing-bulls | https://en.wikipedia.org/wiki/Visa_Cash_App_Racing_Bulls |
| kick-sauber | https://www.formula1.com/en/teams/kick-sauber | https://en.wikipedia.org/wiki/Sauber_Motorsport |
| audi (2026) | _planned_ | https://en.wikipedia.org/wiki/Audi_Sport_Formula_One_Team |
| haas | https://www.formula1.com/en/teams/haas | https://en.wikipedia.org/wiki/Haas_F1_Team |
| cadillac (2026) | _planned_ | https://en.wikipedia.org/wiki/Cadillac_Formula_One_team |

### Replacement procedure
1. Drop a `logo.svg` (preferred), `logo.webp`, or `logo.png` into the
   target team folder.
2. If using a non-SVG, also update the `logoFallback` field in the
   teams manifest.
3. Run `node pipeline/export/src/build-team-art.mjs` (without `--force`)
   to fill in any missing siblings (mark / stripe).

---

## 2. Drivers

Generated assets:

```
apps/web/public/images/drivers/avatars/<slug>.svg     96x96 driver code avatar
apps/web/public/images/drivers/numbers/<n>.svg        220x160 racing number plate
apps/web/public/images/drivers/<slug>.webp            (manual) photographic portrait
```

Generator: `pipeline/export/src/build-driver-art.mjs` (Node, no network).
Reads `apps/web/src/data/art/drivers.json` and writes the avatar + number
plate using the most recent season's team colours.

Driver photographic portraits are NOT auto-generated. They should be
sourced manually per F1.com / Wikipedia attribution and dropped into the
`portrait` path declared in the manifest.

### Upstream priority for portraits
1. **F1.com driver page**: `https://www.formula1.com/en/drivers/<slug>`
   (typically WebP studio portrait, copyright Formula 1).
2. **Wikipedia**: `https://en.wikipedia.org/wiki/<Driver_Name>`
   (typically a JPEG infobox photo, often CC-BY-SA).
3. F1 fandom: `https://f1.fandom.com/wiki/<Driver_Name>`.

Per-driver upstream sources are inferable from the slug; for example
`https://www.formula1.com/en/drivers/max-verstappen` and
`https://en.wikipedia.org/wiki/Max_Verstappen`.

### Driver-number plate fallback
If a season's racing number changes for a driver (e.g. world champion
swap to #1 / back to permanent number), regenerate the plate via
`node pipeline/export/src/build-driver-art.mjs --slug=<slug> --force`.

---

## 3. Circuits

Generated assets:

```
apps/web/public/images/circuits/<slug>/map.svg      480x280 dark-theme outline
apps/web/public/images/circuits/<slug>/hero.svg     1600x900 hero outline + GP label
```

Generator: `pipeline/export/src/build-circuit-art.mjs` (Node, no network).
Reads each circuit's polyline at `data/track-shapes/<slug>.json` and
renders both an outline and a hero illustration. No external imagery is
fetched; everything is derived from the locally-owned polyline.

Per-circuit factual fields (length, corners, first GP, country) come
from the circuit manifest. Wikipedia is the canonical fallback source
for those numeric facts; see the manifest's `sources.wikipedia` URL.

---

## 4. Cars (3D models, exploded views, posters)

These predate the art system and stay where they are:

- 3D GLBs: `apps/web/public/models/<season>/<constructor>/<chassis>.glb`
  (sources documented in `data/packs/cars/catalog.json` and the existing
  team-specific docs under `docs/openfoam-*.md`).
- Exploded view PNGs: `apps/web/public/exploded-views/<season>/<slug>.png`
  generated by `pipeline/export/src/build-exploded-views.mjs` via 9Router
  `cx/gpt-5.5-image`.
- Posters: `apps/web/public/posters/<season>/<slug>/<chassis>.svg`
  hand-authored.

---

## 5. Helpers

Front-end consumes art through `apps/web/src/lib/art.ts`:

- `getTeamArt(slug)` -> logo, mark, stripe, brand colours
- `getDriverArt(codeOrSlug, { season })` -> avatar, number plate, team
- `getCircuitArt(slug)` -> map, hero, polyline reference
- `resolveTeam`, `resolveCircuit`, `listTeams`, `listDrivers`, `listCircuits`

The helper handles common slug aliases that appear in replay packs
(`spa-francorchamps -> spa`, `red-bull-racing -> red-bull`, etc.).

---

## 6. Licensing notes

- Letter-mark logos and circuit outlines emitted by our pipeline scripts
  are derivative works of public-domain typography and locally owned
  polyline data. They are safe to redistribute as part of this project.
- Driver portrait WebP files dropped in by hand inherit their upstream
  licence. F1.com images are typically not redistributable; Wikipedia
  Commons images are usually CC-BY-SA and should be credited inline if
  used in production. Track usage in the manifest if so.
- Per the project policy, no per-page footer credit is rendered; this
  doc is the credit ledger.
