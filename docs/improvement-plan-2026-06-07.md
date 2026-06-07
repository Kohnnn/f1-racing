# Improvement Plan — 2026-06-07

Three-track plan continuing from the v5 QA pass (`docs/qa-evaluation-report-v5.md`).
The v5 production deployment cleared the release blockers; this plan closes the
remaining loose ends, then lights up dormant data surfaces, then deepens the
wind tunnel.

Execution order: **A → B → C**. Each track builds, smokes locally, deploys, and
re-checks OCI health before the next track starts. This document is updated with
per-item checkboxes as work lands.

User decisions (2026-06-07):
- Improve all three tracks.
- Investigate `/compare` and `/stints` state before planning B (done — see below).
- Produce this written plan, then ship all of Track A in one pass.
- For missing FIA silhouettes: **generate** the assets (not gate the modes off).

---

## Investigation findings (pre-work)

- `/compare/[season]/[grandPrix]/[session]/[left]/[right]/page.tsx` and
  `/stints/[season]/[grandPrix]/[session]/page.tsx` are **fully built and
  functional**. They render telemetry traces, compare summaries, section
  deltas, and stint stories from real packs. Both `notFound()` when a pack is
  absent.
- They are reachable **only** from inside `ReplayView.tsx` (lines ~833-835) and
  `session-route-client.tsx` (lines ~94/233). There is **no index page** and
  **no nav entry**. `site-nav.tsx` exposes only Live, Replay, Modelview, Learn.
- Root cause of the v5 FIA `SVG art` 404: `apps/web/public/data/silhouettes/`
  is **untracked in git** (`?? apps/web/public/data/silhouettes/`). The curated
  `fia-2026.json` exists locally but never deployed.
- The FIA GLB-hull profile (`data/wind-profiles/fia-2026.json`) is tracked but
  noisy: aspect 2.279 vs the 3.05 F1 side-view target, 27 points.
- `/learn/aero` console `TypeError: Failed to fetch` originates from the dynamic
  `import("@google/model-viewer")` chunk in `lib/model-viewer-loader.ts`. Retry
  logic exists but the first failed fetch still surfaces in the console.

---

## Track A — Close v5 loose ends (this pass)

- **A1 `/learn/aero` `TypeError: Failed to fetch`** — reproduce via Playwright,
  capture the failing request, and harden `ensureModelViewerLoaded` so a
  transient chunk failure does not surface as an uncaught-looking console error
  (preload hint + clearer retry/catch boundary).
- **A2 FIA 2026 SVG art** — commit the untracked `public/data/silhouettes/`
  directory so the curated `fia-2026.json` deploys, and add a matching source
  copy under `data/silhouettes/` so the asset is regenerable. Verify the
  `SVG art` mode renders in production instead of 404ing.
- **A3 Convergence indicator** — add a "converging… / settled ✓" badge driven by
  the rolling variance of raw drag over recent solver ticks, alongside the FPS
  readout.
- **A4 Rolling-road + wheel legibility** — strengthen the worker so the rolling
  road and rotating-wheel toggles produce a visible, labelled effect (lower
  boundary shear + wheel wake), resolving the v5 "too small to call meaningful"
  finding.
- **A5 FIA GLB hull quality** — regenerate the FIA 2026 GLB-derived profile with
  better axis/threshold params so `GLB hull` mode reads as a legible silhouette
  rather than speckle.

### Track A progress
- [x] A1 learn/aero fetch hardening — did not reproduce on clean rebuild
  (model-viewer `loaded:true`, zero failed requests local + prod). Root cause
  was deployment/chunk skew at v5 test time. Hardened `model-viewer-loader.ts`
  with 3 spaced retries + `loadPromise` reset so a transient chunk fetch
  self-heals.
- [x] A2 FIA SVG silhouette now deploys — `data/silhouettes/` and
  `apps/web/public/data/silhouettes/` were untracked, so the curated
  `fia-2026.json` never shipped (the v5 404). Now built into the export and
  serving `200` on production. `SVG art` mode renders, no missing-state.
- [x] A3 convergence badge — already implemented (`updateSolverState` +
  `wind-tunnel__solver-state` badge: warming/stabilizing/settled/stale).
  Verified `settled` on local and prod.
