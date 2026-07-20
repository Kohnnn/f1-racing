# Replay Improvement Plan & Log — 2026-06-09

Replay feature overhaul: fix car-positioning bugs, smooth the circuit, move to
real GPS positions, and leverage telemetry. Shipped incrementally with the
standard gate (build → local Playwright smoke → Netlify prod deploy → prod
smoke → OCI health) between each.

Production URL: https://f1-demo.netlify.app
OCI health: https://f1-api.129.150.58.64.sslip.io/health

## Phase 1 — Position fixes (commit 7f33fe6)

- Root cause "positions don't match": only the leader used real coordinates;
  every other car (`position > 1`) was placed by a constant-speed interval
  estimate in `TrackCanvas.computeTargetDistance`. Now every car with valid
  coordinates is placed by track projection; interval estimate is fallback only.
- Root cause "fast-forward one lap": cumulative distance = timing `lapOffset` +
  geometry within-lap distance; these desync at start/finish. Only negative
  lap-rollover was guarded. Added positive-direction unwrap guards for `distB`
  and `displayDistance`, plus a quarter-lap per-frame delta clamp on the
  residual smoother so a desync resolves smoothly instead of teleporting.

## Phase 2 — Track geometry (commit 9721a1c)

- Replaced linear densify with a closed-loop centripetal Catmull-Rom spline
  (alpha 0.5), oversampled then arc-length resampled. Smoother corners,
  consistent marker speed, better projection accuracy. Corner labels and
  start/finish line (already present) now sit on a clean racing line.

## Phase 3 — GPS-backed positions (commit 2a18a64)

- `fetchLocation` added for the OpenF1 `/location` GPS endpoint (distinct from
  `position`, which is race rank only).
- Self-calibrating similarity transform (centroid + RMS-scale + rotation
  search) maps the combined GPS cloud onto the canonical track frame; each
  driver's nearest-in-time GPS sample is projected onto the centerline. Raw
  untransformed GPS (`rawX`/`rawY`) + `positionSource` stored per frame driver.
  Synthetic lap-progress path is the per-driver/frame fallback (>5s stale).

### GPS rollout status
- Proof: 2025 Bahrain race (20/20 drivers GPS mid-race, 8.35 → 9.74 MB, +17%).
- Marquee rollout 2026-06-09: 2025 Monaco (9.89 MB), 2025 Belgian/Spa
  (10.08 MB), 2025 Italian/Monza (9.74 MB), 2026 Australian (10.71 MB). All
  20/20 GPS at mid-race, verified rendering telemetry features in production.
- Full rollout 2026-06-09: batch-rebuilt all remaining race sessions. **32 / 34
  race packs now use real GPS** (~333 MB total). The 2 exceptions
  (2026 Bahrain, 2026 Saudi Arabian) have no OpenF1 `/location` data published
  yet (0 drivers returned), so they correctly fall back to the synthetic path.
- Qualifying/sprint rollout 2026-06-09: batch-rebuilt all 47 non-race sessions
  (excluding demo-weekend). **45 / 47 now use real GPS**; the 2 exceptions are
  2026 Bahrain/Saudi qualifying (no upstream location data, consistent with
  their races). The full user-facing replay catalogue now uses real GPS
  wherever OpenF1 publishes it.
- **Remaining:** the 4 2026 Bahrain/Saudi sessions will gain GPS automatically
  once OpenF1 publishes their `/location` data — just re-run those.

## Phase 4 — Telemetry leverage

- P4.1 Racing-line heatmap (commit 6cfc32a): colour the line by the selected
  driver's speed / throttle / brake (`drawTelemetryHeatmap` + Off/Speed/
  Throttle/Brake control).
- P4.2 Real DRS zones (commit 4ad2dcd): derive zones client-side from frames
  where DRS is open (codes 10/12/14), projected onto the track and
  histogrammed; prefers derived over the illustrative fallback. Bahrain → 4.
