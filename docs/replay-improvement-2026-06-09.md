# Replay Improvement Plan & Log — 2026-06-09

Replay feature overhaul: fix car-positioning bugs, smooth the circuit, move to
real GPS positions, and leverage telemetry. Shipped incrementally with the
standard gate (build → local Playwright smoke → Netlify prod deploy → prod
smoke → OCI health) between each.

Production URL: https://playful-peony-77899c.netlify.app
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
- **Remaining:** qualifying/sprint sessions still use synthetic-coordinate
  packs. Telemetry features work there but are spatially approximate until
  rebuilt with GPS.

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
