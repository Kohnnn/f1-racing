# F1 Racing — Engineering Roadmap

Living document. Tracks what shipped, what is queued, and the order we
plan to ship it in. Replaces ad-hoc notes scattered across previous QA
reports.

## Shipping cadence

We ship in full-stack passes against the live `docs/evaluation.md` QA
report. Each pass touches one or more of these surfaces:

- Frontend (Next.js static export) on Netlify production
- Replay/session data packs (regenerated via OpenF1 + canonical track shapes)
- OCI FastAPI backend (live socket + replay chunk delivery)
- Pipelines under `pipeline/export/` and `pipeline/ingest/`

## Current pass status (2026-05-21)

### Shipped in this pass

- **Per-constructor wind tunnel silhouettes** — `pipeline/export/src/build-wind-profiles.mjs` reads the GLB binary (positions traversed across the scene graph), rasterizes onto a 256×96 occupancy grid, traces the closed silhouette via top/bottom column scan, and writes `data/wind-profiles/<slug>.json`. The Tier 2 wind tunnel obstacle mask switches when the constructor changes. Falls back to the parametric F1 shape for Draco-compressed GLBs.
- **Lap times waterfall** — new SVG heat-map analysis tab. Rows = drivers (sorted by fastest), columns = laps, cells tinted green (fastest) to red (slowest).
- **Inline 3D in Learn** — `apps/web/src/components/story/learn-model-embed.tsx` lazily mounts a `<model-viewer>` inside `/learn/car`, `/learn/aero`, `/learn/setup` so the engineering reads pair with the geometry.
- **Side-by-side Modelview compare** — `Compare side-by-side` toggle adds a second `<model-viewer>` panel with its own constructor selector. Two-column grid at viewports ≥1100 px.
- **Inspect / Orbit toggle** — segmented toolbar mode lets users disable `camera-controls` so hotspot clicks no longer race against orbit drag.
- **Real corner labels on the track canvas** — new `drawCorners` in `track-renderer.ts` reads `replay.trackMetadata.corners` and places numbered pills around the circuit at each corner's `trackPosition`. Toggled by the existing `Events B` shortcut.
- **FastF1 corner-distance hydration** — new `pipeline/fastf1/hydrate-corner-distances.py` calls FastF1's `circuit_info.add_marker_distance(fastest_lap)` and writes the `trackPosition` (cumulative distance) back into each `data/track-shapes/<trackId>.json`. 22/24 circuits hydrated for 2025.
- **OCI live-delay buffer** — `backend/main.py` `/ws/live/...` now accepts a `delay` query param (0..60s). Server-side queue holds frames for the configured wall-clock delay before broadcasting. Client slider passes through.

### Shipped earlier (2026-05-20 v3)

- Canonical track shapes for all 24 circuits sourced from MultiViewer.
- `ReplayPack.trackMetadata` (rotation, corners, drs zones, length).
- Race-control category badges resolved correctly (`Penalty` not `Other`).
- Stint-grouped recommended pit windows (no more duplicate INTERMEDIATE-laps-1-2).
- Scrubber hover tooltip + `Load full race` button.
- Out-lap label + `Last 1:21.482 +0.932` delta in leaderboard.
- Tier 2 Stable-Fluids Web Worker fluid solver.
- Modelview compact hero, replay-library sprint badge.

### Queued (next pass)

- **Decode Draco-compressed GLBs** so we can also trace silhouettes for Ferrari, Mercedes, Alpine (needs `draco3d` or Three.js `DRACOLoader`).
- **Hydrate Miami + São Paulo corner distances** — alias map already extended; just rerun the FastF1 script.
- **Tier 3 baked OpenFOAM Cp surface fields** projected onto the GLB.
- **Live SignalR ingestion** from the Formula 1 timing feed behind an explicit OCI-only flag.
- **Telemetry stream / debug route** that consumes the same replay/live frame state as the workspace.
- **Williams / Racing Bulls / Haas / Kick Sauber GLBs** — waiting for source files.
- **Practice 1/2/3 session packs** — currently skipped to keep the OpenF1 request count down.

### Long-tail / research

- **Tier 3 baked OpenFOAM Cp surface fields** projected onto the GLB.
- **Live SignalR ingestion** from the Formula 1 timing feed behind an
  explicit OCI-only flag.
- **Telemetry stream / debug route** that consumes the same replay/live
  frame state as the workspace.
- **Marshal-sector flag overlays** on the Track tab.

## Operational notes

- Frontend deploys via `npx netlify deploy --prod --no-build --dir
  apps/web/out --site d783914b-0638-46bc-ae4b-371b66cca51e`.
- OCI backend lives at `https://f1-api.129.150.58.64.sslip.io`. SSH access
  uses `OCI_SSH_CONNECT` from `.env`. See `deploy/oci/README.md` for the
  preserve-env redeploy flow.
- Reference repos are always cloned into `.codex-temp/reference-repos/`
  and deleted after each pass. No upstream source is committed to the
  repo.
- `data/track-shapes/` files are committed; they are small (50-200 KB
  each) and pin the canonical shape per circuit for static export.