- P4.3 Battle map (commit 9703ab3): per-driver gap-to-leader over time as SVG,
  with sustained sub-second battle detection.
- P4.4 Multi-driver telemetry: already built — shift/ctrl/meta-click in the
  leaderboard appends drivers and stacks per-driver telemetry strips.
- P4.5 Corner speed profile (commit e89e89b): bin the selected driver's speed by
  track position, flag local minima as corners with apex min-speed.
- P4.6 Tyre degradation curves (commit ac6932a): per-stint lap-time-vs-tyre-life
  curves coloured by compound, on a shared outlier-clipped axis.

## Next options
- Widen the GPS rebuild to all race sessions (and optionally qualifying/sprint).
- Real `interval` from GPS track distance (currently lap-progress time ratio).
- Sector dominance once session sector times are wired into replay packs (the
  named-corner `trackPosition` coords are empty in current packs).

## Real intervals (2026-06-09)

- `interval` now derives from GPS-based race progress (completed laps +
  projected within-lap track ratio) x the leader's reference lap time, instead
  of the lap-progress time ratio. Spatially accurate gaps that match where cars
  actually are on track; sharpens the battle map and leaderboard. Falls back to
  the time-ratio when either car lacks a GPS sample on a frame.
- Rebuilt all 76 GPS-backed packs (race + qualifying + sprint) with the new
  interval logic. The 4 GPS-less 2026 Bahrain/Saudi sessions keep the
  time-ratio fallback.

## Sector dominance (2026-06-10)

- `ReplayLap` gained optional `sector1/2/3` (OpenF1 `duration_sector_1/2/3`),
  threaded through the builder (`buildReplayLaps`) and the split `.laps.json`.
- New `ReplaySectorDominance` component + "Sectors" tab in the analysis panel:
  purple-sector cells (best S1/S2/S3 + combined ideal lap) and a ranked driver
  grid of best sectors with purple highlighting.
- Backfill: rebuilding all packs through the full builder was unnecessarily
  slow, so `pipeline/export/src/backfill-sector-times.mjs` patches sector
  times into existing `replay.json` + `replay.laps.json` in place from one
  `/laps` fetch per session (cached across the data/ and public/ mirrors).
  Result: 154 / 164 pack copies carry sector data. The 10 without are the
  4 GPS-less 2026 Bahrain/Saudi sessions (no laps at all) and 2025 Azerbaijan
  qualifying (empty pack), mirrored across both roots.
- Prod smoke 2026-06-10: Monaco race (4 purple cells, 10 rows, ideal 1:13.214),
  Bahrain 2025 race (ideal 1:34.933), Japan 2026 race (ideal 1:32.159),
  Belgium 2025 sprint (ideal 1:45.249) - all 4 cells + 10 rows, zero console
  errors. OCI health OK.

## Polish pass (2026-06-10, second deploy)

- QA sweep over 13 prod routes: zero console errors, zero failed requests on
  every live surface; all 10 replay analysis tabs click-tested clean. Only
  finding: compare/stints detail pages shipped the generic `F1 Racing` title.
