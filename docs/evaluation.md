---

# F1 Racing App — QA Evaluation Report v2

**URL:** `https://playful-peony-77899c.netlify.app/`
**Tester:** Comet (AI QA) · **Build:** v2 post-update
**Date:** 2026-05-20 22:00 +07 · **vs Previous:** v1 report from same day

***

## 1. V1 → V2 FIXED ISSUES ✅

| Was | Now |
|-----|-----|
| `STATUS: LIVE` during simulation | ✅ `STATUS: SIMULATED` |
| No tyre legend | ✅ `S SOFT · M MEDIUM · H HARD · I INTER · W WET` in leaderboard footer on all pages |
| DNF drivers showing `0 km/h` | ✅ `DNF Out of session` / `DNS Out of session` labels |
| Page title `"Home"` | ✅ `"F1 Racing — Replay-first F1 viewer"` |
| Session title `"F1 Racing · F1 Racing"` duplicated | ✅ `"Australian Grand Prix · Race · F1 Racing"` |
| Session Summary horizontal overflow | ✅ Responsive two-column card grid |
| Replay Library no search/filter | ✅ Live search + NEWEST/OLDEST FIRST sort + count badge |
| No keyboard hints on Live page | ✅ `Click · Shift+click · Esc` hints added inline |
| COMPARE tab hardcoded NOR vs VER | Partially improved (see issues below) |
| Missing constructor explanation | ✅ Inline note: "Coming soon: Williams, Racing Bulls, Haas, Kick Sauber" |

***

## 2. NEW FEATURES IN V2

### 2.1 Analysis Deck — 3 new tabs (was 3, now 6)

| Tab | Content | Status |
|-----|---------|--------|
| TELEMETRY | Per-driver: speed, tyre, last lap, throttle, brake, gear, DRS, RPM, lap | ✅ Working |
| COMPARE | Selected driver pair delta + derived events | ⚠️ See issues |
| STINTS | Tyre window snapshot per driver | ✅ Working |
| **STRATEGY** *(new)* | Pit loss (green: 18.9s, SC: 11.5s), crossover % (Inter: 95%, Wet: 99%), recommended pit windows | ⚠️ Bug: see §3.4 |
| **TRACK** *(new)* | Circuit name, path points (631), total laps, DRS zones (3, illustrative), data source, keyboard hint: D/L/B | ✅ Working |
| **RACE CONTROL · 113** *(new)* | Full 113-message log with sub-filters: ALL / FLAGS / DRS / SC·VSC / PENALTIES / INVESTIGATIONS / OTHER | ⚠️ See §3.5 |

### 2.2 Canvas Wind Tunnel (Modelview)

- Particle flow simulation with LOW/HIGH pressure tinting
- **Controls:** AIRSPEED slider (20–140 m/s, default 80), YAW (−15° to +15°), RIDE HEIGHT (20–50mm, default 28)
- **Checkboxes:** DRS OPEN / ROLLING ROAD / WHEELS ROTATING
- Disclaimer: "Tier 2 LBM solver coming next" [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=mclaren)
- ⚠️ See issues §3.7

### 2.3 Live Page — DISPLAY DELAY slider

- Range input 0–60s, default 0s [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/live/)
- Useful for real socket feed but no visible effect in simulator mode

### 2.4 Home Page — Hero 3D Model

- RB21 now rendered as actual 3D GLB in the hero viewport [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/)
- Full Red Bull team card: TEAM CHIEF / TECHNICAL CHIEF / driver links to formula1.com

### 2.5 Replay Library — Search + Sort [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/)

- Live search with spinner, real-time counter update ("1 grand prix")
- X button to clear search
- NEWEST FIRST / OLDEST FIRST sort buttons
- "25 grand prix" total count badge

### 2.6 Session Summary — Enhanced Driver Cards