- [x] A4 rolling-road + wheel legibility — amplified worker drag/lift factors.
  Rolling road now moves raw drag `-11.25%` (1.307 fixed -> 1.160 rolling),
  well clear of the convergence noise floor and the v5 `0.3%` non-effect.
- [x] A5 FIA GLB hull regenerate — committed profiles were stale dense
  ~850-point noisy polygons; the rewritten pipeline now emits clean 27-47
  point column envelopes for all 7 cars. FIA hull renders legibly; prod serves
  the 27-point profile.
- [x] Build (`next:build` clean) + local smoke + deploy + prod smoke + OCI
  health (`{"ok":true,"service":"f1-racing-api"}`). Prod deploy
  `6a25c13b19ec94b05685ccb0`, zero console errors / failed requests on
  `/cars/current-spec` and `/learn/aero`.

---

## Track B — Light up compare & stints (next pass)

- **B1** `/compare` index page listing every session with `manifest.compare`,
  grouped season → GP → session, with driver-pair deep links and circuit art.
- **B2** `/stints` index page for sessions with `manifest.stints`.
- **B3** Add Compare and Stints to `site-nav.tsx` secondary links.
- **B4** Lift compare/stint cross-links above the fold on session summaries.
- **B5** Add Compare/Stints affordances to Replay Library cards where packs
  exist.

### Track B progress
- [x] B1 `/compare` index — 76 session cards / 76 driver pairs across 3 seasons,
  circuit map art + session dates, deep links to the `[left]/[right]` route.
  New `lib/discovery.ts` scans manifests at build time so only sessions that
  ship a compare pack are listed (no `notFound()`).
- [x] B2 `/stints` index — 81 session cards linking to the stint-story route.
- [x] B3 nav — Compare and Stints added to the primary nav
  (`Live · Replay · Compare · Stints` + `Modelview · Learn`).
- [x] B4 session-summary cross-links — already above the fold in
  `session-route-client.tsx` (Open compare route / Open stint story with
  disabled fallbacks); verified, no change needed.
- [x] B5 Replay Library hub — added Compare/Stints buttons to the hero actions
  and `Lap Compare` / `Stint Story` cards to the discover-action grid.
- [x] Build clean + local smoke (deep link `RUS vs ANT` resolves) + prod deploy
  + prod smoke (parity with local, zero console errors) + OCI health.

---

## Track C — Wind tunnel depth (later pass)

- **C1** Vector / vorticity overlay toggle.
- **C2** Wake / separation markers from a vorticity threshold.
- **C3** Stable pressure scaling (running normalization, no warm-up colour jump).
- **C4** Quality presets (Low/Med/High) controlling particles, transfer cadence,
  Jacobi iterations.
- **C5** (stretch) Real wheel-boundary rotation tied to wheel mask positions.

### Track C progress
- [x] C1 Vector overlay — added a standalone `Vectors` toggle so the velocity
  vector field renders in any flow view, not just Technical. (Vorticity tint
  remains part of the Technical view.)
- [x] C2 Separation markers — new `drawSeparationMarkers` walks the upper body
  envelope, samples streamwise velocity just outside the surface, and rings the
  first flow-reversal point (boundary-layer separation). Gated behind a
  `Separation` toggle.
- [x] C3 Stable pressure scaling — surface Cp tint now eases a persistent
  min/max range (fast expand, slow contract) via `cpRangeRef` instead of
  rescaling from per-frame extremes, removing the warm-up colour jump. Range
  resets with the solver signature.
- [x] C4 Quality presets — `Low/Medium/High` buttons cap the particle budget
  (48 / 96 / 200); the particle init effect clamps to the preset.
- [~] C5 real wheel-boundary rotation — deferred (stretch). Current wheel wake
  injection is retained; full mask-tied rotation is a future pass.
- [x] Build clean (no lint warnings) + local smoke (vectors/separation toggle,
  quality switches, canvas animates, zero console errors) + prod deploy + prod
  smoke + OCI health.

---

## Verification gates (per increment)

1. `npm run next:build -w @f1-racing/web`
2. Local static smoke on touched routes (`python -m http.server` + Playwright probe)
3. `npx netlify deploy --prod --no-build --dir apps/web/out --site d783914b-0638-46bc-ae4b-371b66cca51e --filter @f1-racing/web`
4. Production smoke (route renders + clean console)
5. OCI health: `GET https://f1-api.129.150.58.64.sslip.io/health`
