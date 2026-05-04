# Reference Replay Source Analysis - 2026-05-04

## Repositories Inspected

- `https://github.com/adn8naiagent/F1ReplayTiming`
- `https://github.com/IAmTomShaw/f1-race-replay`

Both repositories were cloned into `.codex-temp/reference-repos/` for source inspection only. The downloaded clones were removed after this analysis so no reference source is retained in the app repository.

## Current App Baseline

The F1 app now has these replay/discover foundations:

- Static-export compatible Next app in `apps/web`.
- OCI FastAPI service in `backend/main.py` for optional API and websocket delivery.
- Replay library at `/replay` and `/sessions` alias.
- Replay workspace at `/replay/[season]/[grandPrix]/[session]`.
- Live workspace at `/live` using OCI websocket when available, with static fallback simulation.
- Chunked replay payloads through `replay.meta.json`, `replay.frames/chunk-*.json`, `replay.laps.json`, and `replay.race-control.json`.
- Dense track projection helpers in `apps/web/src/components/replay/track-geometry.ts`.
- Canvas renderer with circuit surface, DRS placeholders, labels, event markers, selected-driver lines, and safety-car fallback.
- Shared leaderboard and telemetry strip for replay/live.

## F1ReplayTiming Source Findings

Primary files inspected:

- `frontend/src/components/TrackCanvas.tsx`
- `frontend/src/lib/trackRenderer.ts`
- `frontend/src/hooks/useReplaySocket.ts`
- `frontend/src/hooks/useLiveSocket.ts`
- `frontend/src/components/TelemetryChart.tsx`
- `backend/routers/replay.py`
- `backend/routers/track.py`
- `backend/services/f1_data.py`
- `backend/services/live_signalr.py`
- `backend/compute_pit_loss_v2.py`

Useful patterns:

- Canvas markers interpolate toward websocket frame targets over a short duration, instead of snapping every frame.
- Track renderer supports sector overlays, corner labels, marshal sectors, and per-sector flag indicators.
- Replay websocket protocol separates `status`, `ready`, `frame`, `finished`, and `error` messages.
- Replay socket sends a first `seek:0` request after readiness so cars appear before playback starts.
- Live socket supports delayed playback by buffering frames and releasing the latest frame after the configured delay.
- Backend replay cache tracks active websocket clients and evicts loaded session frames after idle timeout.
- Track API falls back from missing session geometry to other sessions in the same year, then previous years, before triggering slow on-demand FastF1 processing.
- FastF1 data service extracts circuit rotation, corners, marshal sectors, weather, race-control messages, and session availability.
- Pit-loss computation uses `PitInTime` and `PitOutTime`, filters out non-green stops, removes outliers, and derives green/SC/VSC estimates by circuit.
- Live SignalR client negotiates against Formula 1 live timing, subscribes to timing topics, handles pings, and reconnects with exponential backoff.

What applies directly:

- Add real track metadata export fields: `rotation`, `corners`, `marshalSectors`, `sectorBoundaries`, `sectorFlags`, `pitEntryDistance`, `pitExitDistance`, and DRS zone distances.
- Add websocket lifecycle states to the OCI backend so `/live` and `/replay` can show progress messages instead of only falling back silently.
- Add idle cache eviction to the OCI websocket server if full replay packs are loaded in memory.
- Add optional live delay controls in `/live`, implemented client-side first and backend-aware later.
- Add pit-loss and free-air prediction as a separate strategy panel, because it is useful but should not clutter core replay controls.

What does not apply directly:

- Auth and R2 storage code are not needed for the current static export and OCI deployment.
- The reference Next route structure is not used because this app already has a static-export compatible route and pack architecture.
- Backend on-demand FastF1 processing should not run during static build; it belongs in explicit pipeline commands or OCI-only admin jobs.

## f1-race-replay Source Findings

Primary files inspected:

- `src/interfaces/race_replay.py`
- `src/ui_components.py`
- `src/f1_data.py`
- `src/services/stream.py`
- `src/insights/race_control_feed_window.py`
- `src/insights/track_position_window.py`
- `src/insights/telemetry_stream_viewer.py`
- `telemetry.md`

Useful patterns:

- Race replay builds a dense reference polyline from an example lap, computes cumulative distance, computes normals, and projects car positions to along-track distance.
- A KD-tree is used for fast nearest-track lookup in Python; the browser version currently uses linear search over dense points and can later add a small grid/spatial index if profiling shows need.
- Track winding is detected with the shoelace formula so normals can be flipped outward consistently.
- Safety-car position is simulated when real GPS is unavailable, with phases such as `deploying`, `on_track`, and `returning`.
- Race progress bar carries event markers extracted from track status and race-control messages.
- UI is split into modular pit-wall windows: race control feed, track position map, driver telemetry, and telemetry stream viewer.
- Telemetry streaming broadcasts the current replay state to secondary tools/windows and sends race-control history up to current frame so late subscribers can catch up.
- Driver progress combines lap number and projected track distance, which is a better display-order heuristic than raw array order when gaps or source coordinates are noisy.
- Weather, controls help, leaderboard selection, and driver detail panels are separated into small UI components.

What applies directly:

- Keep using dense track projection and cumulative distance in the browser replay map.
- Improve normals by adding winding detection to `track-geometry.ts` so lane offsets, safety-car offsets, and DRS labels land consistently outside/inside the circuit.
- Expand safety-car data from a visual fallback into a generated frame-level payload with phase and alpha.
- Create pit-wall style tabs/cards inside the web replay workspace instead of separate desktop windows.
- Add a telemetry stream/debug route that consumes the same replay/live frame state as the main workspace.
- Add race-control feed state handling for rewinds: clear deduped messages when the playhead moves backward.

