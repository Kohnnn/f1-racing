# Improvement Plan — 2026-05-23

Three-track plan for the F1 racing app, agreed with the user on 2026-05-23.
Shipped **incrementally**: each track ships, smokes on production, and gets
follow-up questions before moving to the next.

---

## User decisions

1. Replay layout: support **both** vertical and horizontal leaderboard. Add a
   toggle.
2. Replay canvas: also improve hover / drag / zoom so the user gets more
   insight when interacting.
3. Driver portraits: **no image gen**. Use the SVGs already published by
   `formula1.com/en/drivers` (F1 TV) and `en.wikipedia.org` driver pages.
4. Constructor logos: **no image gen**. Use the SVGs from F1 TV.
5. Wind tunnel: ship recommended defaults (real streaklines + pressure tint).
   The remaining bad-look problem is the silhouette not matching the actual
   car shape — fix the polygon extraction.
6. fia-2026 axis override: extend `data/car-models.json` with an
   `axesOverride` field.
7. Ship incrementally: review and ask follow-up questions before each track
   ships.

---

## Track 3 — `/cars/current-spec/` (shipping first)

### Problems verified
- `AirflowOverlay` is decorative, identical for every constructor, no
  relation to the GLB. (`car-model-browser.tsx:141-176`)
- Default streaklines are 9 hand-tuned Béziers, not solver output.
  (`canvas-wind-tunnel.tsx:299-411`)
- Default `particles = 0`; no UI slider; the real particle path is dead.
  (`canvas-wind-tunnel.tsx:48`)
- fia-2026 polygon aspect is 0.61 (taller than wide); should be ~3.0.
  PCA picks wrong projection plane.
  (`pipeline/export/src/build-wind-profiles.mjs`)
- `remapToTunnelFrame` stretches bbox to fill the band, ignoring aspect.
  (`canvas-wind-tunnel.tsx:726-744`)
- CSS duplicates: `.car-wind-tunnel-host` defined twice
  (`globals.css:2717` and `:2876`); dead `.wind-tunnel__heat*`,
  `__chip*` rules at `globals.css:2975-3097`.

### Track 3 work items
- T3.1 Remove `AirflowOverlay` SVG and its CSS.
- T3.2 Replace `flowOverlay` enum in `focus-points.ts` with `flowSummary`
  (title + body) — static info text only.
- T3.3 Wind tunnel default: real advected particles + pressure tint on.
  Drop decorative `drawFlowRibbons` to opt-in only.
- T3.4 Fix silhouette aspect:
  - PCA plane selection: try PC1×PC2, PC1×PC3, PC2×PC3, pick aspect
    closest to 3.0.
  - Per-model `axesOverride` in `data/car-models.json` for fia-2026.
- T3.5 `remapToTunnelFrame`: preserve aspect, letterbox.
- T3.6 3D scene: wider zoom range, studio quality preset, keyboard
  nudges, dedicated full-width wind tunnel band below model.
- T3.7 CSS cleanup.
- T3.8 Honest copy: rename eyebrow, drop "live solver" oversell.
- T3.9 Build, local smoke, deploy, prod smoke, OCI health.

### Track 3 progress
- [x] Document plan
- [x] T3.1 Remove AirflowOverlay
- [x] T3.2 Refactor focus-points (flowSummary)
- [x] T3.3 Wind tunnel real solver default + hover detail
- [x] T3.4 Silhouette aspect fix (column-envelope tracer + axesOverride)
- [x] T3.5 Aspect-preserving tunnel frame
- [x] T3.6 3D scene quality (zoom range, studio preset, keyboard nudges, zoom buttons)
- [x] T3.7 CSS cleanup
- [x] T3.8 Honest copy
- [x] T3.9 Build passed; local static smoke passed; deploy + prod smoke pending

---

## Track 1 — Replay smoothness, full-width track, interactive canvas (after Track 3 review)

### Items
- T1.1 Smooth interpolation between frames using `currentFrame` and
  `nextFrame`. `playheadTimeMs` ref-based clock for high-frequency reads.
- T1.2 Full-width track stage; leaderboard moves below; new
  `replay-readout-rail` row for current-read + live-order strip.
- T1.3 Leaderboard layout toggle: vertical list / horizontal ticker.
- T1.4 Canvas interactivity: drag pan, wheel zoom toward cursor,
  shift+drag rotate, double-click reset, hover detail tooltip
  (driver code, gap, lap, sector colour, last sector time).
- T1.5 Build / deploy / smoke.

---

## Track 2 — Driver / constructor / circuit art system (after Track 1 review)

### Items
- T2.1 Canonical art manifest: `data/teams/<slug>.json`,
  `data/circuits/<slug>.json`, public mirrors.
- T2.2 Source driver portrait SVGs from the public F1 / Wikipedia
  driver pages (no image gen). Save to
  `apps/web/public/images/drivers/<season>/<slug>.svg`.
- T2.3 Source constructor logo SVGs from the same sources. Save to
  `apps/web/public/images/teams/<slug>/logo.svg`.
- T2.4 Generate circuit art programmatically from
  `data/track-shapes/<slug>.json` (no image gen needed).
- T2.5 `packages/art/` helper for the rest of the app to consume.
- T2.6 Roll out across replay-library, leaderboard, driver-card,
  learn-index, home.

---

## Verification gates per track
- `npm run next:build -w @f1-racing/web`
- Local static smoke (HEAD on key routes)
- Netlify deploy: `npx netlify deploy --prod --no-build --dir apps/web/out --site d783914b-0638-46bc-ae4b-371b66cca51e --filter @f1-racing/web`
- Production smoke
- OCI health: `GET https://f1-api.129.150.58.64.sslip.io/health`
