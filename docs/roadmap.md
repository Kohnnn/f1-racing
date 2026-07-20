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

## Completed milestone (2026-07-20)

### Replay 3D broadcast reconstruction

- [x] Keep the accessible 2D map as the default and lazy-load 3D only after explicit selection.
- [x] Reuse the canonical replay interpolator so 2D and 3D follow identical recorded movement.
- [x] Add Director, Follow, Trackside, Helicopter, and Orbit cameras with reduced-motion-safe direction.
- [x] Render an instanced 20-car field, circuit surfaces, DRS and marshal overlays, pit pulses, telemetry heatmaps, and broadcast graphics from self-hosted CC0 assets.
- [x] Adapt DPR between 1.0 and 1.5, stop rendering offscreen, and use demand rendering while paused.
- [x] Return to 2D after missing WebGL, scene errors, or context loss.
- [x] Enforce the 2.1 MB Replay 3D asset budget and static bundle coverage in smoke tests.
- [x] Verify the featured route at `/replay/2026/miami-grand-prix/race/` before production deployment.

### Shareable pit-cycle replay

- [x] Hydrate Replay time, analysis tab, and selected drivers from validated URL state.
- [x] Add a direct action that copies the current Replay evidence URL.
- [x] Preserve clean Replay URLs for guided Story mode and use timestamped links for Workspace mode.
- [x] Derive pit-cycle outcomes only from complete race frames, recorded stint boundaries, and recorded laps.
- [x] Label every pit-cycle outcome **Derived** and expose its before/after replay anchors.
- [x] Report only supported position, replay-gap, and median pace changes; leave unsupported metrics unavailable.
- [x] Require an explicit full-race load before showing pit-cycle outcomes and disclose incomplete or unavailable inputs.
- [x] Add focused derivation and static-bundle regression checks.
- [x] Pass quality, typecheck, build, static smoke, and browser acceptance checks.
- [x] Deploy the verified static export to Netlify and complete production acceptance.

#### Acceptance criteria

- A shared Replay URL restores replay seconds, Workspace analysis, and up to four valid selected drivers.
- Invalid, negative, or out-of-range timestamp and driver values cannot corrupt Replay state.
- Pit cycles accept same-compound stops, omit out-laps from post-stop pace, and never claim measured pit loss, undercuts, overtakes, or causality.
- Partial frame windows cannot produce pit outcomes; complete-race loading remains explicit and retryable.
- Each outcome can seek to its recorded pre-stop and post-stop frame.

## Completed milestone (2026-07-16)

### Trustworthy guided replay

- [x] Select the newest complete race deterministically by canonical session date, session key, and stable lexical path.
- [x] Show replay source, generated date, position coverage, frame count, and the full pack note.
- [x] Default clean Replay URLs to Story mode and analysis deep links to Workspace mode.
- [x] Add evidence-derived race outcome, pace, strategy, race-control, and driver story steps.
- [x] Validate and synchronize `tab` and `drivers` query state for shareable Replay analysis links.
- [x] Route Compare and Stints discovery actions into Replay while retaining standalone detail routes.
- [x] Load a bounded replay window first, provide retryable chunk failures, and keep full-race loading explicit.
- [x] Make `/race-desk` the canonical historical simulation and retain `/live` as a permanent compatibility redirect.
- [x] Prevent Race Desk from constructing live-status or WebSocket requests.
- [x] Keep unavailable gaps explicit and make the 2D map keyboard accessible.
- [x] Use poster-first landing 3D, same-origin Troika fonts, and reduced-motion defaults.
- [x] Label the wind field and all force outputs as illustrative estimates, not validated CFD.
- [x] Add backend path validation, replay chunk guards, security headers, deterministic builds, and static smoke checks.
- [x] Pass merged-tree quality, build, static smoke, backend, and browser acceptance checks.
- [x] Deploy the verified static export to Netlify and complete production acceptance.

### Shipped in the 2026-05-22 pass

- **Final replay workspace polish** — playback controls now include elapsed/remaining time, restart, speed label, load-full-race progress, hover/segment ribbons for SC/VSC/yellow/red/pit/DRS, lap-loop hooks (`I`, `O`, `P`), and a keyboard shortcut overlay.
- **Professional telemetry strip** — replay telemetry now renders rolling SVG sparklines for speed, throttle, brake, and RPM alongside gear/DRS/lap readouts.
- **Live Analysis Deck** — Live now has `Telemetry`, `Stints`, `Strategy`, and `Lap times` tabs, with live stint snapshots, strategy heuristics, and lap waterfall parity with Replay.
- **Dark theme unification** — global page, panel, modelview, Learn, and control surfaces now run in a consistent dark theme. Light theme is deferred to long-tail.
- **Route-aware shell navigation** — the shared nav is client-side aware and highlights the active surface, including the restored Sessions entry.
- **Learn inline 3D stability** — inline model embeds no longer show a blank canvas; they use eager reveal, fixed viewer sizing, skeleton/progress UI, and error fallback.
- **Learn progress controls** — module pages now show a step chip and local `Mark as read` controls at top and bottom.
- **Modelview inspect upgrade** — inspect mode disables orbit, applies a dedicated visual state, pulses hotspots, adds DRS rear-wing emphasis, duplicates hotspots in compare mode, and scaffolds generated exploded-view assets at `/exploded-views/<season>/<constructor>.png`.
- **Track canvas aspect fix** — replay/live track canvases now use `ResizeObserver` and render to the actual DOM size, removing Melbourne-style CSS stretching.
- **Leaderboard correctness polish** — replay rows trust published race position, show gap-to-leader wording, wider constructor color stripes, position movement arrows, fastest-lap marker, and personal-best sector data from all driver laps.
- **Session CTA clarity** — unavailable compare/stint actions now show disabled explanatory chips instead of disappearing or linking to empty surfaces.
- **Wind tunnel offscreen pause** — the canvas solver skips simulation/draw work when offscreen to reduce wasted CPU/battery.
- **Replay Library 2026 clarity** — 2026 cards identify exported OpenF1 replay packs and coverage notes distinguish archived session types.

