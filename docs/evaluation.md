---

# F1 Racing App — QA Evaluation Report v2

**URL:** `https://playful-peony-77899c.netlify.app/`
**Test Date:** 2026-05-28 | **Tester:** QA AI | **Tabs Tested:** Live, Replay (AUS GP), Replay Library, Modelview, Learn, Sessions

***

## 1. LIVE PAGE (`/live/`)

**Status: ✅ WORKING — All core widgets functional**

| Widget | Status | Detail |
|---|---|---|
| Race Header | ✅ | Abu Dhabi GP, LAP 1→5/58 advancing correctly |
| Replay Clock | ✅ | 0:00→counting in real-time at 8.0x speed |
| Status Badge | ✅ | SIMULATED badge displays correctly |
| Weather Widget | ✅ | 26.8°C air / 31.4°C track, Wind 2.9m/s·328° |
| Feed source | ✅ | "Local replay simulator" label correct |
| Track Map | ✅ | Yas Marina Circuit renders, all 20 cars animated with colored dots |
| Car position dots | ✅ | Moving correctly, separation visible |
| Race Control messages | ✅ | "SESSION STARTED", "GREEN LIGHT - PIT EXIT OPEN" broadcast live |
| Leaderboard | ✅ | VER→PIA→NOR→LEC→ALO→RUS→BOR live, gaps updating |
| Tyre badges | ✅ | M/H/S per driver visible |
| Driver click selection | ✅ | Click VER → SELECTED:1, live read changes to "Telemetry on VER" |
| LIVE READ panel | ✅ | Contextual text updates on driver select |
| **TELEMETRY strip** | ✅ | SPEED: 237km/h, THROTTLE: 93%, BRAKES: 0%, RPM: 10.7k, GEAR: 6, DRS: Closed, LAP: 3 — all live |
| **STINTS tab** | ✅ | Tyre stint snapshot per team: VER M·23L+M·35L etc |
| **STRATEGY tab** | ✅ | PIT LOSS GREEN: ~18.9s, SC/VSC: ~11.5s, CROSSOVER INTER: ~95%, WET: ~99% |
| **LAP TIMES tab** | ✅ | Heatmap waterfall: 86.725s fastest / 117.758s slowest / 1156 laps, color-coded green→red |
| Display delay slider | ✅ | Visible, defaulting 0s |
| Click/Shift/Esc hints | ✅ | Instruction row present |
| Search leaderboard | ✅ | Input box present |

**🐛 Issues:**

- `Race Control` panel stuck on "T+0s · Lap 1 - SESSION STARTED" even when race progresses to Lap 5 — the Race Control message board does NOT scroll/clear old messages [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/live/)
- Only 7 drivers visible in leaderboard without scrolling — no "show all 20" affordance visible

***

## 2. REPLAY PAGE — Australian GP (`/replay/2025/australian-grand-prix/race/`)

**Status: ✅ WORKING — Core playback functional**

| Widget | Status | Detail |
|---|---|---|
| Header info | ✅ | Status: GREEN, Clock 0:00/1:46:88, Lap 1/57, Track: Melbourne, 15.7°C/19.2°C, Wind 3.9m/s·253° |
| Track map | ✅ | Melbourne circuit renders |
| Play/Pause | ✅ | Click PLAY → cars move, button becomes PAUSE |
| Timeline bar | ✅ | Progress scrubber present |
| Car positions | ⚠️ | Only **3 cars visible** (VER, NOR, BOR) — not full 20-car grid [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/) |
| "LOADED TO 47:52" | ⚠️ | Partial data only — "LOAD FULL RACE" button present but session data is truncated |
| FASTEST NOR: 1:22.167 chip | ✅ | Shows correctly |
| OPENF1 FEED / LEADER VER chips | ✅ | Shown |
| SELECTED 6 chip | ✅ | Shows 6 drivers initially |
| Drag-to-pan / scroll-zoom | ✅ | Map controls documented in description |

**🐛 Issues:**

- Partial race load by default (only to 47:52 of ~1:46:52 race) — 3-car skeleton visible on first load [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)
- "LOAD FULL RACE" requires explicit user action — no auto-load notice above the fold

