# Replay Map Upgrade - 2026-05-03

## Goal

Improve the race playback and circuit map experience using the strongest ideas from these reference projects:

- `adn8naiagent/F1ReplayTiming`
- `IAmTomShaw/f1-race-replay`

The implementation keeps this project static-export friendly and does not copy large UI/runtime blocks from those repositories.

## What Changed

- Added a shared dense track geometry helper at `apps/web/src/components/replay/track-geometry.ts`.
- Reworked the canvas renderer to draw a more legible circuit surface, status glow, start/finish marker, DRS segments, driver labels, selected-driver leader lines, and safety-car markers.
- Switched track hit-testing and leaderboard ordering toward projected circuit distance instead of only sparse frame order.
- Expanded playback controls:
  - speeds: `0.1x`, `0.2x`, `0.5x`, `1x`, `2x`, `4x`, `8x`, `16x`, `20x`
  - skips: `5s`, `30s`, `1m`, `5m`
  - event markers on the progress bar
  - toggles for labels, DRS zones, and event markers
- Added hotkeys:
  - `Space`: play or pause
  - `ArrowLeft` / `ArrowRight`: seek 5 seconds
  - `Shift + ArrowLeft` / `Shift + ArrowRight`: seek 30 seconds
  - `[` / `]`: previous or next lap
  - `1` through `5`: direct speed presets
  - `R`: restart
  - `D`: toggle DRS zones
  - `L`: toggle driver labels
  - `B`: toggle event markers
- Improved leaderboard rows with team name, last lap or speed fallback, tyre age, and DRS badges.
- Added a safety-car visual fallback when the frame status is `SC` or `VSC` but no explicit safety-car position exists.
- Cleaned public-facing copy called out by QA: model catalog notes, compare route wording, stint route wording, library coverage labels, and session summary display labels.
- Removed the fictional APX GP model from the production model selector.
- Hardened session-summary fastest-lap display to use the minimum lap time instead of trusting stale `isFastest` flags.
- Increased Yas Marina synthetic path detail to reduce the decagon-like circuit shape until real GPS track geometry is exported.

## Reference Ideas Used

- Dense reference polyline and cumulative distance projection from `f1-race-replay`.
- Replay-first control surface, track status, race-control overlays, richer timing controls, and driver telemetry workflow from `F1ReplayTiming`.
- Safety-car visual treatment inspired by `f1-race-replay`, adapted to browser canvas.

## 2026 Status

The manifest includes 2026 and the current build pipeline generates the 2026 Japan Grand Prix race pack in both canonical and public locations:

- `data/packs/seasons/2026/japan-grand-prix/race/`
- `apps/web/public/data/packs/seasons/2026/japan-grand-prix/race/`

The replay library links to that 2026 pack. Additional 2026 sessions should be added only after their packs are generated.

## Known Limits

- DRS zone rendering uses circuit-ratio placeholders until exported packs include real DRS zone geometry.
- Safety-car position is simulated when no frame-level `safetyCar` coordinates exist.
- Projection-based ordering is a display correction; source frame position remains preserved in the pack.
- Existing synthetic fallback remains available when coordinates are frozen, but it should be treated as degraded replay quality.

## Next Data Upgrade

For higher replay fidelity, export packs should include:

- real dense track geometry or FastF1 circuit metadata
- DRS zone start/end distances
- marshal sector positions
- corner labels
- pit entry and pit exit distances
- frame-level safety-car payload when track status is SC