- Compare + stints detail pages gained `generateMetadata` (e.g. "PIA vs RUS ·
  Bahrain Grand Prix Race compare", "Bahrain Grand Prix · Race stint story").
- Sectors tab upgraded: column header row, GAP column (delta to the fastest
  theoretical lap) and VS ACTUAL column (time each driver left on the table vs
  their best real lap), plus an explanatory footnote. Gap columns hide on
  narrow viewports to preserve the sector grid.
- Prod smoke: header `DRV|S1|S2|S3|THEORY|GAP|VS ACTUAL`, leader row `PIA -
  +0.000`, both new titles live, zero console errors. OCI health OK.

## Multi-agent feature pass (2026-06-10, third deploy)

Parallel agents shipped the remaining feasible roadmap items in one pass:

- **3D replay scene** (`components/replay/three/ReplayScene3D.tsx`): React
  Three Fiber port of the track map behind a 2D/3D toggle in the replay
  workspace. Shares the exact TrackCanvas motion model via the new
  `components/replay/interpolation.ts` (projection targets, rollover unwrap,
  smoothstep easing, residual smoother) so 2D and 3D stay in lockstep. Track
  ribbon + kerbs + corner billboards, low-poly cars with spinning wheels,
  DRS flap animation, brake glow, compound-coloured wheel rings,
  position-change pulse, Director/Follow/Trackside/Helicopter/Orbit camera rigs, yellow-flag atmosphere.
  Loaded via `next/dynamic` (ssr:false) so the 2D-only path pays no cost.
  New deps: three / @react-three/fiber / @react-three/drei (web workspace).
- **Replay debug panel** (`replay-debug-panel.tsx`): backtick toggle or
  `?debug=1`; fixed monospace overlay with clock, frame index/counts, chunk
  progress, playback speed, next-frame dt, and the focused driver's raw frame
  fields (positionSource, rawX/rawY, speed, gear, drs, interval).
- **Modelview scroll-spy** (`modelview-scrollspy.tsx`): right-rail dot nav
  (Pick a car / Studio / Wind tunnel / Next steps) with IntersectionObserver
  highlighting, smooth scroll, aria-current; hidden under 1100px.
- **SEO pass**: `sitemap.ts` (332 URLs: static + replay/sessions/stints/
  compare/learn), `robots.ts`, metadataBase + OpenGraph/Twitter blocks in the
  root layout, and robots meta flipped to `index, follow` (user-approved).
- **Wind tunnel detail**: two-tone livery band keyed off the stripe detail,
  cockpit shading under the halo, front-wing flap + sidepod undercut + beam
  wing detail kinds, DRS flap that rotates open with the DRS control; new
  `build-silhouette-from-svg.mjs` pipeline (assets/silhouettes/<slug>.svg →
  data/silhouettes/<slug>.json) with a curated McLaren side profile.
- Prod smoke: 3D toggle renders (Director/Follow/Trackside/Helicopter/Orbit all clean during playback),
  debug panel toggles, scroll-spy anchors resolve, sitemap/robots 200,
  og:site_name present, McLaren tunnel renders, zero console errors across
  every probe. OCI health OK.

## Wind tunnel SVG loop pass (2026-06-10, fourth deploy)

Test-driven loop against the local static export (geometric QA + Playwright
readout probes per iteration) until the SVG silhouette simulation behaved:

- Geometric QA script validated the curated McLaren manifest: 100 evenly
  resampled points, aspect 3.21, flat floor, sane wheelbase/arches, zero
  self-intersections.
- **Fix 1 - DRS had no solver effect in SVG mode.** The procedural builder
  reshapes its outline when DRS opens, but curated SVG polygons were static;
  only the cosmetic flap rotated. Added `applyDrsOpenToPolygon` (trims the
  rear-wing crest of the body outline above the upper quartile for
  x > 0.93 span) so the solver mask loses top-rear frontal area.
  Measured: drag 1.157 -> 0.916 (-20.8%), on par with procedural (-21.3%).
- **Fix 2 - raising airspeed lowered the drag readout.** `computeForces`
  normalized pressure/wake terms by dynamic pressure (coefficient form) but
  displayed the result as a force, so higher q deflated the number. Forces
  now re-scale by q relative to the 80 mph reference: airspeed up now reads
  drag 1.157 -> 2.109 (up, correct), and lift scales consistently.
- Toggle matrix verified settled-state values: DRS -20.8%, rolling-road off
  +12.4% drag, return-to-baseline exact (no hysteresis), yaw drives Cy,
  reset restores baseline. Zero console errors throughout.
- Prod smoke after deploy: same numbers on production; OCI health OK.

## 3D scene reinforcement (2026-06-10, fifth deploy)
- **DRS zone strips.** New `DrsZoneStrips` component renders glowing green
  centreline strips on the 3D track ribbon, mirroring the 2D resolution rules
  (absolute `from`/`to` distances against `trackMetadata.length`, with
  `fromRatio`/`toRatio` fallback). Wired through the new `drsZones` prop.
- **Safety car.** `SafetyCarBody` (silver saloon primitives) plus a flashing
  beacon mesh and an "SC" billboard, driven in `useFrame` from
  `frame.safetyCar` - visible when phase != "none", beacon colour oscillates
  with playhead time.
- **Click-to-select cars.** Car groups carry an `onClick` (stopPropagation;
  shift/ctrl/meta appends) calling the new `onDriverSelect` prop, plus a
  pointer cursor on hover. Shares `handleDriverSelect` with the 2D canvas and
  the standings list so selection stays in lockstep across views.
- **Speed trail.** `SpeedTrail` component keeps a rolling 160-point ribbon for
  the focused car, vertex-coloured by speed (HSL) and fading with age,
  updated imperatively via `trailRef.push()`; clears on focus change.
- Props `drsZones` and `onDriverSelect` threaded through `ReplayScene3DProps`
  and wired at the `<ReplayScene3D>` call site in `ReplayView.tsx`.
- Verified: `tsc --noEmit -p apps/web` clean, `next:build` clean. Local probe
  (via `npx serve`, not python http.server - the latter hits
  `ERR_NO_BUFFER_SPACE` on the heavy R3F chunk under Windows) and prod smoke
  both confirm the 3D canvas mounts, car clicks fire, zero console errors.
  OCI health OK.

## Constructor SVG silhouettes (2026-06-15)
- Closed the remaining wind-tunnel silhouette gap for the five GLB-backed
  constructors that still fell back to procedural outlines: Red Bull, Ferrari,
  Mercedes, Aston Martin, and Alpine.
- Refactored `pipeline/export/src/build-wind-profiles.mjs` so the proven GLB
  trace pipeline is importable without executing its CLI. The silhouette builder
  now reuses the same 1:1 hull trace instead of approximating from screenshots
  or hand-authored paths.
- Added `pipeline/export/src/build-silhouette-from-glb.mjs`: loads each GLB,
  traces the side envelope, normalizes orientation to nose-left / floor-bottom /
  rear-right, arc-length resamples to 100 points, derives floor/wing/halo/
  sidepod detail bands, and writes both `data/silhouettes/` and
  `apps/web/public/data/silhouettes/` mirrors plus ASCII/SVG review snapshots.
- Registered the five new slugs in `CURATED_SVG_SILHOUETTES`; SVG-art mode now
  covers FIA 2026, McLaren, Red Bull, Ferrari, Mercedes, Aston Martin, and
  Alpine.
- Hardened `applyDrsOpenToPolygon` to find the upper rear-wing crest
  dynamically. Aston Martin's rear wing sits slightly inboard of the old
  `x > 0.93` trim window, so DRS was a no-op there; the new logic targets the
  actual upper-rear crest while preserving the existing effect on other cars.
- Verified: DRS trim affects every new constructor; `tsc --noEmit -p apps/web`
  clean; `next:build` clean; local SVG-art Playwright probe passed for Red Bull,
  Ferrari, Mercedes, Aston Martin, Alpine, and McLaren.
- Production deploy `6a30266fabc4dac8b37dd5c8` passed the same SVG-art smoke on
  `https://f1-demo.netlify.app`: each silhouette fetches 200,
  SVG-art is active, canvas paints non-blank, zero console errors, zero failed
  requests. OCI health could not be checked from this Windows shell because the
  endpoint returned a TLS alert before HTTP (`tlsv1 alert internal error`) via
  curl, PowerShell, and Node fetch.

## Remaining
- 2026 Bahrain/Saudi: gain real GPS + intervals + sectors once OpenF1
  publishes their `/location` and `/laps` data.
- 2025 Azerbaijan qualifying pack is empty (no laps upstream at build time);
  re-run the builder if OpenF1 backfills it.
