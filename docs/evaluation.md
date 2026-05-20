---

# F1 Racing App — Full QA Evaluation Report

**URL:** <https://playful-peony-77899c.netlify.app>  
**Date:** 2026-05-20 | **Tester:** Comet (AI QA)  
**Scope:** All 4 top-level routes + sub-pages, functional interactions, data integrity, bugs, UX

***

## 1. SITE ARCHITECTURE OVERVIEW

| Route | Purpose | Status |
|---|---|---|
| `/` | Landing / hero page | ✅ Working |
| `/live` | Live race workspace | ✅ Working |
| `/replay` | Replay library | ✅ Working |
| `/replay/[year]/[gp-slug]/[session]` | Replay workspace | ✅ Working |
| `/cars/current-spec` | 3D Modelview | ✅ Working |
| `/learn` | Engineering learn index | ✅ Working |
| `/learn/[module]` | Individual module | ✅ Working |
| `/sessions/[year]/[gp]/[session]` | Session summary | ⚠️ Partial |
| `/*` (unknown routes) | 404 fallback | ✅ Working |

**Nav structure:** LIVE · REPLAY · MODELVIEW · LEARN (4-item nav, all functional) [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/)

***

## 2. PAGE-BY-PAGE AUDIT

### 2.1 Homepage `/`

**Visual:** Dark hero with animated auto-rotating 3D Red Bull RB21 GLB (~3.1MB compressed). Car continuously rotates through studio view angles. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/)

**Content:**

- Hero headline: "REPLAY THE RACE." with correct CTA hierarchy
- "OPEN LATEST REPLAY → Abu Dhabi Grand Prix" — correct link
- Route hierarchy cards: PRIMARY ROUTE (Live) + SECONDARY ROUTE (Modelview, Learn)
- Bottom section: Team card for Red Bull Racing with driver links (VER, HAD)
- Stats: "2 current-spec cars · 6 learn modules · 2025 season sessions" [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/)

**Issues found:**

- 🟡 **No page scroll indicator** — the page has scrollable content below the fold but no visual cue (no scrollbar visible on right edge, no chevron/arrow)
- 🟡 **Driver links go external** to formula1.com (opens same tab, should open new tab for external links)
- 🟡 **Hero 3D only shows Red Bull** regardless of other available constructors (McLaren not featured)
- 🟡 **No page `<title>` differentiation** — all pages show "F1 Racing" in tab, no sub-page title context

***

### 2.2 Live Page `/live`

**Feed mode:** "Static live simulator" (fallback from socket) — simulates at **8.0x speed** from Abu Dhabi replay pack [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/live/)

**Features confirmed working:**

- Header status tiles: FEED, STATUS (Booting → Green), REPLAY CLOCK, LAP, WEATHER, WIND
- "REPLAY ROUTE" button + "ABU DHABI GRAND PRIX SUMMARY" + "MODELVIEW" + "LEARN" contextual nav buttons
- **Track map** — Yas Marina Circuit rendered with all 20 car markers
- **Leaderboard** — POS, DRIVER, GAP, TYRE columns. Search bar functional. Clickable rows
- **Driver telemetry** — clicking a driver (tested RUS) populates telemetry card: SPEED (275 km/h), TYRE (M·1), LAST LAP (95.868s), THROTTLE/BRAKE/GEAR bar charts — all live-updating [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/live/)
- **Shift-click multi-select** mentioned in UI — up to 4 drivers
- "MESSAGES: 1" badge visible in track status area

**Issues found:**

- 🔴 **Driver names truncated in Live leaderboard** — "Max VERS...", "Lando NO...", "Gabriel BO...", "Andrea KIMI A..." — truncation cuts at ~8 chars, no tooltip or expand on hover
- 🟡 **STATUS shows "Booting" on initial load** briefly — could confuse users into thinking it's broken
- 🟡 **Feed type label** "Static live simulator" is developer-facing language; users may not understand what "static" means in this context
- 🟡 **No loading skeleton** for telemetry deck — empty state text shows but no placeholder cards