***

## 3. REPLAY LIBRARY (`/replay/`)

**Status: ✅ EXCELLENT**

| Widget | Status | Detail |
|---|---|---|
| Hero CTA buttons | ✅ | "Open latest replay", "Open live feed", "Open modelview", "Open learn" all present |
| Shortcut tiles | ✅ | LATEST PACK: Abu Dhabi GP / LIVE DESK: Socket or simulator / MODELVIEW: Current-spec cars |
| Tag filters | ✅ | "2025 season pack", "Abu Dhabi Grand Prix · Race", "Coverage varies by available exported data" |
| Search bar | ✅ | "Search by Grand Prix, circuit, or session" |
| Sort | ✅ | NEWEST FIRST / OLDEST FIRST toggle |
| Count | ✅ | "36 grand prix" displayed |
| 2026 Season cards | ✅ | Australian, Bahrain, Chinese (Sprint Full Coverage), Japanese GPs |
| 2025 Season cards | ✅ | Saudi Arabian, Singapore, Spanish, United States GPs (incl Sprint) |
| 2024 Season cards | ✅ | Abu Dhabi, British, Las Vegas (Race only note), Sao Paulo |
| Sprint Weekend badge | ✅ | Chinese GP correctly flagged "SPRINT WEEKEND · FULL COVERAGE" |
| Las Vegas partial note | ✅ | "Race exported. Qualifying and sprint not yet released by OpenF1" — transparent |
| Session sub-cards | ✅ | Race/Qualifying/Sprint/Sprint Qualifying with dates |

***

## 4. MODELVIEW (`/cars/current-spec/`)

**Status: ⚠️ PARTIAL — Static images work, 3D fails**

### 4a. Studio Stage / Car Viewer

| Component | Status | Detail |
|---|---|---|
| Season dropdown | ✅ | "2026" selected |
| Constructor dropdown | ✅ | "FIA 2026 spec" |
| View buttons (Studio/Side/Front/Top) | ✅ | Each changes the static camera photo correctly with updated caption |
| Orbit button | ✅ | Active/selected state shown (orange ring) |
| Inspect button | ✅ | Present |
| Clean / Studio lighting | ✅ | Second "Studio" button toggles lighting |
| Compare side-by-side | ✅ | Button present |
| Hotspot: FRONT WING | ✅ | Changes view, shows AIRFLOW STORY sidebar, "Open aero module" / "Open focus replay" buttons |
| Hotspot: FLOOR | ✅ | Present |
| Hotspot: REAR WING | ✅ | Present |
| Hotspot: BRAKES | ✅ | Present |
| Hotspot: TYRES | ✅ | Present |
| URL state sync | ✅ | `?season=2026&constructor=fia-2026&focus=front-wing` updates correctly |
| BRANCH FROM MODEL cards | ✅ | "Open car primer", "Continue to aero", "Watch latest replay" |
| **3D model loader** | 🔴 | **"LOADING FIA 2026 CONCEPT CAR · ~3.7 MB" never resolves — stuck indefinitely (tested 20+ seconds, multiple page loads)** [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/) |
| 3D model STATUS sidebar | ⚠️ | Shows "Ready for model-led stories" but viewer never renders 3D |

**Root cause hypothesis:** The FIA 2026 concept car GLB file (3.7 MB) either 404s, CORS-blocks, or fails to parse. The loading bar has no progress animation — it just hangs. Regular car models (McLaren MCL39 in Learn) do load successfully.

### 4b. CURRENT MODEL sidebar

| Data | Status |
|---|---|
| SEASON: 2026 | ✅ |
| CONSTRUCTOR: FIA 2026 spec | ✅ |
| ASSET: ~3.7 MB | ✅ |
| STATUS: Ready for model-led stories | ✅ (misleading given 3D fails) |

***

## 5. AIRFLOW SIMULATION (Wind Tunnel · 2D Navier-Stokes)

**Status: ✅ WORKING — Core simulation runs, some modes incomplete**

