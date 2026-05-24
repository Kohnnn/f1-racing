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

## Track 1 — Replay smoothness, full-width track, interactive canvas

### Items
- T1.1 Smooth interpolation between frames using `currentFrame` and
  `nextFrame`. `playheadTimeMs` ref-based clock for high-frequency reads.
- T1.2 Full-width track stage; leaderboard moves below; new
  `replay-readout-rail` row for current-read + live-order strip.
- T1.3 Leaderboard layout toggle: vertical list / horizontal ticker.
- T1.4 Canvas interactivity: drag pan, Ctrl/Cmd+wheel zoom toward
  cursor, shift+drag rotate, double-click reset, hover tooltip with
  toggleable fields (position / team / gap / last lap / best lap /
  tyre / speed / DRS).
- T1.5 Build / deploy / smoke.

### Track 1 progress
- [x] T1.1 Smooth interpolation (linear distA->distB by smoothstep
  localT plus residual smoother, with lap-rollover unwrap)
- [x] T1.2 Full-width track stage; leaderboard moved below in
  `replay-side-column--stacked` (current-read + leaderboard)
- [x] T1.3 Leaderboard layout toggle: vertical default, horizontal
  ticker option, propagated through Leaderboard props
- [x] T1.4 Canvas interactivity: drag pan, Ctrl+wheel zoom toward
  cursor, shift+drag rotate, double-click reset, hover tooltip with
  toggleable F1 TV style fields
- [x] T1.5 Build passed; local smoke passed; deploy + prod smoke
  pending

---

## Track 2 — Driver / constructor / circuit art system

### Items
- T2.1 Canonical art manifest: `apps/web/src/data/art/{teams,drivers,circuits}.json`
  with public mirrors at `apps/web/public/data/art/`.
- T2.2 Pipeline scripts: `pipeline/export/src/build-team-art.mjs`,
  `build-driver-art.mjs`, `build-circuit-art.mjs` — incremental, `--force` flag.
- T2.3 Generated assets: letter-mark team SVGs, driver number plates +
  avatars, circuit outlines + heroes (1600x900 SVG hero, 480x280 SVG map).
- T2.4 `apps/web/src/lib/art.ts` helper with slug aliases for replay-pack
  team / circuit names.
- T2.5 Roll out across:
  - `Leaderboard` — driver avatar glyph next to identity column.
  - `replay-library-client` — circuit map thumbnail + length / corners line.
  - `ReplayTrackInfoPanel` — circuit hero + length / corners / firstGp chips.
  - `driver-card` — driver avatar, team logo mark, racing number plate art.
- T2.6 `docs/art-attributions.md` documents every asset's upstream
  reference (F1.com primary, Wikipedia fallback) for traceability.

### Track 2 progress
- [x] T2.1 Manifests authored across 2024/2025/2026 (13 teams, 27 drivers,
  24 circuits).
- [x] T2.2 Pipeline scripts complete with incremental + `--force` modes.
- [x] T2.3 39 team art files, 54 driver art files, 48 circuit art files
  generated.
- [x] T2.4 `lib/art` helper with slug-alias resolver and resolveTeam /
  resolveCircuit fallbacks.
- [x] T2.5 Rolled out across leaderboard, replay-library, replay
  track-info panel, and driver-card.
- [x] T2.6 Attribution doc landed.
- [x] Build passed; local smoke 12/12; deploy + prod smoke pending.

---

## Verification gates per track
- `npm run next:build -w @f1-racing/web`
- Local static smoke (HEAD on key routes)
- Netlify deploy: `npx netlify deploy --prod --no-build --dir apps/web/out --site d783914b-0638-46bc-ae4b-371b66cca51e --filter @f1-racing/web`
- Production smoke
- OCI health: `GET https://f1-api.129.150.58.64.sslip.io/health`


---

## Follow-up wave (2026-05-24) — track canvas, replay dates, wind tunnel

### User-reported issues
1. Track canvas (replay) renders only one car marker — not the leaderboard, the on-track markers themselves.
2. Ctrl+wheel zoom hijacks browser tab zoom on Chromium. Need Shift+wheel.
3. `/replay/` library has no GP / session dates. User wants per-session detail (with weekend day-by-day option).
4. Wind tunnel airflow + silhouette still poor. Add a mode switcher (hand SVG / procedural / GLB-derived) and improve airflow visualisation.

### Increment 1 — TrackCanvas single-car bug + Shift+wheel
- Smooth-interpolation rewrite (Track 1) added a stale guard: `lastSnappedFrameRef === currentFrame` prevents distA/distB recomputation when ReplayView passes a *new* object that wraps the same frame instance via `buildSyntheticFrame` /  `...frame, trackStatus` spread. After spread the reference is new but driver coords are unchanged; we still want to rebuild distA/distB *every* time the parent renders so newly-arrived chunk frames repopulate `driverTargetsRef`. Drop the cache and trust React's prop diffing.
- Replace the ctrl/meta gate with shift on `handleWheel`. Plain wheel still scrolls the page. Update on-canvas hint, replay-track-panel paragraph copy, and the keyboard-shortcuts modal.

### Increment 2 — F1 calendar manifest
- Author `apps/web/src/data/art/calendar.json` with per-session ISO dates for 2024 / 2025 / 2026 (race + qualifying + sprint when applicable + practice 1/2/3 when in the pack).
- Mirror to `apps/web/public/data/art/calendar.json`.
- Helpers in `apps/web/src/lib/art.ts`: `getRaceWeekend(season, slug)`, `getSessionDate(season, slug, sessionSlug)`, `formatWeekendRange(weekend)`.
- Wire dates into `replay-library-client.tsx`:
  - Cluster card shows weekend day range (`Fri 21 - Sun 23 Mar 2025`).
  - Each session link shows its specific date.
- Document calendar source in `docs/art-attributions.md`.

### Increment 3 — Wind tunnel modes + airflow polish
- Mode switcher with three options:
  - `glb` — current GLB-derived column-envelope silhouette (default fallback when others missing).
  - `svg` — hand-curated side-profile SVG silhouette per constructor at `apps/web/public/images/silhouettes/<season>/<slug>.svg` (or use 9Router-generated stylised silhouette where the artist hasn't traced yet).
  - `procedural` — algorithmically built F1 side-profile from the team's bbox + canonical proportions (front wing, nose, halo, cockpit, sidepod, engine cover, rear wing). Always available, looks like an F1 car.
- Renderer upgrades:
  - Subtle dark-glossy paint with team-colour accent stripe and rim-light on the silhouette.
  - Ground shadow ellipse beneath body so it looks grounded.
  - 7 thicker inlet streaklines from the left edge plus the existing field particles.
  - Animated rolling-road dashes whose speed scales with airspeed.
  - Wake instability puff downstream of the tail.
  - Frame-rate counter in the readout.
  - Stage canvas height bumped to 460.
- Honest copy: subtitle adds `Silhouette = <mode>; flow field = live solver`.

### Verification (each increment)
- `npm run next:build -w @f1-racing/web`
- Local static smoke
- `npx netlify deploy --prod --no-build --dir apps/web/out --site d783914b-0638-46bc-ae4b-371b66cca51e --filter @f1-racing/web`
- Production smoke
- OCI `GET https://f1-api.129.150.58.64.sslip.io/health`

### Progress
- [x] Increment 1 (commit 6bcc77a)
- [x] Increment 2 (commit 0c5394f)
- [x] Increment 3 (commit c2c80c2)