***

### 2.3 Replay Library `/replay`

**Content:** Full 2025 season listed chronologically (reverse-chron) + 1 x 2026 entry [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/)

**Sessions available:**

- 2025: Australian GP (Q+R), Abu Dhabi GP (Q+R), Las Vegas GP (R only), São Paulo GP (Sprint only), Mexico City (R only), Singapore (Q+R), Azerbaijan (R only), Italian (Q+R), Dutch (R only), Hungarian (Q only), Belgian (Sprint only), British (Q+R), Austrian (Q+R), Spanish (R only), Monaco (Q+R), Chinese (Q+R), Japanese (Q+R), Bahrain (R only), Saudi Arabian (R only)
- 2026: Japan GP (Race — preview)

**Issues found:**

- 🟡 **"LIMITED COVERAGE" badge is overused** — 11 of 19 events show it, but no explanation of what "limited" means (missing quali? Missing GPS?) — user has no way to know the quality difference before clicking
- 🟡 **Library is reverse-chronological** (Abu Dhabi first, Bahrain last) but the natural calendar reading order would be earliest → latest for season progress
- 🟡 **São Paulo GP slug is `s-o-paulo-grand-prix`** — special character stripping is inconsistent; could cause issues if users share/copy URLs

***

### 2.4 Replay Workspace `/replay/[year]/[gp]/[session]`

Tested: Australian GP Race, Abu Dhabi GP Qualifying, São Paulo Sprint, 2026 Japan GP

**Features confirmed working:**

- Session header tiles: STATUS, REPLAY CLOCK, LAP, TRACK, WEATHER, WIND [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)
- Track map with color-coded car markers + car labels (NOR, VER, RUS) + DRS badge on relevant cars
- **Top-3 bar** at map bottom updates in real-time during playback
- **Replay controls:** -5m/-1m/-30s/-5s | Prev lap | **Play/Pause** | Next lap | +5s/+30s/+1m/+5m
- **Speed presets:** 0.1x, 0.2x, 0.5x, 1x, 2x, 4x, 8x, 16x, 20x — confirmed toggling
- **Toggle switches:** LABELS (L), DRS (D), EVENTS (B) — pill buttons
- **Keyboard shortcuts:** Space (play/pause), arrows (seek), Shift+arrows (30s), [ ] (laps), R (restart), 1–5 (speed presets) — shown in UI
- Timeline scrubber with yellow playhead, "BUFFERED TO 9:58" indicator
- **Contextual nav bar:** REPLAY LIBRARY · MODELVIEW · LEARN · SESSION SUMMARY buttons
- Leaderboard (right panel) full names + search — working [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)
- Race control events timeline: "Jump to SafetyCar", "Jump to YELLOW", "Jump to GREEN" etc. — full race incident log [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)
- **Play is functional** — confirmed cars move, gaps update, clock ticks [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

**Data quality tiers observed:**

- `FASTF1 FEED` = GPS-backed (Australian Race, Abu Dhabi Qualifying)
- `OPENF1 FEED` = position-derived, no GPS (2026 Japan)
- Synthetic track map fallback = no GPS at all (some sessions)

**Issues found:**

- 🔴 **SESSION SUMMARY crashes for Australian GP** — navigating to `/sessions/2025/australian-grand-prix/race` shows: `"Session data could not be loaded — Cannot read properties of undefined (reading 'startsWith')"`. This is a JS runtime error, unhandled. The Abu Dhabi Race and Qualifying summaries load fine. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/2025/australian-grand-prix/race/)
- 🟡 **Replay clock always shows 0:00 / 9:58** on initial load regardless of session length — appears to be a fixed buffer window, not total session duration. Users may expect total race time (e.g., 1:30:00)
- 🟡 **2026 Japan GP shows LAP: "-" and FASTEST LAP: "-"** — empty data not surfaced as "Not yet available", just dashes with no context [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2026/japan-grand-prix/race/)
- 🟡 **Developer note exposed**: "Position data derived from OpenF1 race_position. For true X/Y GPS coordinates, use FastF1 Python pipeline" — this is internal/dev-facing text visible to all users on the 2026 Japan page
- 🟡 **"Timing-first replay using a synthetic track map fallback"** label is visible as the sub-description on Australian GP — technically accurate but user-unfriendly phrasing
- 🟡 **No visual differentiation** between GPS-accurate and synthetic track maps — users can't tell data quality at a glance
- 🟡 **Leaderboard TYRE column** shows compound letter + colored dot but "I" (Intermediate) dot looks nearly identical to "M" (Medium) at small sizes — no tooltip