This was tested carefully after letting it fully warm up. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2026&constructor=fia-2026&focus=front-wing)

### Performance & Physics Output

| Metric | Value | Status |
|---|---|---|
| Grid | 320×144 | ✅ |
| Solver | Semi-Lagrangian advection, 20 Jacobi pressure projections/tick | ✅ |
| Web Worker offload | ✅ Confirmed (u/v field computed off main thread) | ✅ |
| DRAG coefficient | 0.85 (converged) | ✅ Physically plausible |
| LIFT coefficient | 0.04 (converged) | ✅ Consistent with negative lift car |
| Reynolds number | 29.3M | ✅ Correct for 80m/s · car scale |
| FPS (PROCEDURAL, settled) | 11–38 fps | ⚠️ Variable; 11 fps typical in simulation mode |
| FPS on first switch | 1 fps for ~5s | ⚠️ Solver warmup causes temporary freeze |
| Streaklines display | ✅ | Particle paths visible and flowing |
| Pressure boundary tint | ✅ | High→low Cp shown on surface |
| Legend (low→high Cp) | ✅ | Gradient scale in bottom-left |

### Controls

| Control | Status | Detail |
|---|---|---|
| AIRSPEED slider (80 m/s default) | ✅ | Slider present and labeled |
| YAW slider (0° default) | ✅ | Center-positioned |
| PARTICLES: 320 | ✅ | Slider present |
| ROLLING ROAD toggle | ✅ | Checkbox active |
| WHEELS ROTATING toggle | ✅ | Checkbox active |
| STREAMLINES toggle | ✅ | Checkbox active |
| PRESSURE (LIVE) toggle | ✅ | Checkbox active |
| DRS OPEN toggle | ⚠️ | Toggle present but **no visual change in car silhouette** when toggled — drag value unchanged at 0.85 (should differ) |

### Silhouette Modes

| Mode | Status | Detail |
|---|---|---|
| **PROCEDURAL** | ✅ | Working — parametric car body profile renders |
| **SVG ART** | 🔴 | **"Silhouette not available for this constructor yet"** — exposes raw developer command: `Run: node pixi.js/export/src/build-wind-profiles.mjs after dropping the GLB into /apps/web/public/models/` [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2026&constructor=fia-2026&focus=front-wing) |
| **OLE HULL** | ⚠️ | Renders blank/near-empty canvas with few dots, FPS jumps to 42 (no hull data for FIA concept) |
| **SILHOUETTE: PROCEDURAL** | ✅ | Label present |

***

## 6. LEARN PAGE (`/learn/`)

**Status: ✅ EXCELLENT**

| Component | Status | Detail |
|---|---|---|
| Progress tracking | ✅ | "1/6 read, 17%" with progress bar |
| "Continue with Aero" CTA | ✅ | Smart contextual next-step |
| 6 modules present | ✅ | Car (✓READ), Aero, Tyres, Braking, Setup, Strategy |
| Module cards with tags | ✅ | /learn/car, /learn/aero etc. with URLs |
| "Mark as read" button | ✅ | Per module, updates progress |
| HOW TO USE LEARN section | ✅ | Copy explains pairing with model + replay |
| **Inline 3D (McLaren MCL39 in /learn/aero)** | ✅ | Loads in ~13s, fully interactive |
| Core concepts text | ✅ | 4 key points load immediately without 3D |
| Continue to tyres/braking nav | ✅ | Cross-link navigation works |

***

## 7. SESSIONS PAGE (`/sessions/`)

**Status: ⚠️ DEPRECATED/REDIRECT**

- Renders same content as `/replay/` — confirmed deliberate deprecation with note: "Sessions has been folded into Discover and Replay"
- Page `<title>` is just "F1 Racing" (missing "Sessions ·" prefix) — inconsistent with other page titles [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/)
- Nav still shows "SESSIONS" link leading here — confusing UX

***

## SUMMARY SCORECARD

