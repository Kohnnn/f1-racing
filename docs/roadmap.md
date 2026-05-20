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

## Current pass status (2026-05-20 v3)

### Shipped

- **Canonical track shapes** for all 24 circuits sourced from MultiViewer
  (the same data source FastF1 uses for `circuit_info`). Stored in
  `data/track-shapes/<trackId>.json` with rotation, centerline (200-1000
  points per circuit), corners, marshal sectors, DRS zones, pit entry/exit.
- **Replay pack pipeline** now reads canonical shapes and emits
  `trackMetadata` per replay so the front-end Track tab can render real
  corner labels and sector boundaries.
- **Race-control category badges** now use a resolved category label
  (`Penalty`, `Investigation`, `Safety car`, `Flag`, `DRS`, `Message`)
  instead of the raw OpenF1 `category` string.
- **Strategy duplicate windows fix**: the recommended-pit-windows panel
  now groups stints by lap window + compound and surfaces the most-popular
  windows (consensus pit windows) instead of repeating one stint three
  times.
- **Scrubber polish**: hover preview tooltip with `Lap N · Time` ghost
  cursor, `Load full race` button when buffer falls behind total time,
  improved progress fill with a glowing playhead handle.
- **Buffer wall fix**: `ensureTimeLoaded(totalTime)` now loads every
  remaining chunk in one shot. The `Load full race` button surfaces this
  whenever > 30 s of session is unloaded.
- **Out-lap labelling**: leaderboard now shows `Out lap` for laps that are
  more than 18% slower than the driver's stint median, or laps that
  immediately follow a compound change.
- **Last-lap delta**: leaderboard `Last 1:21.482 +0.932` shows the delta
  to the absolute fastest lap of the session.
- **Wind tunnel V2** (Tier 2): real 2D incompressible Navier-Stokes solver
  in a Web Worker on a 320×120 grid. Semi-Lagrangian advection, Jacobi
  pressure projection, density (smoke) field, drag/lift readout, Cp heat
  ribbon. Tier 1 procedural mode kept as the "Lite" toggle.
- **Modelview compact hero** so the studio rig and wind tunnel sit higher.
- **Replay library sprint badge** (`4 sessions` / `2 sessions`) on each
  GP card.
- **Reference-repo crawl**: cloned `IAmTomShaw/f1-race-replay`,
  `theOehrly/Fast-F1`, and `adn8naiagent/F1ReplayTiming` to
  `.codex-temp/reference-repos/` for inspection. Used as read-only resource
  to extract the MultiViewer circuit endpoint usage and category mapping
  patterns. Removed after the pass.

### Queued (next pass)

- **Per-constructor wind tunnel silhouettes**. Today the silhouette is a
  parametric F1 profile (front wing, body, sidepod, cockpit, halo, rear
  wing, floor) shared across constructors but coloured with the team
  accent. Next: trace per-constructor side profiles either from the GLB
  bbox or from 9router image gen "slice cut" output.
- **Lap times waterfall** analysis tab (heatmap of all 20 drivers' lap
  times per lap).
- **Inline 3D in Learn**. Lazy-mount a small `<model-viewer>` canvas in
  each `/learn/<slug>` page tied to the module subject (e.g. `/learn/aero`
  loads the front wing focus point).
- **Side-by-side Modelview compare** (two `<model-viewer>` instances side
  by side at viewport ≥1100 px).
- **Inspect / Orbit toggle** for the modelview canvas, so hotspot clicks
  no longer race against orbit drag.
- **FastF1 Python pipeline** that hydrates `data/track-shapes/<trackId>.json`
  with corner `Distance` values computed against an actual reference lap
  from each session, plus marshal-light positions. Optional and additive.
- **OCI backend live-delay buffer** (currently client-side only).
- **Williams / Racing Bulls / Haas / Kick Sauber GLBs** — waiting for
  source files.
- **Practice 1/2/3 session packs** — currently skipped to keep the OpenF1
  request count down. Add a flag.

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