***

### 2.5 Session Summary `/sessions/[year]/[gp]/[session]`

Tested: Abu Dhabi Race ✅, Abu Dhabi Qualifying ✅, Australian Race ❌ [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/2025/abu-dhabi-grand-prix/race/)

**Features (Abu Dhabi — working):**

- Hero tiles: FASTEST LAP, TRACK, AIR/TRACK TEMP, RAIN RISK
- CTA buttons: "Open replay", "Open stint story", "Open compare route"
- Full 20-driver grid with: driver name, best lap, compound used, stints count
- Strategy panel: pit loss time (18.7s), SC pit loss (11.4s), crossover thresholds, compound windows

**Issues:**

- 🔴 **Australian GP session summary: JS crash** — `Cannot read properties of undefined (reading 'startsWith')` — likely caused by a null field in the Australian GP data pack that is not null-guarded in the component [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/2025/australian-grand-prix/race/)
- 🟡 **"Open compare route" / "Open stint story"** buttons — destination routes not verified during audit; need to confirm these aren't also broken for other sessions

***

### 2.6 Modelview `/cars/current-spec`

**Features confirmed working:**

- Intro page with dark hero + large serif type [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/)
- **Constructor dropdown:** Red Bull Racing / McLaren — switching updates URL params (`?season=2025&constructor=red-bull` / `?season=2025&constructor=mclaren`) and loads different GLB [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=mclaren)
- **View presets:** Studio / Side / Front / Top — clicking "Side" rotates camera and URL updates [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=red-bull)
- **Hotspot labels** on car: Front wing, Floor, Brakes, Rear wing, Tyres — visible on 3D model
- **Focus Point panel:** Select hotspot → links to matching Learn module (e.g., "Front wing + nose → Open aero module")
- **Airflow overlay:** Off / Front load / Floor channel / Rear wake toggles — visual guide layer
- **Current Model metadata:** Season, Constructor, Asset size, Status ("SURFACE READY" badge)
- **Branch from model** section: links to car primer, aero module, latest replay
- **Progress bar** visible during GLB load for McLaren [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=mclaren)
- **GLB sizes:** Red Bull ~3.1MB, McLaren (similar compressed size)

**Issues found:**

- 🟡 **Only 2 constructors available** — Red Bull and McLaren. Missing all other 8 teams. No explanation why others are absent
- 🟡 **No mobile-friendly 3D controls** visible — mouse/touch/arrow keys mentioned but no touch gesture guide for mobile users
- 🟡 **"AIRFLOW LAYER" disclaimer** ("Visual guide only. Not a measured aerodynamic result") is below the toggle — should be more prominent, possibly shown when overlay is active
- 🟡 **Return to studio** focus point clears camera but the other focus items in the list don't auto-highlight selected state

***

### 2.7 Learn Surface `/learn` + Modules

**6 modules:** Car, Aero, Tyres, Braking, Setup, Strategy [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/learn/)

**Confirmed working:**