What does not apply directly:

- Arcade and PySide UI code should not be ported wholesale into the web app.
- TCP localhost telemetry streaming should be replaced with browser-compatible websocket or `BroadcastChannel` patterns.
- Multiprocessing FastF1 processing belongs in Node/Python export scripts, not in the browser app.

## Implementation Already Shipped

- Removed oversized homepage GLB load and restored the RB21 local model hero with corrected scale/camera.
- Rebuilt the replay workspace around a cinematic track stage, compact side rail, and tabbed analysis deck.
- Added chunked replay loading and route shell hydration to keep static HTML light.
- Added replay/live leaderboard search, selected-driver compare mode, telemetry strips, replay controls, hotkeys, and event markers.
- Added dense track geometry and projection for track-bound marker placement.
- Added safety-car/VSC visual fallback.
- Added `/live` with OCI websocket support and static fallback.
- Added OCI FastAPI backend and deployed it behind Caddy.
- Added Netlify production deployment flow and Vercel static export config.
- Reused the reference replay projection model so canvas marker placement and leaderboard progress both use dense along-track distance, interval-derived trailing distance, and lane offsets for OpenF1/synthetic packs.
- Added track winding detection to keep normal offsets consistent around the circuit.

## Full Plan

### Phase 1 - Finalize Discover and Replay Surface

- Rename the `/replay` experience in copy as the Discover and Replay library while keeping the URL stable.
- Show latest replay, live feed, car modelview, and learn routes as primary action cards.
- Show season/event/session groups with coverage status and plain-language pack availability.
- Keep `/sessions` as an alias to the same library until external links no longer use it.

### Phase 2 - Real Track Metadata Export

- Add a FastF1 export step that writes `track.json` per session with centerline, inner/outer edges, rotation, corners, marshal sectors, and sector boundaries.
- Add DRS zone start/end distances when source data is available.
- Add pit entry and pit exit distances for strategy overlays.
- Add fallback resolution in the static data layer: same session, alternate session for same event, then previous-year same round.
- Update `ReplayPack` typing and canvas renderer to consume the new metadata without breaking existing OpenF1 packs.

### Phase 3 - Replay Intelligence Panels

- Add a Race Control tab with category filters for flags, DRS, penalties, investigations, safety car, and other messages.
- Add a Strategy tab with pit-loss prediction, free-air estimate, tyre age, stint length, and safety-car/VSC adjusted loss.
- Add a Track tab with corner labels, marshal sectors, sector flags, DRS zones, and optional schematic mode.
- Keep current Telemetry, Compare, and Stints tabs as core panels.

### Phase 4 - Live Feed Hardening

- Add backend websocket message types: `status`, `ready`, `frame`, `finished`, and `error`.
- Add client-side live delay controls using the existing buffer pattern.
- Add reconnect status, last-frame age, and fallback reason in the live UI.
- Add optional OCI-only SignalR ingestion behind an explicit environment flag and documented operational risk.
- Keep static simulator fallback for deployments without live credentials or upstream access.

### Phase 5 - Data Quality and Performance

- Add winding detection to `track-geometry.ts` and flip normals consistently.
- Add a lightweight spatial index for projection only if profiling shows the dense linear scan is a bottleneck.
- Add frame-level generated safety-car payload with `phase` and `alpha` in export pipeline.
- Add replay chunk cache eviction metrics in client debug output.
- Add build-time audits for missing track metadata, empty race-control feeds, frozen coordinates, and missing latest manifest routes.

### Phase 6 - Documentation and Deployment

- Keep `docs/deploy-guide.md` as the deployment source of truth.
- Keep `docs/replay-map-upgrade-2026-05-03.md` as the shipped replay improvement report.
- Use this document as the source analysis and forward plan.
- Run `npm run build` before production deploys.
- Deploy frontend from `apps/web/out` to Netlify until Vercel auth is repaired.
- Deploy backend to OCI only with env preservation from `deploy/oci/README.md`.

## Immediate Next Engineering Tasks

- Add real FastF1 `track.json` metadata export for centerline, inner/outer bounds, DRS zones, corners, marshal sectors, and sector boundaries.
- Add an export schema for future `track.json` metadata without requiring all packs to provide it immediately.
- Add Race Control tab in `ReplayView.tsx` using existing `raceControlMessages` and event marker data.
- Add live delay selector in `/live` using the client buffer pattern.

## Replay Correctness Checks

- Build check: `npm run build -w @f1-racing/web` must complete static export for `/replay`, `/live`, `/sessions`, compare, stints, learn, and modelview routes.
- Browser check: open `/replay/2025/abu-dhabi-grand-prix/race`, press play, verify cars move continuously on the circuit, leader chip updates, replay clock advances, and race-control markers remain clickable.
- Data check: Abu Dhabi race pack should have a non-empty `trackPath`, non-null driver coordinates in loaded frames, and chunk metadata that covers `0..totalTime`.
- Degraded fallback check: when source coordinates are frozen, the banner must label the replay as timing-first synthetic fallback.

## Risks

- Direct live Formula 1 timing ingestion can be fragile and may be subject to upstream availability or policy changes.
- Real FastF1 metadata requires Python dependencies and should remain an explicit export operation, not a static build dependency.
- OpenF1-only packs can still lack real GPS-grade track shape; projection and synthetic fallback should remain visibly labeled as degraded when used.