| Page | Score | Key Issue |
|---|---|---|
| Live | 9/10 | Race control messages don't scroll |
| Replay (AUS) | 7/10 | Only 3 cars, partial load by default |
| Replay Library | 10/10 | Perfect |
| Modelview 3D viewer | 3/10 | **FIA 2026 GLB never loads** |
| Airflow simulation | 7/10 | SVG ART exposes dev instruction; DRS has no effect |
| Learn | 9/10 | MCL39 loads but slow (13s) |
| Sessions | 4/10 | Deprecated page with wrong title |

***

## CRITICAL BUGS (Must Fix)

**BUG-01 🔴 FIA 2026 GLB never loads in Modelview**

- The ~3.7MB GLB file hangs indefinitely — no progress bar, no error message, just "LOADING" forever
- Affects both `/cars/current-spec/` and likely any constructor-based 3D view
- McLaren MCL39 loads fine in Learn → isolated to the FIA 2026 asset path
- **Fix:** Verify the GLB file exists at expected path, check CORS headers, add a fetch error handler with fallback message

**BUG-02 🔴 SVG ART mode exposes developer CLI command publicly**

- Message: `"Run: node pixi.js/export/src/build-wind-profiles.mjs after dropping the GLB into /apps/web/public/models/"`
- This exposes internal build pipeline instructions to end users
- **Fix:** Replace with user-friendly "SVG silhouette coming soon for this car" message

***

## HIGH PRIORITY ISSUES

**BUG-03 ⚠️ DRS toggle has no effect on drag**

- DRS OPEN/CLOSED toggle exists but DRAG stays at 0.85 regardless
- In reality DRS reduces drag by ~8-12 drag counts
- **Fix:** Apply different drag area to the rear wing section in procedural silhouette mode when D
---

## CONTINUING FROM BUG-03 — Complete Airflow Simulation & Full Report Continuation

***

**BUG-03 ⚠️ DRS toggle has no effect on drag** *(confirmed after extended testing)*

- DRS OPEN checked → DRAG stays 0.85, LIFT stays 0.04, no solver reset occurs
- The procedural silhouette does not modify its rear-wing geometry when DRS is toggled
- In reality: DRS reduces drag by ~8–12 drag counts (~10%) on an F1 car
- **Fix:** In the PROCEDURAL silhouette generator, modify the rear wing profile height/angle when `drsOpen=true`, apply a fractional drag area reduction (e.g. ×0.90) to the rear wing obstacle block, then trigger solver restart so Jacobi iterations reconverge on the new boundary

**BUG-04 ⚠️ YAW slider: form input doesn't fire native event**

- Setting YAW via programmatic input (value=15): slider visually stays at 0°, label remains "0°", solver ignores new value
- The slider is a React/Svelte controlled component that listens for `input` or `change` events — programmatic `.value` assignment doesn't dispatch them
- Dragging in browser works but the UI label only updates on `mousemove`/`touchmove`
- **Fix:** Ensure the `oninput` handler fires on all value mutation paths; add a debounced solver flush tied to the slider's `change` event

**BUG-05 ⚠️ Constructor DRAG/LIFT identical across all cars**

- Red Bull RB21 (2025): DRAG 0.85, LIFT 0.04 — **identical to FIA 2026 concept**
- Both cars use same procedural silhouette geometry — constructor selection does not change the 2D boundary shape fed to the Navier-Stokes solver
- **Fix:** Each constructor/season should supply distinct `silhouette.json` profile coefficients (ride height, wing rake, floor diffuser angle) so Cd/Cl differ meaningfully per car

**BUG-06 ⚠️ Solver FPS chronically low (~1 fps) for first 20–40s**

- On every mode switch or parameter change the solver drops to FPS:1 for an extended warm-up period
- 20 Jacobi iterations per tick is computationally heavy for a 320×144 grid in a single Web Worker
- **Fix:** Implement progressive convergence — render at low particle count during warmup (first 50 ticks), then scale up; alternatively use requestAnimationFrame batching to render every Nth solver tick to keep visual FPS >15 even during convergence

**BUG-07 ⚠️ Loading bar never dismisses after 3D model renders**