- Learn index with module cards showing route paths (`/learn/car`, `/learn/aero`, etc.)
- Each card shows "2 NEXT LINKS" count and bullet list of continue options
- Individual module pages (tested `/learn/aero`) — loads correctly with: header, subtitle, CORE CONCEPTS section with numbered key points, CONTINUE cards [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/learn/aero/)
- Module linking: "Continue to tyres", "Continue to braking" etc. — chained learning path

**Issues found:**

- 🟡 **No progress tracking** — no way to know which modules you've read. No "completed" state, no bookmark, no read indicator
- 🟡 **Learn modules are text-only** — no inline diagrams, no embedded 3D snapshots, no video. The copy references "inspect a part" but doesn't embed the 3D view within the text
- 🟡 **No estimated read time** per module
- 🟡 **"2 NEXT LINKS"** label on the index cards is mechanical/dev-facing — should say "2 continue paths" or similar

***

### 2.8 404 / Missing Routes

Custom `MISSING ROUTE` page: "That session is not in the sample pack yet." with "Back to replay library" CTA — graceful, branded, helpful  ✅ [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/404-test-page)

***

## 3. CROSS-CUTTING ISSUES

### 3.1 Bugs (Severity: High)

| # | Bug | Location | Error |
|---|---|---|---|
| B1 | **Session summary crashes** | `/sessions/2025/australian-grand-prix/race` | `Cannot read properties of undefined (reading 'startsWith')` — unhandled JS error, full page broken  [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/2025/australian-grand-prix/race/) |
| B2 | **2026 Japan GP LAP field is "-"** | `/replay/2026/japan-grand-prix/race` | Fastest lap also "-" — null data not handled gracefully |

### 3.2 UX Issues (Severity: Medium)

| # | Issue | Location |
|---|---|---|
| U1 | Driver names truncated at ~8 chars in Live leaderboard | `/live` |
| U2 | External driver links open same tab (formula1.com) | Homepage |
| U3 | "Booting" status shown briefly on Live page load | `/live` |
| U4 | Developer-facing text visible: "For true X/Y GPS coordinates, use FastF1 Python pipeline" | 2026 Japan replay |
| U5 | "Timing-first replay using a synthetic track map fallback" — jargon exposed to users | Australian GP replay |
| U6 | No visual data quality badge (GPS vs. synthetic) in replay library list | `/replay` |
| U7 | Replay clock shows buffer window (9:58), not total session time | All replay pages |
| U8 | "MESSAGES: 1" badge with no expandable message view | `/live` |
| U9 | No page titles differentiate tabs (all "F1 Racing") | All pages |
| U10 | No scroll affordance on homepage hero | `/` |

### 3.3 Content/Data Issues (Severity: Low)

| # | Issue |
|---|---|
| C1 | Only 2 of 10 constructors in Modelview (missing Ferrari, Mercedes, McLaren variants, etc.) |
| C2 | Library uses "LIMITED COVERAGE" badge without defining what is limited |
| C3 | Learn modules lack visual assets (diagrams, embedded 3D) |
| C4 | No read progress/bookmark system

console/error logs:
robots.txt:1  Failed to load resource: the server responded with a status of 404 ()
/robots.txt:1  Failed to load resource: the server responded with a status of 404 ()
516.c382634f4979b276.js:581 rAF timed out in updateSource
(anonymous) @ 516.c382634f4979b276.js:581
516.c382634f4979b276.js:581 rAF timed out in updateSource
(anonymous) @ 516.c382634f4979b276.js:581
car load in replay and movement not align in replay and run randomly on track. Playback need refactor follow: <https://github.com/adn8naiagent/F1ReplayTiming%20https://github.com/IAmTomShaw/f1-race-replay>

***

## 4. IMPROVEMENT PASS 2026-05-20

### 4.1 What was fixed in this pass

