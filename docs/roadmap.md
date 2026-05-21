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

## Current pass status (2026-05-22)

### Shipped in this pass

- **DRS zones on track map** — `pipeline/export/src/seed-drs-zones.mjs` writes FIA-published 2025 DRS-zone fractions into every `data/track-shapes/<trackId>.json`. `track-renderer.ts` resolves zones from `replay.trackMetadata.drsZones` (cumulative-distance pairs) and tints the polyline arcs accordingly. Falls back to the previous heuristic when no zone data is present.
- **Pit-stop pulses on the track map** — `ReplayView` scans loaded frames for tyre compound transitions and tyre-age-zero resets per driver, emits short-lived `PitPulse` markers, and `drawPitPulses` ages them against the replay clock.
- **Marshal-sector flag overlays** — race-control messages mentioning `sector N` flip the corresponding sector tint via `drawMarshalSectors`. Toggle from the playback toolbar (`Marshals M` chip + `M` shortcut).
- **LIVE post-pit `FRESH` chip** — leaderboard now displays `FRESH` instead of `0 laps` for newly-pitted drivers; tooltip + aria mirror the same state.
- **LIVE out-lap detection + race-control toggle button** — out-lap heuristic ports from replay → live; new `Toggle race control messages` button collapses the inline strip.
- **COMPARE tab dynamic pair fallback** — `dynamicCompare` now falls back to `leader vs P2` of the current frame when fewer than two drivers are pinned. No more hardcoded NOR vs VER from the static manifest.
- **Typography parity** — `.session-summary-page` opts the H1 into the site-wide sans-serif. `.learn-module-page` promotes the Learn module H1 to the same display scale used by Replay/Live.
- **Miami + São Paulo corner-distance hydration** — FastF1 hydration script gained `--circuits` / `--rounds` filters and a pre-flight schedule resolver. Both circuits now have real `trackPosition` for every corner.
- **2026 season catalogue** — `build-openf1-season-manifest.mjs` builds `data/manifests/openf1-<year>-season.json` for any season; replay + session pack builders are year-aware. 14 new 2026 sessions packed across 6 weekends (Australia / China / Japan / Bahrain / Saudi Arabia / Miami).
- **2024 key races backfill** — Abu Dhabi finale, São Paulo wet, Las Vegas, British (race + qualifying each).
- **Seasons index regeneration** — `refresh-seasons-index.mjs` rebuilds the aggregated `seasons.json` from the on-disk pack inventory. Now reports 3 seasons / 34 GPs / 81 sessions.

### Shipped in pass 2026-05-21

- Per-constructor wind tunnel silhouettes (4/7 traced; Draco-compressed GLBs deferred).
- Lap times waterfall analysis tab.
- Inline 3D in Learn modules.
- Side-by-side Modelview compare.
- Inspect / Orbit toggle on the modelview canvas.
- Real corner labels via FastF1 hydration on 22/24 circuits.
- OCI live-delay buffer.

### Queued (next pass) — v3 regressions + carry-over

#### P0 — visual regressions surfaced in v3 evaluation

- **B3 Melbourne track map distortion** — normalize polyline aspect ratio to canvas bounds for circuits whose bbox aspect ratio differs from the canvas. The `buildTrackGeometry` scaler currently uses a single uniform scale derived from min(width/height) ratios; circuits like Melbourne (squat oval) end up squished vertically.
- **B7 Modelview LOADING overlay persists** — clear `LOADING …` banner on `model-viewer` `load` event.
- **B8 Modelview blank canvas gap** — fix container sizing on the modelview wrapper so the wind tunnel sits flush below the 3D viewer rather than below an empty rectangle.

#### P1 — data correctness

- **B4 Live driver code typo** (`VFR` → `VER`).
- **B5 Replay leaderboard sort** when not on a dense polyline (avoid the projected-distance fallback flipping P17 between P3/P4).
- **B6 Mini-bar gap label** — only P1 should read `Leader`.
- **B10 Inline race control widget stuck on Lap 1** — re-bind to the live frame clock, the popover already advances correctly.
- **B16 Analysis Deck heading** — propagate the active tab into the heading text (currently always says "Race control" once that tab has been used).
- **B21 CURRENT READ leader copy** — should follow the actual leader on track, not whoever was first when the page loaded.

#### P2 — UX polish

- **B2 Live track-map loading skeleton.**
- **B13 LOAD FULL RACE progress indicator** — replace the static button with a percentage + ETA while chunks fetch in the background.
- **B14 Live tyre column overflow** on narrow viewports.
- **B17 Home hero camera initial frame** — start the RB21 hero in the side-view pose.
- **B22 Modelview wind tunnel viewport pause** — pause the fluid worker when the canvas leaves the viewport.

### Long-tail / research

- **Decode Draco-compressed GLBs** so we can trace silhouettes for Ferrari, Mercedes, Alpine (needs `draco3d` or Three.js `DRACOLoader`). Deferred at user request — not in current scope.
- **Williams / Racing Bulls / Haas / Kick Sauber GLBs** — blocked on source asset drop; deferred at user request.
- **Tier 3 baked OpenFOAM Cp surface fields** projected onto the GLB.
- **Live SignalR ingestion** from the Formula 1 timing feed behind an explicit OCI-only flag.
- **Telemetry stream / debug route** that consumes the same replay/live frame state as the workspace.
- **Marshal-sector flag overlays parity** — wire FastF1 marshal sector geometry into `data/track-shapes/<trackId>.json` so overlays target real geometry, not a polyline-ratio approximation.
- **2026 practice (FP1/2/3) packs** — currently skipped to keep the OpenF1 request count down.
- **Hover preview tooltip on the scrubber** + **lap loop / bookmark mode** — closes the remaining v3 industry-benchmark gaps vs. F1 TV / Motec.
- **Wind tunnel Cp legend strip** with gradient bar.
- **Driver photo grid on Session Summary** (fix crop first).
- **Scroll-spy for Modelview sections.**
- **Session-key disambiguation for legacy 2026 `japan-grand-prix` slug** — already removed; keep an eye on stale links.

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
- Run `node pipeline/export/src/refresh-seasons-index.mjs` after any
  new pack build so `seasons.json` and the web mirror stay accurate.