### Shipped in previous pass

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

- Per-constructor wind tunnel silhouettes (7/7 GLBs traced via gltf-transform + Draco + PCA axes).
- Lap times waterfall analysis tab.
- Inline 3D in Learn modules.
- Side-by-side Modelview compare.
- Inspect / Orbit toggle on the modelview canvas.
- Real corner labels via FastF1 hydration on 22/24 circuits.
- OCI live-delay buffer.
- Realistic AI exploded-view PNGs for every catalogued car (9Router cx/gpt-5.5-image).
- Streakline + Cp boundary tint wind tunnel rewrite (replaces noisy density fill and dust particles).

### Long-tail / research

- **Light theme** — deferred until the dark product shell is stable across all pages.
- **Williams / Racing Bulls / Haas / Kick Sauber GLBs** — BLOCKED on source asset drop (no GLB available); deferred at user request. Not actionable without the model files.
- **Tier 3 baked OpenFOAM Cp surface fields** projected onto the GLB — BLOCKED on offline OpenFOAM run + export pipeline; research-tier.
- **Live SignalR ingestion** from the Formula 1 timing feed behind an explicit OCI-only flag — BLOCKED on a live-backed session and F1 feed access; cannot validate offline.
- **Telemetry stream / debug route** — feasible; candidate for a future pass (consume the same replay/live frame state in a debug surface).
- **2026 practice (FP1/2/3) packs** — feasible but gated on OpenF1 request budget; deferred by choice.
- **Driver photo grid on Session Summary** — driver portraits already ship in `driver-card` with WebP-portrait → SVG-avatar fallback (no crop issue observed). Considered resolved.
- **Scroll-spy for Modelview sections** — feasible; candidate for a future UI pass.
- **Session-key disambiguation for legacy 2026 `japan-grand-prix` slug** — already removed; keep an eye on stale links.
- **Higher-resolution exploded views (1792×1024)** — BLOCKED on 9Router stream-window timeout; revisit when the gateway exposes longer timeouts.

## Shipped in this pass (2026-06-08)

- **Track A** — closed QA v5 loose ends: FIA SVG silhouette now deploys (was an untracked-git 404), GLB hull profiles regenerated to clean column envelopes for all 7 cars, rolling-road drag effect made legible (-11%), convergence badge verified, model-viewer loader hardened against chunk skew.
- **Track B** — lit up the dormant telemetry surfaces: new `/compare` index (76 sessions / 76 driver pairs) and `/stints` index (81 sessions), built from a manifest scan so no dead links; Compare + Stints added to primary nav; Replay Library turned into the discovery hub. Architecture Priority-1 surfaces are now reachable.
- **Track C** — wind tunnel depth: standalone Vectors overlay toggle, boundary-layer Separation markers, stable surface Cp tint (persistent eased range), Low/Medium/High quality presets.
- **C5 + field realism** — rigid-body rotating-wheel surface velocity (rotating wheels move drag ~-7.8%), edge-aware geometry-field smoothing pass for seam-free streamlines, and a von-Kármán-style alternating vortex street in the body wake.
- **Airflow UX (roadmap UX-08)** — keyboard shortcuts (Space pause, ↑↓ airspeed, ←→ yaw, R reset), Pause/Resume + Reset buttons, on-panel shortcut hint, and a Paused overlay.
- **Long-tail triage** — annotated remaining items as BLOCKED (external assets/feeds) vs feasible-future; confirmed driver photo grid already resolved.

## Operational notes

- Frontend deploys via `npx netlify deploy --prod --no-build --dir
  apps/web/out --site d783914b-0638-46bc-ae4b-371b66cca51e`.
- Current production domain: `https://f1-demo.netlify.app`.
- Latest accepted production deploy `6a5d0b70dee70866f4e5410b` ships the shareable pit-cycle replay milestone.
  Production acceptance passed Replay timestamp hydration, complete-race gating, pit-cycle outcomes and anchors, evidence-link copying, console, and network checks.
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