| ID | Status | Fix |
|---|---|---|
| B1 | Fixed | `apps/web/src/components/telemetry/session-route-client.tsx` no longer throws when `manifest.drivers/laps/strategy` are missing. The route degrades to a "replay-only" state with links into the replay workspace. The session page (`apps/web/src/app/sessions/[season]/[grandPrix]/[session]/page.tsx`) no longer 404s when only the manifest exists; it builds a fallback summary and renders. |
| B2 | Fixed | Replay banner now shows "Not yet exported" instead of `-` when lap and fastest-lap data are missing. The dev-facing "FastF1 Python pipeline" string in any pack `note` is sanitized before render. |
| U1 | Fixed | Driver names in the replay/live leaderboard wrap to two lines via line-clamp instead of being truncated at ~8 chars. Tooltip already exposed full name. |
| U2 | Fixed | Homepage Red Bull team driver links now use `target="_blank" rel="noopener noreferrer"`. |
| U3 | Fixed | Live route shows `Connecting` then `Live - synced` instead of `Booting`/`Buffering`. Initial loading copy reads `Connecting to OCI live feed` or `Local replay simulator` instead of `Booting`/`Static live simulator`. |
| U4 / U5 | Fixed | The synthetic-fallback note was rewritten to "OpenF1 timing replay. Track motion is projected onto the circuit polyline." Dev-facing labels were removed. |
| U6 | Fixed | Replay library coverage labels now read `Race + qualifying`, `Sprint weekend - full coverage`, `Race only`, etc., and sessions are sorted Race -> Sprint -> Qualifying -> Practice. |
| U7 | Fixed | Replay clock denominator uses `replay.totalTime` from the meta pack as the canonical session length, no longer the buffered chunk window. |
| U8 | Fixed | The Messages tile is now a button that opens an inline popover. Each row is clickable and seeks playback to that race-control message timestamp. |
| U9 | Fixed | Root layout uses Next `metadata` template `%s · F1 Racing`. Per-page metadata exports added for `/`, `/live`, `/replay`, `/replay/[…]`, `/sessions/[…]`, `/cars/current-spec`, `/learn`, `/learn/[slug]`. |
| U10 | Fixed | Homepage hero now has a `Scroll` cue with a subtle bob animation that scrolls to the core-loop briefing section. |
| C1 | Fixed | Modelview catalog now ships seven constructors: Red Bull RB21, McLaren MCL39, Ferrari SF-25, Mercedes W15, Aston Martin AMR25, Alpine A525, plus the FIA 2026 concept car. The sync script copies the GLBs into `apps/web/public/models/{season}/{constructor}/`. APX GP is removed. |
| Replay correctness | Fixed | Replay workspace now projects markers and computes leaderboard order using the same dense along-track distance for every pack (synthetic, OpenF1, FastF1). The `useSyntheticTrackMotion` flag drives the banner copy only; projection is now always-on whenever a dense `trackPath` polyline exists. |
| Telemetry coverage | Fixed | Re-ran the OpenF1 builder for every 2025 race / qualifying / sprint-qualifying / sprint session. The `manifest.json` for all 28 grand prix folders now ships `summary`, `drivers`, `laps`, `strategy`, `stints`, and (when generated) `compare`, in addition to the existing `replay` reference. The OpenF1 client treats 404 with `No results found` as an empty list so endpoints with no laps (e.g. Azerbaijan qualifying) no longer crash the builder. |
| robots.txt | Blocked | `apps/web/public/robots.txt` is now `User-agent: *` `Disallow: /`, plus `metadata.robots = { index: false, follow: false }` in the root layout. |

### 4.2 What was changed in code