- New field: BEST SECTOR (S1/S2/S3)
- Race result position badge (#1, #4, #5…)
- DNF/DNS drivers handled correctly (Best Lap shown correctly as 0.000 but that's source data)

***

## 3. ACTIVE BUGS & ISSUES

### 3.1 REPLAY — Scrubber / Timeline (HIGH)

The scrubber bar has no visual event markers even when `EVENTS B` is toggled ON. The TRACK tab says "Press B for race-control event markers on the timeline" but the scrubber remains a plain progress bar. **Expected behavior:** SC/VSC/yellow/blue flag events should appear as colored tick marks on the timeline to allow direct clicking to jump to incidents — like Motec i2 or F1 TV Pro timeline. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

**Current:** 80+ "Jump to" buttons exist in DOM but all at same coordinates (743, 593) — they are visually collapsed/invisible.

### 3.2 REPLAY — Buffer Wall (HIGH)

`BUFFERED TO 9:58` hard cap visible at all times. For the Australian GP (race ~2h), only 9:58 of data is loaded. No "Load more data" button, no skeleton/spinner for loading rest of session, no explanation to user why they can't seek past 9:58. All seek/skip-forward controls beyond this silently fail.

### 3.3 REPLAY — Last Lap times at Lap 1/early laps (MED)

Leaderboard shows "Last 1:57.099", "Last 2:04.644" etc. at lap 5 — these are valid but look like errors without context. The time field label says "Last" without unit — should be "Last lap" and ideally formatted relative to the fastest lap (delta e.g. `+0.932s`).

### 3.4 STRATEGY — Recommended Pit Windows Bug (HIGH)

The strategy tab shows "Recommended pit windows" with 3 identical entries all reading: `"Laps 1-2 · INTERMEDIATE window from lap 1 to 2"` — duplicated data, clearly wrong. Should show different tyre windows/compounds per stint phase. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

### 3.5 RACE CONTROL — Category Labels Wrong (MED)

When PENALTIES filter is active, each message still shows **"Other"** as the display label instead of **"Penalty"**. The filter query works correctly but the rendered category badge is not re-mapped. E.g.: `Other · T+1742104790s · Lap 57 · FIA STEWARDS: 5 SECOND TIME PENALTY` — "Other" should be "Penalty". [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

### 3.6 LIVE — Tyre "0 laps" for recently pitted drivers (MED)

In the Abu Dhabi simulation near the end: HAM and ALB show `HARD, 0 laps` — this means they just pitted but the lap counter hasn't updated yet. Should show at least `HARD, <1 lap` or wait 1 lap to display `0`. Also HUL shows `Last 108.522s` — an outlier slow lap (likely out-lap) showing raw time with no flagging. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/live/)

### 3.7 WIND TUNNEL — Car Silhouette is a Wing Profile Only (MED)

The Canvas Wind Tunnel renders a generic aerofoil/wing cross-section, not the actual McLaren MCL39 silhouette. Despite being named "Airflow sketch around McLaren MCL39" the shape is not constructor-specific. Switching constructors has no visible effect on the tunnel shape. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=mclaren)

### 3.8 MODELVIEW — Hero Section Below Fold (MED)

On load, the Modelview page shows a full-screen hero text block ("Rotate the car, switch constructors…") that pushes the 3D canvas below the fold. Users must scroll to find the model. The 3D viewer — the primary purpose of this page — should be above the fold or in a split layout. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=mclaren)

### 3.9 MODELVIEW — Hotspot vs Orbit Conflict (MED)

Clicking on named hotspots (Front wing, Floor, Rear wing, Brakes, Tyres) on the 3D canvas canvas requires a precise click with no drag. Any tiny movement triggers orbit instead of hotspot selection. No mode toggle to separate "inspect" from "orbit" interactions.

### 3.10 REPLAY LIBRARY — "Support session" copy vague (LOW)

Cards still read "Race and **support session** exported." with no explanation of what "support session" means. Could be qualifying, sprint, practice. The actual links show Race + Qualifying, which contradicts the vague label.

### 3.11 LIVE — Race Control Toggle Button Still Disabled (LOW)

`button "Toggle race control messages" [disabled]` still present in DOM. The messages display is always-visible on screen but not collapsible. The disabled button should either be removed or enabled with collapse functionality.

### 3.12 LEARN — No Inline 3D Model (LOW)

Learn module pages (/learn/car, /learn/aero etc.) are text-only. The "CONTINUE → View 3D car model" link goes to Modelview as a separate page, breaking the inline reading flow. The learn page description promises integration with the model but delivers a navigation redirect instead. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/learn/car/)