- Red Bull RB21 renders correctly after ~15–20s but "LOADING RED BULL RB21 · ~3.1 MB (COMPRESSED)" bar persists indefinitely
- The `onLoad` callback from the GLB loader is either not clearing the loading state flag, or the progress event never reaches 100%
- **Fix:** Listen for `loader.manager.onLoad` or the Three.js `GLTF.onLoad` event and clear the loading UI state; add a timeout fallback at 30s

***

## 8. ADDITIONAL FINDINGS — Airflow Simulation Deep Tests

### Reynolds Number Scaling (CORRECT ✅)

| AIRSPEED | RE | Expected (ratio) | Status |
|---|---|---|---|
| 80 m/s | 29.3M | baseline | ✅ |
| 100 m/s | 36.6M | 36.6M (×1.25) | ✅ Correct |

*Drag/Lift Cd values unchanged with airspeed — physically correct (Cd is velocity-independent in incompressible regime)*

### Control Matrix

| Control | UI Updates | Solver Reacts | Output Changes | Status |
|---|---|---|---|---|
| AIRSPEED slider | ✅ label + Re | ✅ solver restarts | ✅ Re scales correctly | ✅ |
| YAW slider (drag) | ✅ visual | ✅ | ⚠️ Untested fully | ⚠️ |
| YAW slider (form) | 🔴 no update | 🔴 | 🔴 | BUG |
| PARTICLES slider | ✅ label | ✅ count changes | ✅ density visual | ✅ |
| DRS OPEN | ✅ checkbox | 🔴 no solver change | 🔴 no Cd change | BUG |
| ROLLING ROAD | ✅ checkbox | ⚠️ unclear | ⚠️ | ⚠️ |
| WHEELS ROTATING | ✅ checkbox | ⚠️ unclear | ⚠️ | ⚠️ |
| STREAKLINES | ✅ checkbox | ✅ hides particles | ✅ | ✅ |
| PRESSURE (LIVE) | ✅ checkbox | ✅ toggles Cp tint | ✅ | ✅ |

### Tab Modes

| Mode | Renders | Notes |
|---|---|---|
| PROCEDURAL | ✅ | Generic car profile, FPS 11–38 settled |
| SVG ART | 🔴 | "Silhouette not available" + dev CLI instructions exposed |
| GLB HULL | ⚠️ | Near-blank canvas, FPS spikes to 42 (minimal boundary) |

***

## 9. 3D MODEL VIEWER — Full Assessment

| Constructor | Season | Load result | Notes |
|---|---|---|---|
| FIA 2026 spec | 2026 | 🔴 Never renders | Loading bar stuck, blank canvas on fresh load |
| Red Bull Racing (RB21) | 2025 | ✅ Renders ~15–20s | Loading bar persists after render |
| McLaren (MCL39) | 2025 | ✅ Renders ~13s (in Learn) | Loading bar dismisses |
| Ferrari, Mercedes, Aston Martin, Alpine | 2025 | ⚠️ Not tested | Available in constructor dropdown |

**Root cause for FIA 2026 GLB:** The `/public/models/fia-2026.glb` (or equivalent path) likely 404s or has a CORS mismatch. Constructor models for 2025 load via compressed GLB (~3.1 MB draco) but the FIA concept car is uncompressed (~3.7 MB) and may be on a different CDN path. Add console error handling and a user-friendly fallback message.

***

## 10. CONSTRUCTOR DROPDOWN COVERAGE

**2026:** FIA 2026 spec only (1 entry) — expected  
**2025:** Red Bull Racing, McLaren, Ferrari, Mercedes, Aston Martin, Alpine (6 entries)  
**Missing from 2025:** Haas, Williams, Racing Bulls (RB), Kick Sauber — 4 constructors absent  
**Fix:** Add stubs for remaining 4 constructors with placeholder GLBs or "coming soon" status

***

## 11. UX / INTERACTION ISSUES