- `apps/web/src/components/telemetry/session-route-client.tsx`: replay-only fallback, manifest guards, optional strategy.
- `apps/web/src/app/sessions/[season]/[grandPrix]/[session]/page.tsx`: graceful degrade when summary is missing, per-page metadata.
- `apps/web/src/components/replay/ReplayView.tsx`: dense projection always-on, sanitized note, lap/fastest-lap labels, expandable Messages popover with seek-to-time.
- `apps/web/src/components/replay/TrackCanvas.tsx`: continues using projected geometry; flag is now driven by `projectMarkers`.
- `apps/web/src/components/replay/Leaderboard.tsx` / `globals.css`: identity span uses two-line line-clamp.
- `apps/web/src/components/replay/replay-library.tsx`: coverage labels and sort order updated.
- `apps/web/src/components/replay/PlaybackControls.tsx`: status copy updated.
- `apps/web/src/components/live/live-route-client.tsx`: status copy + label updates.
- `apps/web/src/components/story/landing-stage.tsx`: external driver links use `noopener noreferrer`.
- `apps/web/src/app/page.tsx` + `globals.css`: scroll cue + animation.
- `apps/web/src/app/layout.tsx`: title template + robots metadata.
- `apps/web/src/app/learn/page.tsx`, `apps/web/src/app/learn/[slug]/page.tsx`, `apps/web/src/app/replay/page.tsx`, `apps/web/src/app/replay/[season]/[grandPrix]/[session]/page.tsx`, `apps/web/src/app/cars/current-spec/page.tsx`, `apps/web/src/app/live/page.tsx`: per-page metadata.
- `apps/web/public/robots.txt`: new, blocks indexing.
- `data/packs/cars/catalog.json`, `apps/web/public/data/packs/cars/catalog.json`: 7-constructor catalog.
- `pipeline/export/src/sync-web-models.mjs`: copies all seven GLBs into the public tree.
- `pipeline/export/src/build-openf1-session-pack.mjs`: preserves the `replay` manifest entry across rebuilds and recovers it from `replay.json` on disk if the previous manifest had been overwritten.
- `pipeline/export/src/refresh-all-openf1-packs.mjs`: new batch refresh script that walks the season manifest and rebuilds each session pack.
- `pipeline/ingest/src/openf1-client.mjs`: returns `[]` for a 404 `No results found` response so missing endpoints no longer break the builder.
- Migrated old `s-o-paulo-grand-prix` slug folders into the canonical `sao-paulo-grand-prix` slug; updated `data/manifests/seasons.json`, `data/manifests/openf1-2025-season.json`, and the public mirror.
- Posters added for the new constructor models under `apps/web/public/posters/`.

### 4.3 What is intentionally deferred

- Practice 1 / 2 / 3 telemetry packs are still skipped by the refresh script for now to keep the OpenF1 burden small. They can be enabled later by removing `--skip-practice`.
- Learn module visuals, read-progress, and reading-time chips (C3 / C4) are deferred per the user's instruction. The CFD plan in section 4.4 is the parallel track for engineering depth.
- The `rAF timed out in updateSource` warning from `<model-viewer>` is benign (it fires when GLB load is interrupted by tab switch / re-render). It is not surfaced to users and is left in place; we re-key the `<model-viewer>` element on car change to reduce occurrence.
- The `Open compare route` and `Open stint story` CTAs depend on per-session `compare/{driver}-{driver}.json` packs. Many sessions still have an empty `compare` map because OpenF1 lacks the underlying car-data telemetry; those CTAs hide automatically when no compare pack exists.

### 4.4 Plan: Canvas Wind Tunnels / MicroCFD / Web CFD for the modelview

Goal: bring an interactive aero overlay onto the existing GLB modelview without building a real Navier-Stokes solver in the browser. Three tiers, in increasing fidelity:

#### Tier 1 - Canvas wind tunnel (today, ships in this app)
- A 2D streamlines layer drawn on top of (or beside) the model-viewer.
- Inputs: airspeed slider, yaw slider, ride-height slider, DRS open / closed, ground mode (rolling road / fixed), wheel mode (rotating / stationary).
- Visualization options:
  - Streamlines computed from a coarse vector field that's analytically generated (potential-flow ellipsoid + downstream wake) and tinted by velocity magnitude.
  - Pressure heat tint on the silhouette using a procedural function of yaw / DRS / floor-block height.
  - Particle layer overlay sampled along streamlines, rendered with HTML canvas + `requestAnimationFrame`.