### 3.13 CONSISTENCY: Heading Typography Across Pages (LOW)

Pages use inconsistent heading scale:

- Replay Library hero: Large bold display type ✅ consistent [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/)
- Modelview: Full-screen large hero ✅
- Home: Large italic bold ✅
- Learn/Car: Small serif `"Car"` heading in a card — significantly smaller than other pages
- Live: `"Abu Dhabi Grand Prix"` display heading ✅
- Race Replay: `"Australian Grand Prix"` display heading ✅
- Session Summary: Very large responsive serif — different font family (serif vs sans-serif elsewhere)

Session Summary uses a **different font family (serif)** from all other pages (sans-serif). This is visually jarring and inconsistent. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/2025/australian-grand-prix/race/)

***

## 4. UX BENCHMARK: PLAYBACK CONTROLS vs. INDUSTRY

Benchmarked against F1 TV Pro, Motec i2, and iRacing replay.

| Feature | This App | F1 TV Pro | Motec i2 | iRacing |
|---------|----------|-----------|----------|---------|
| Play/Pause | ✅ Space | ✅ | ✅ | ✅ |
| Speed presets (9 speeds) | ✅ 0.1–20x | ✅ 2 speeds | ✅ variable | ✅ |
| Seek buttons (-5m to +5m) | ✅ | ✅ | ❌ | ⚠️ |
| Prev/Next lap | ✅ | ❌ | ✅ | ✅ |
| Keyboard shortcuts | ✅ Space/arrows/R/1-5 | ⚠️ partial | ✅ full | ✅ full |
| **Timeline scrubber** | ⚠️ click-to-seek only | ✅ full hover preview | ✅ labeled | ✅ |
| **Event markers on scrubber** | ❌ not visible | ✅ SC/Flag icons | ✅ | ✅ |
| **Hover preview (ghost cursor)** | ❌ | ✅ lap/time tooltip | ✅ | ❌ |
| **Loop/bookmarks** | ❌ | ❌ | ✅ | ✅ |
| **Jump to incident** | ⚠️ via Race Control tab only | ✅ inline | ❌ | ❌ |
| **Lap time waterfall** | ❌ | ❌ | ✅ | ❌ |
| **Mini-map with trail** | ❌ (map shows position, not path) | ✅ | ✅ | ✅ |
| Race Control integrated | ✅ 6-category filter | ⚠️ basic | ❌ | ❌ |
| Tyre stints visual | ✅ STINTS tab | ✅ | ❌ | ❌ |
| Strategy desk | ✅ STRATEGY tab | ❌ | ❌ | ❌ |

**Gap summary:** The main missing replay features vs. industry standard are: event markers on scrubber timeline, hover-to-preview timestamp tooltip, and the ability to loop a lap segment.

***

## 5. FEATURE IMPROVEMENT IDEAS (Priority Order)

### P0 — Fix Bugs First

1. Fix "Recommended pit windows" duplicate entries in STRATEGY tab
2. Fix RACE CONTROL message type labels (show "Penalty" not "Other" in filter view)
3. Make EVENTS B actually render SC/flag/DRS markers on the scrubber timeline

### P1 — Playback UX (Core Product Gap)

