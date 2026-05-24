# Art attributions and provenance

This document tracks where every piece of imagery in the F1 racing app
comes from, so any future replacement with licensed art is traceable.

Last updated: 2026-05-24 (Wikipedia portrait + team logo fetch)

---

## Manifests (canonical, machine-readable)

| File | Purpose |
| --- | --- |
| `apps/web/src/data/art/teams.json` | Team registry: slug, display name, brand colours, seasons, asset paths |
| `apps/web/src/data/art/drivers.json` | Driver registry: code, racing number, country, season + team mapping, portrait + number-plate paths |
| `apps/web/src/data/art/circuits.json` | Circuit registry: GP slug, length, corners, first GP year, hero + map asset paths |

Same files are mirrored to `apps/web/public/data/art/*.json` for static
fetching by the client.

A machine-readable per-asset fetch log lives at
`docs/art-fetch-log.json` (regenerated each time
`pipeline/export/src/fetch-wikipedia-art.mjs` is invoked).

---

## 1. Teams

Generated assets live under `apps/web/public/images/teams/<slug>/`:

```
logo.svg       240x240 letter-mark logo coloured by team baseColor / accentColor
mark.svg       64x64 favicon-style team mark
stripe.svg     8x40 colour stripe used for leaderboard rows / hover lines
wiki-logo.webp Compressed Wikipedia infobox logo (240-480px) — fetched from Wikipedia REST + recompressed via sharp
```

Generators:
- `pipeline/export/src/build-team-art.mjs` (Node, no network) — emits letter-mark / mark / stripe.
- `pipeline/export/src/fetch-wikipedia-art.mjs --kind=teams` (Node, network) — downloads the Wikipedia infobox bitmap into `wiki-logo.<ext>`.
- `pipeline/export/src/compress-art.mjs` — re-encodes fetched logos to compressed WebP (max 480px long axis, Q86).

UI consumers (driver-card team mark, leaderboard team-logo badge) prefer
`wiki-logo.webp` and fall back to `mark.svg` on `onError`.

### Per-team upstream sources

| Slug | F1.com page | Wikipedia | wiki-logo source page |
| --- | --- | --- | --- |
| red-bull | https://www.formula1.com/en/teams/red-bull-racing | https://en.wikipedia.org/wiki/Red_Bull_Racing | https://en.wikipedia.org/wiki/Red_Bull_Racing |
| mclaren | https://www.formula1.com/en/teams/mclaren | https://en.wikipedia.org/wiki/McLaren | https://en.wikipedia.org/wiki/McLaren |
| ferrari | https://www.formula1.com/en/teams/ferrari | https://en.wikipedia.org/wiki/Scuderia_Ferrari | https://en.wikipedia.org/wiki/Scuderia_Ferrari |
| mercedes | https://www.formula1.com/en/teams/mercedes | https://en.wikipedia.org/wiki/Mercedes-Benz_in_Formula_One | https://en.wikipedia.org/wiki/Mercedes-Benz_in_Formula_One |
| aston-martin | https://www.formula1.com/en/teams/aston-martin | https://en.wikipedia.org/wiki/Aston_Martin_in_Formula_One | https://en.wikipedia.org/wiki/Aston_Martin_in_Formula_One |
| alpine | https://www.formula1.com/en/teams/alpine | https://en.wikipedia.org/wiki/Alpine_F1_Team | https://en.wikipedia.org/wiki/Alpine_F1_Team |
| williams | https://www.formula1.com/en/teams/williams | https://en.wikipedia.org/wiki/Williams_Racing | https://en.wikipedia.org/wiki/Williams_Racing |
| rb (2024) | https://www.formula1.com/en/teams/rb (archived) | https://en.wikipedia.org/wiki/RB_(Formula_One_team) | https://en.wikipedia.org/wiki/Racing_Bulls (fallback used) |
| racing-bulls | https://www.formula1.com/en/teams/racing-bulls | https://en.wikipedia.org/wiki/Visa_Cash_App_Racing_Bulls | https://en.wikipedia.org/wiki/Racing_Bulls |
| kick-sauber | https://www.formula1.com/en/teams/kick-sauber | https://en.wikipedia.org/wiki/Sauber_Motorsport | https://en.wikipedia.org/wiki/Sauber_Motorsport |
| audi (2026) | _planned_ | https://en.wikipedia.org/wiki/Audi_in_Formula_One | https://en.wikipedia.org/wiki/Audi_in_Formula_One |
| haas | https://www.formula1.com/en/teams/haas | https://en.wikipedia.org/wiki/Haas_F1_Team | https://en.wikipedia.org/wiki/Haas_F1_Team |
| cadillac (2026) | _planned_ | https://en.wikipedia.org/wiki/Cadillac_Formula_One_team | https://en.wikipedia.org/wiki/Cadillac_Formula_One_team |

### Replacement procedure
1. Drop a `logo.svg` (preferred) or run `node pipeline/export/src/fetch-wikipedia-art.mjs --kind=teams --slug=<slug> --force`.
2. After fetching, run `node pipeline/export/src/compress-art.mjs --force` to regenerate the WebP at the canonical size.
3. To regenerate the letter-mark only, run `node pipeline/export/src/build-team-art.mjs` (without `--force`).

---

## 2. Drivers

Generated assets:

```
apps/web/public/images/drivers/avatars/<slug>.svg     96x96 driver code avatar
apps/web/public/images/drivers/numbers/<n>.svg        220x160 racing number plate
apps/web/public/images/drivers/<slug>.webp            240x240 photographic portrait (fetched from Wikipedia + compressed)
```

Generators:
- `pipeline/export/src/build-driver-art.mjs` (Node, no network) — emits avatars + number plates.
- `pipeline/export/src/fetch-wikipedia-art.mjs --kind=drivers` (Node, network) — downloads each driver's Wikipedia infobox image (often JPG/PNG).
- `pipeline/export/src/compress-art.mjs` — center-crops to a 240x240 square and re-encodes WebP (Q78).

UI consumers (Leaderboard `DriverGlyph`, driver-card avatar) prefer
`/images/drivers/<slug>.webp` and fall back to `/images/drivers/avatars/<slug>.svg`
on `onError`.

### Per-driver upstream sources

The Wikipedia title used for each fetch is recorded in
`pipeline/export/src/fetch-wikipedia-art.mjs` (DRIVER_TITLE_OVERRIDES).
Per-fetch results, including `sourceUrl` and `pageUrl`, are written to
`docs/art-fetch-log.json` after every run.

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

- `getTeamArt(slug)` -> logo, wikiLogo, mark, stripe, brand colours
- `getDriverArt(codeOrSlug, { season })` -> avatar, portrait, number plate, team
- `getCircuitArt(slug)` -> map, hero, polyline reference
- `resolveTeam`, `resolveCircuit`, `listTeams`, `listDrivers`, `listCircuits`

The helper handles common slug aliases that appear in replay packs
(`spa-francorchamps -> spa`, `red-bull-racing -> red-bull`, etc.).

---

## 6. Licensing notes

- Letter-mark logos and circuit outlines emitted by our pipeline scripts
  are derivative works of public-domain typography and locally owned
  polyline data. They are safe to redistribute as part of this project.
- Driver portrait WebP files are derived from Wikipedia infobox imagery
  and inherit Wikipedia's per-image licence (typically CC-BY-SA, public
  domain, or fair-use under Wikipedia's policies). Per the project policy
  no per-page footer credit is rendered; this doc is the credit ledger.
- Wikipedia team logos in `wiki-logo.webp` files inherit their upstream
  Wikipedia licence and may be replaced with licensed F1 brand assets
  manually using the procedure above when needed.