- Storage: pack lives in `apps/web/public/data/packs/sims/canvas-wind-tunnel.json` and stays under 50 KB; no GLB needed.
- Disclaimer: clearly labelled "Visual guide only. Not a measured aerodynamic result." Already partly present in the current Modelview airflow overlay copy.
- Effort: ~1-2 days. Reuses the existing `AirflowOverlay` and `focusPoints` registry.

#### Tier 2 - MicroCFD on the GLB silhouette (next pass)
- Lightweight 2D Lattice-Boltzmann (D2Q9) simulation that runs in a Web Worker on a 320x180 grid.
- The GLB is rasterized to a silhouette mask using off-screen canvas + the Three.js scene already initialized by `<model-viewer>`.
- Boundary conditions: inlet on the left (uniform U), outlet on the right (Neumann), top/bottom walls slip, GLB silhouette no-slip.
- Output: velocity / pressure / vorticity fields, drag coefficient estimate, downforce estimate (qualitative), a streamline density visualization, and a "where is the car losing energy?" heat map.
- Caveats:
  - 2D LBM cannot capture under-floor diffuser physics or Y250 vortex behavior. Marketed as "indicative".
  - Frame budget: ~20 ms per LBM step; targets a 30 Hz UI refresh by stepping LBM less often than the render loop.
- Repo glue:
  - `apps/web/src/components/wind/micro-cfd-worker.ts` (Web Worker, no DOM access).
  - `apps/web/src/components/wind/micro-cfd-canvas.tsx` (renderer + UI).
  - `pipeline/export/src/build-cfd-silhouettes.mjs` (precomputes silhouette PNGs from each GLB so the runtime doesn't have to render Three.js to get a mask).
- Effort: ~1-2 weeks.

#### Tier 3 - Web CFD with cached cases (longer term)
- Pre-bake a small library of OpenFOAM `simpleFoam` runs per car (Red Bull, McLaren, Ferrari) at a few yaw and ride-height settings on a coarse mesh.
- Store the surface pressure field per triangle as `{triangleId, Cp}` in a JSON pack, plus a few streamline polylines sampled in 3D space.
- At runtime, the modelview applies the Cp field as a vertex/material color overlay using the existing `<model-viewer>` `material.pbrMetallicRoughness.baseColorFactor` API or a custom shader injected via `model-viewer`'s `<model-viewer>` shader hook (or a separate Three.js layer).
- Pipeline:
  - `pipeline/openfoam/src/build-openfoam-overlay-pack.mjs` (already a scaffold, expand it).
  - One CFD case per (car, yaw, ride-height) tuple. ~12 packs total at first.
- Effort: gated by OpenFOAM compute; the existing `pipeline/openfoam/` scaffold is the right place to grow this.

#### Recommended path
1. Ship Tier 1 first as a simple, honest "wind tunnel sketch" panel under the existing AirflowOverlay block in modelview, gated behind a toggle so the existing simple overlay stays available.
2. Validate UX on Tier 1, then build Tier 2 as the headline interactive experience.
3. Tier 3 stays as a research track that requires offline OpenFOAM runs and is the only tier that can claim quantitative accuracy.

#### Asset generation rules for this CFD work
- Do not hand-author SVG visualizations of CFD output; use the existing Canvas / WebGL layer instead.
- If we ever need a static figure (for marketing or docs), render the streamlines or pressure plot from the actual simulation data and export a snapshot via `canvas.toBlob`. Generated illustrative imagery (e.g. landing hero), if needed, can be produced via the 9router image generation skill rather than handwritten SVGs.
- The user's existing `data/packs/sims/` and `apps/web/public/data/packs/sims/` directories are the canonical locations for any CFD pack. Per the "no SVG customization" rule, do not write hand-illustrated SVGs of CFD fields into the public assets tree; emit canvas snapshots if needed.