4. **Timeline hover tooltip** — show lap number + time on scrubber hover before clicking
2. **Event markers on scrubber** — colored ticks: orange for SC, yellow for yellow flag, blue for blue flag, red for red flag. Each clickable to jump. (This is the #1 missing feature vs F1 TV)
3. **"Load more data" / full-race buffer** — explain the 9:58 cap, add a "Load full race" button or auto-load on background
4. **Lap time waterfall** — new Analysis Deck tab showing all 20 drivers' lap times per lap as a heatmap/bar chart

### P2 — Live/Replay Consistency

8. **Unify playback keyboard hints** — Live page should show `Space · [ ] · 1-4x` exactly like Replay (currently shorter set shown)
2. **COMPARE tab: dynamic driver selection** — use the shift-clicked driver pair, not hardcoded NOR vs VER
3. **Leaderboard last-lap delta** — show `+0.3s` vs leader's best lap instead of raw time in leaderboard

### P3 — Modelview

11. **Move 3D canvas above fold** — split hero into left-text/right-canvas layout on load, not scroll-required
2. **Wind Tunnel per-constructor silhouette** — load constructor-specific top/side profile SVG for the tunnel simulation
3. **Hotspot click mode** — add a cursor toggle: "Orbit mode" vs "Select mode" to resolve click-vs-drag conflict
4. **Side-by-side comparison** — load two constructors simultaneously for bodywork diff (was noted in v1, still missing)

### P4 — Data & Content

15. **Pit stop events on track map** — flash or animate a car marker when it pits (currently no visual indication)
2. **DRS zones on track map** — highlight the 3 DRS activation zones as colored track segments (data already in TRACK tab)
3. **Practice sessions** — add FP1/FP2/FP3 session types to replay library for circuits that have the data
4. **Learn → inline 3D embed** — embed a lightweight Modelview iframe/canvas in learn pages at relevant sections instead of forcing navigation away

### P5 — Polish

19. **Session Summary font consistency** — unify to same sans-serif typeface used site-wide; current serif is visually isolated
2. **Replay Library card: session count badge** — show e.g. "4 sessions" on sprint weekend cards so users know coverage without clicking

***

## 6. IMPROVEMENT PASS 2026-05-20 v3

### Shipped

| ID | Status | Fix |
|---|---|---|
| Circuit accuracy | Fixed | All 24 circuits now load canonical shapes from `data/track-shapes/<trackId>.json`, sourced from MultiViewer (the same source FastF1 uses for `circuit_info`). Hand-coded ovals replaced; e.g. Melbourne goes from a 16-segment oval to 618 ground-truth points, Yas Marina to 771, Spa to 1005. Replay packs now also embed `trackMetadata` (rotation, corners, DRS zones) for the Track tab. |
| 3.1 | Fixed | Scrubber events now position correctly via the existing `(t / totalTime) * 100` mapping but with a hover preview ghost cursor + tooltip showing `Lap N · Time`. |
| 3.2 | Fixed | Replaced "BUFFERED TO 9:58" hard cap with a `Loaded 9:58 / 1:42:40` indicator and a `Load full race` button that triggers `ensureTimeLoaded(totalTime)` to pull every remaining chunk. |
| 3.4 | Fixed | Recommended pit windows now group stints by `(compound, lapStart, lapEnd)` and surface the top 4 most-popular windows. The duplicate-INTERMEDIATE-laps-1-2 bug is gone. |
| 3.5 | Fixed | Race-control row badges resolve via `RACE_CONTROL_BADGE_LABEL[entry.category]` (e.g. `Penalty` instead of `Other`). |
| 3.7 | Partial | Wind tunnel V2 ships with a refined parametric F1 silhouette (front wing, body, sidepod, halo, rear wing, floor, optional DRS gap) themed by constructor accent color. Per-constructor exact silhouettes are queued for the next pass per `docs/roadmap.md`. |
| 3.8 | Fixed | Modelview hero is compact now; the studio rig and wind tunnel sit higher. |
| 3.10 | Fixed | "Support session" copy gone; subtitle now reads concretely (e.g. "Race exported. Qualifying and sprint not yet released by OpenF1."). |
| Replay UX | Fixed | Out-lap labelling for >18%-slower laps and post-pit laps. Last-lap delta to fastest. |
| Wind tunnel | Replaced | Tier 2 ships: real 2D incompressible Navier-Stokes solver running in a Web Worker on a 320 by 120 grid. Density + speed fields rendered onto the canvas, particle drift follows the live velocity field, drag/lift readout panel, Cp heat ribbon at the top. Tier 1 procedural mode kept as the "Lite" toggle. |
| Replay library | Fixed | Sprint-weekend session count badge added (`4 sessions`, `2 sessions`). |

### Reference repos used

Cloned `IAmTomShaw/f1-race-replay`, `theOehrly/Fast-F1`,
`adn8naiagent/F1ReplayTiming` into `.codex-temp/reference-repos/`. Used as
read-only resource to discover:

- **MultiViewer circuit endpoint** — `https://api.multiviewer.app/api/v1/circuits/{circuitKey}/{year}` exposes `x[]`, `y[]`, `rotation`, `corners`, `marshalSectors`. FastF1's `mvapi/api.py` calls this exact URL. We now call it directly from `pipeline/export/src/build-track-shapes.mjs`.
- **Race-control category mapping** — patterns adapted from `f1-race-replay/src/insights/race_control_feed_window.py` and `F1ReplayTiming/backend/services/f1_data.py`.
- **Pit-loss math** — stint-window grouping pattern adapted from `F1ReplayTiming/backend/compute_pit_loss_v2.py`.

Reference clones removed after the pass.

### Files changed

- New: `pipeline/export/src/build-track-shapes.mjs`, `pipeline/export/src/refresh-all-openf1-replays.mjs`.
- New: `data/track-shapes/<trackId>.json` × 24.
- New: `apps/web/src/components/wind/fluid-solver.worker.ts`.
- Reworked: `apps/web/src/components/wind/canvas-wind-tunnel.tsx`.
- `pipeline/export/src/build-openf1-replay-pack.mjs`: canonical shape loader + `trackMetadata` emission.
- `pipeline/export/src/build-openf1-session-pack.mjs`: stint-grouped recommended pit windows.
- `apps/web/src/components/replay/PlaybackControls.tsx`: hover tooltip + load-full-race + meta updates.
- `apps/web/src/components/replay/ReplayView.tsx`: race-control category resolution, fastest-lap delta, out-lap detection, `onLoadFullRace` wiring.
- `apps/web/src/components/replay/Leaderboard.tsx`: `lastLapDeltaLabel`, `isOutLap` rendering.
- `apps/web/src/components/replay/replay-route-client.tsx`: `ensureTimeLoaded(time >= last toTime)` loads every chunk.
- `apps/web/src/components/replay/replay-library-client.tsx`: session count badge.
- `apps/web/src/lib/data.ts`: `ReplayPack.trackMetadata` typing.
- `apps/web/src/app/cars/current-spec/page.tsx`: compact hero copy.
- `apps/web/src/app/globals.css`: heat ribbon, readout, hover tooltip, load-more, badge, compact hero.
- `docs/roadmap.md`: new shipping roadmap.

### Verification

- `npm run next:build -w @f1-racing/web`: all 256 static pages compile.
- `node pipeline/export/src/build-track-shapes.mjs`: 24/24 circuits canonical (618-1005 points each).
- `node pipeline/export/src/refresh-all-openf1-packs.mjs --skip-practice`: 60/60 session packs rebuilt with new strategy windows.
- Selective `node pipeline/export/src/build-openf1-replay-pack.mjs` runs rebuilt all replay packs against canonical shapes; sample Abu Dhabi race went from 146 trackPath points to 3081.

### Intentionally deferred to next pass

- Per-constructor exact silhouettes for the wind tunnel.
- Lap times waterfall analysis tab.
- Inline 3D model in Learn modules.
- Side-by-side Modelview compare.
- Inspect / Orbit toggle on the modelview canvas.
- FastF1 corner-distance hydration pass.
- OCI backend live-delay buffer.