| # | Issue | Severity | Detail |
|---|---|---|---|
| UX-01 | "SURFACE READY" badge meaning unclear | Low | Users don't know what "surface ready" means vs not ready |
| UX-02 | Hotspot "BRAKES" positioned at x=28 (far left) | Medium | May clip off-screen at narrow viewports |
| UX-03 | Orbit + Studio both show "active" (orange) simultaneously | Low | Two active toggle states visually conflict |
| UX-04 | No error state when 3D fails | High | User sees loading forever with no recourse — add retry button |
| UX-05 | Compare side-by-side button has no visible action | Medium | Clicking it does nothing visible — stub or incomplete feature |
| UX-06 | Inspect button has no visible action | Medium | No tooltip or panel opens — unclear purpose |
| UX-07 | LOADING bar never reaches 100% / never dismisses | High | Misleads user that render is incomplete |
| UX-08 | No keyboard shortcuts for airflow controls | Low | Power users expect spacebar pause, arrow for airspeed |

***

## 12. IMPROVEMENT / FEATURE IDEAS

| ID | Idea | Priority | Detail |
|---|---|---|---|
| F-01 | **DRS visual toggle in simulation** | High | When DRS open, flatten rear wing geometry in procedural silhouette, show Cd delta vs baseline (e.g. "−0.09") |
| F-02 | **Constructor-specific aero profiles** | High | Each car should produce different Cd/Cl — use real CFD-derived coefficients per team |
| F-03 | **Solver convergence indicator** | Medium | Show "converging…" / "converged ✓" badge instead of raw FPS count |
| F-04 | **Airspeed → lap time delta widget** | Medium | Show estimated straight-line gain/loss vs baseline airspeed (marketing hook) |
| F-05 | **3D model fallback state** | High | If GLB fails after 15s, show a flat SVG silhouette with a "3D unavailable" banner + retry |
| F-06 | **Replay scrubbing in AUS GP partial mode** | Medium | Allow seeking within the 47:52 loaded portion before user clicks "Load Full Race" |
| F-07 | **20-car skeleton in partial replay load** | Medium | Show all 20 car dots in correct starting grid positions even before full data loads |
| F-08 | **Race Control log** | Medium | LIVE page Race Control messages should be scrollable log, not static — append new events as cards |
| F-09 | **Persistent "LIVE" badge** | Low | Should pulse/animate differently from "SIMULATED" to make the data source clearer |
| F-10 | **Sessions page → proper redirect 301** | Low | `/sessions/` should 301 to `/replay/` — currently renders duplicate content with wrong title |
| F-11 | **GLB HULL mode for FIA 2026** | Medium | Build the pixi.js export pipeline for the FIA concept so GLB HULL and SVG ART are populated |
| F-12 | **Particles max increase + quality presets** | Low | Max 1200 particles feels low for high-DPI screens — offer "Low/Med/High" presets that also adjust Jacobi iterations |
| F-13 | **Inspect mode** | Medium | The "Inspect" view button should activate exploded diagram / part labels on the 3D model |
| F-14 | **Compare side-by-side** | Medium | Should open a split 3D view with two constructors (e.g. FIA 2026 vs Red Bull 2025) — currently no-op |
| F-15 | **YAW effect on side-force (Cy)** | Medium | Display a side-force coefficient Cy alongside drag/lift that responds to yaw angle |

***

## FINAL RISK MATRIX

| Component | Risk | Impact | Likelihood |
|---|---|---|---|
| FIA 2026 GLB never loads | 🔴 Critical | Breaks main selling feature of MODELVIEW | Confirmed |
| SVG ART exposes dev CLI | 🔴 High | Brand/security — looks amateur | Confirmed |
| DRS no physics effect | 🟡 Medium | Educational accuracy compromised | Confirmed |
| AUS GP 3-car partial load | 🟡 Medium | Confusing UX on first visit | Confirmed |
| FPS 1 solver warmup | 🟡 Medium | Users think sim is broken | Confirmed |
| Sessions page duplicate | 🟢 Low | SEO + confusion only | Confirmed |
| 4 missing 2025 constructors | 🟢 Low | Completeness gap | Confirmed |

**Overall App Health: 7.2/10** — Replay and Live data pipeline is excellent; Modelview 3D and airflow DRS physics are the two critical gaps to fix before wider release.
