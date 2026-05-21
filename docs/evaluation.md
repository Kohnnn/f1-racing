
---

## Final UI / Replay Pass — shipped 2026-05-22

Build verification: `npm run next:build -w @f1-racing/web` passed and exported 334 static pages.

### Fixed in this pass

| Area | Result |
|------|--------|
| Learn inline 3D | Model embeds no longer blank; eager reveal, fixed canvas height, loader, progress UI, and fallback added. |
| Replay controls | Scrubber now has elapsed/remaining time, restart, speed label, load progress/ETA, event ribbons, lap loop hooks, and shortcut overlay. |
| Session dead CTAs | Compare/stint actions now show disabled explanatory chips when unavailable. |
| Dark theme | Page shell, panels, modelview, controls, and Learn surfaces use a consistent dark product theme. |
| Navigation | Route-aware shell nav highlights the active page and includes Sessions. |
| Live Analysis Deck | Added `Telemetry · Stints · Strategy · Lap times` with live stint and strategy readouts. |
| Modelview inspect | Inspect mode now has dark technical staging, pulsing hotspots, DRS rear-wing emphasis, compare hotspots, and exploded-view asset scaffold. |
| Replay telemetry | Added rolling SVG sparklines for speed, throttle, brake, and RPM. |
| Track canvas | Canvas bitmap now tracks actual DOM size via `ResizeObserver`, fixing CSS aspect distortion. |
| Leaderboard | Replay ordering trusts race position, gap labels are position-aware, movement arrows and fastest-lap markers added. |
| Driver sectors | Personal-best sector now scans all driver laps instead of only fastest-lap sectors. |
| Learn progress | Module pages include step chip and local `Mark as read` controls. |
| Wind tunnel | Simulation/draw work pauses while the canvas is offscreen. |
| Replay Library | 2026 copy now distinguishes live OpenF1 packs and exported session availability. |

### Remaining roadmap items

- Generate and commit `/exploded-views/<season>/<constructor>.png` assets with 9Router/image tooling.
- Add Draco decoder support for compressed GLBs and ingest missing constructor source assets.
- Keep light theme, OpenFOAM Cp fields, SignalR ingestion, and 2026 practice packs in long-tail.

---

# F1 Racing App — QA Evaluation Report **v3**

**URL:** `https://playful-peony-77899c.netlify.app/`
**Tester:** Comet AI QA · **Build:** v3 · **Date:** 2026-05-21 11:00 +07
**Viewport tested:** ~1200px (desktop)

***

## ✅ V2 → V3 FIXED

| Was | Now |
|-----|-----|
| COMPARE tab hardcoded NOR vs VER | ✅ Dynamic driver pair (uses selected drivers) |
| No side-by-side constructor compare | ✅ "Compare side-by-side" button implemented |
| No orbit/inspect mode toggle | ✅ Orbit + Inspect buttons added |
| Buffer wall with no LOAD button | ✅ "LOAD FULL RACE" button present |
| Event markers not on scrubber | ✅ Colored ticks on scrubber after full load |
| No lap time visualization | ✅ New "LAP TIMES" tab with heatmap waterfall |
| Wind tunnel generic wing shape | ✅ Tier 2 Navier-Stokes solver, MCL39 silhouette |
| Wind tunnel no physics output | ✅ DRAG / LIFT / Re number displayed live |
| Duplicate session page title | ✅ "Australian Grand Prix · Race · F1 Racing" |

***

## 🐛 BUGS — CRITICAL (P0)

### B1 · HOME · Driver photos show torso not face [VISUAL]

 Both Max Verstappen and Isack Hadjar driver avatars crop to the **chest/torso area** instead of the face. The circular avatar container uses `object-position` defaulting to center, but the F1 driver headshot images have the face in the top ~30% of the image. Fix: `object-position: top` or `object-position: 50% 10%` on the avatar `<img>`. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/#core-loop)

### B2 · LIVE · Track map blank for ~3 seconds on load [VISUAL]

 The canvas renders a solid white empty rectangle until the WebGL/canvas context initializes (~3s). No skeleton, no spinner, no placeholder. First impression is broken. Fix: show a CSS-animated pulse placeholder or a static SVG track outline while the canvas boots. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/live/)

### B3 · RACE REPLAY · Melbourne track map severely distorted [VISUAL - CRITICAL]

 The Melbourne circuit renders as a narrow vertical squished shape — the correct track layout is a roughly equal-width oval shape. The circuit polyline appears to be rendered in an unconstrained container where the Y-axis is compressed. The track fits only ~40% of the canvas width. **This is the primary visual of the app and it's broken.** Fix: normalize the circuit path to fill the canvas aspect ratio with proper padding, or apply `viewBox` auto-scaling. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

### B4 · LIVE · SELECTED field shows "VFR" instead of "VER" [DATA BUG]

 After clicking VER in the leaderboard, the CURRENT READ section shows `SELECTED: VFR` — a 1-character typo/mutation in the driver code. Likely a string transform bug (sort/filter function corrupting the code). [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/live/)

### B5 · RACE REPLAY · Leaderboard wrong sort — P17 RUS between P3 and P4

 At Lap 36, George Russell (P17 in race order) appears between P3 and P4 in the leaderboard panel. The leaderboard is not sorting by race position — it appears to be sorting by gap value numerically without capping to race position. Fix: sort leaderboard rows strictly by `position` field from the F1 data. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

### B6 · RACE REPLAY · Mini-bar shows "Leader" for all top 3 at Lap 1

 The 3-driver mini-banner below the map shows `1 VER Leader · 2 NOR Leader · 3 BOR Leader` — all showing "Leader" gap label. Only P1 should show "Leader"; P2 and P3 should show gap to P1. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

### B7 · MODELVIEW · "LOADING" overlay persists after model renders [VISUAL]

 The bottom banner `"LOADING MCLAREN MCL39 · ~36.2 MB (COMPRESSED)"` stays visible after the 3D model has fully rendered on screen. The loading state is not being cleared after load completion. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=mclaren)

### B8 · MODELVIEW · Large blank white canvas between 3D model and wind tunnel

 When scrolling below the 3D model, there is a large empty white rectangle (appears to be the 3D canvas container continuing to reserve space). The wind tunnel section is completely hidden unless using `scroll_to`. The page layout has an invisible overflow trap. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=mclaren)

### B9 · SESSION SUMMARY · Position badges wrong for DNF/DNS drivers

 BOR (DNF) shows `#5`, HAD (DNS) shows `#6` — these are not race result positions. They appear to be sorted by fastest lap time or grid order. DNF/DNS drivers should show `DNF` or `DNS` as their badge, not a position number. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/2025/australian-grand-prix/race/)

### B10 · RACE REPLAY · Race Control messages show stale Lap 1 data [DATA BUG]

 The inline Race Control box always displays `T+27s · Lap 1 · GREEN LIGHT - PIT EXIT OPEN` even at Lap 36 during the Safety Car period. The inline RC widget is not advancing with the replay clock. The RACE CONTROL tab in the analysis deck is correct (98 messages), but the inline card is stuck. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

***

## ⚠️ BUGS — MEDIUM (P1)

### B11 · MODELVIEW · Compare mode: RB21 has no hotspot labels

 In side-by-side compare mode, the right panel (RB21) shows no hotspot overlay labels (Front wing, Floor, etc.), while the left (MCL39) does. The hotspot system only attaches to the primary model. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=mclaren)

### B12 · MODELVIEW · Wind tunnel "Cp HIGH (slow)" label placement confusing

 The pressure legend labels "Cp HIGH (slow)" and "Cp LOW (fast)" appear as colored text directly on the canvas corners with no background. On the busy particle render they're hard to read, and new users won't know what Cp means. Should be a proper legend strip with a color gradient bar. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=mclaren)

### B13 · RACE REPLAY · "LOAD FULL RACE" button remains after loading

After clicking "LOAD FULL RACE" and background loading begins, the button stays in its default state. It should change to a loading spinner/progress indicator ("Loading… 34%") then disappear when complete.

### B14 · LIVE · Leaderboard row TYRE column overflows on narrow columns

 At the current viewport, rows for LEC, ALO, RUS, BOR show the tyre compound getting clipped (only `I` visible). The leaderboard 4-column layout (POS / DRIVER / GAP / TYRE) has no min-width on the tyre column. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/live/)

### B15 · LIVE · "0 laps" on fresh tyre set after pit stop

Drivers who just pitted show `HARD, 0 laps` which is valid but visually jarring. Should say `HARD, fresh` or `HARD, new` until lap count > 0 to avoid confusion with broken data.

### B16 · RACE REPLAY · Analysis Deck heading shows "Race control" when LAP TIMES tab is active

 The heading area below the tabs reads "Race control" even when the LAP TIMES tab is selected and the waterfall heatmap is shown. The heading is not updating to reflect the active tab. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

### B17 · HOME · Hero model initial camera: top-down cropped view

 On page load the RB21 hero model starts in a top-down/birds-eye angle showing only the halo and airbox. After a second it auto-rotates to side view. The initial frame looks like a broken render. Fix: set the initial camera angle to the side view (same as the settled position). [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/#core-loop)

***

## ⚠️ BUGS — LOW (P2)

| # | Page | Issue |
|---|------|-------|
| B18 | Session Summary | Serif font (different typeface from rest of site — all other pages use sans-serif) |
| B19 | Modelview | Hero section pushes 3D canvas below fold; user must scroll to find the product |
| B20 | Replay Library | "Support session" copy still vague — doesn't specify what session type |
| B21 | Race Replay | `CURRENT READ` heading says "VER anchors the replay" but race leader is NOR at Lap 36 |
| B22 | Modelview | Wind tunnel runs even when not in viewport (wastes CPU/battery on mobile) |
| B23 | Learn pages | Module content is text-only, no inline model embed |

***

## 📊 VISUAL CONSISTENCY AUDIT (all pages)

| Element | Home | Live | Replay Lib | Race Replay | Modelview | Session |
|---------|:----:|:----:|:----------:|:-----------:|:---------:|:-------:|
| Font family | Sans ✅ | Sans ✅ | Sans ✅ | Sans ✅ | Sans ✅ | **Serif ❌** |
| Orange accent `#f60` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dark bg `#0d1117` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (light bg) |
| Nav bar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Section label caps | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Card border radius | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tyre legend | N/A | ✅ | N/A | ✅ | N/A | ❌ missing |
| Loading skeleton | N/A | ❌ blank | N/A | partial | ❌ blank | ✅ spinner |
| Keyboard hint bar | N/A | ✅ | N/A | ✅ | ❌ none | N/A |

***

## 🎮 REPLAY PLAYBACK — BENCHMARK v3 vs. INDUSTRY

| Feature | v3 | F1 TV Pro | Motec i2 |
|---------|:--:|:---------:|:--------:|
| Play/Pause (Space) | ✅ | ✅ | ✅ |
| 9 speed presets 0.1×–20× | ✅ | 2 only | variable |
| Seek ±5s/30s/1m/5m | ✅ | ✅ | ❌ |
| Prev/Next lap | ✅ | ❌ | ✅ |
| Full race load on demand | ✅ new | ✅ | ✅ |
| Scrubber click-to-seek | ✅ | ✅ | ✅ |
| **Event ticks on scrubber** | ✅ new (after load) | ✅ | ✅ |
| **Hover preview tooltip** | ❌ | ✅ | ✅ |
| **Loop/bookmark lap** | ❌ | ❌ | ✅ |
| Lap time waterfall | ✅ new | ❌ | ✅ |
| Race control log + filter | ✅ | ⚠️ basic | ❌ |
| Track map live positions | ✅ (distorted) | ✅ | ❌ |
| Telemetry speed/throttle/brake | ✅ | ✅ | ✅ |
| Constructor side-by-side | ✅ new | ❌ | ❌ |
| Navier-Stokes wind tunnel | ✅ new | ❌ | ❌ |

**Remaining gaps vs. F1 TV:** hover-to-preview on scrubber, loop/bookmark.

***

## 🆕 NEW FEATURES IN V3 (confirmed working)

1. **LOAD FULL RACE button** — triggers progressive background loading of full 1:46:08 race
2. **LAP TIMES waterfall heatmap** — 921-lap grid, green=fast/red=slow, per driver per lap
3. **Orbit / Inspect mode toggle** — resolves v2 hotspot-vs-drag conflict
4. **Compare side-by-side** — dual 3D canvas with dropdown to pick comparison constructor
5. **Wind Tunnel Tier 2 Fluid** — real 2D Navier-Stokes on 320×120 grid, DRAG/LIFT/Re live output
6. **Constructor-specific wind tunnel shape** — MCL39 silhouette confirmed distinct

***

## 🔧 IMPROVEMENT PRIORITY LIST

### P0 — Visual Regressions (must fix)

1. **Fix Melbourne track map distortion** (B3) — normalize polyline aspect ratio to canvas bounds
2. **Fix driver photo crop** (B1) — `object-position: top` on avatar images
3. **Clear LOADING overlay after model ready** (B7)
4. **Fix blank canvas gap between 3D model and wind tunnel** (B8) — set `height: auto` or `overflow: hidden` on the inner scroll container

### P1 — Data Correctness

1. **Fix "VFR" typo in SELECTED field** (B4)
2. **Fix leaderboard sort** (B5) — sort strictly by position integer
3. **Fix mini-bar "Leader" for all positions** (B6) — only P1 = Leader, rest show gap
4. **Unstick inline Race Control widget** (B10) — advance with replay clock
5. **Fix Session Summary position badges for DNF/DNS** (B9)

### P2 — UX Polish

1. **Track map blank → add canvas loading skeleton** (B2) — static SVG placeholder or shimmer
2. **LOAD FULL RACE → progress indicator** (B13) — show "Loading 34% · 0:37:52 ready"
3. **Scrubber hover tooltip** — show lap number + timestamp + track status (SC/Yellow) on hover before clicking
4. **Session Summary font** (B18) — switch to site-wide sans-serif, unify with dark bg theme
5. **Wind tunnel Cp legend** (B12) — add a horizontal gradient bar legend with labels

### P3 — Feature Ideas

1. **Lap loop mode** — let user mark in/out points on scrubber to loop a specific lap for comparison
2. **Pit stop flash animation** — animate car marker on track map when a pit stop occurs (car briefly enters an infield pip)
3. **DRS zone highlights** — overlay colored arc segments on track map for 3 DRS zones (data already in TRACK tab)
4. **Wind tunnel compare mode** — run both MCL39 and RB21 tunnels side-by-side, showing Δ drag/lift
5. **Driver photo grid on Session Summary** — add driver headshots to summary cards (fix crop first)
6. **Scroll-spy for Modelview sections** — sticky mini-nav linking to "3D Studio", "Airflow Layer", "Wind Tunnel" so users know the tunnel exists without scrolling blind

***

## ✅ V3 → INTERIM PASS 2026-05-22 (this drop)

This drop responds to the v2 deferred items (Tier A/B/C from the planning
session) and lands several v3 P3 items in passing. The remaining P0/P1
visual regressions in v3 (B3 Melbourne distortion, B5 leaderboard sort, B6
mini-bar leader, B7 LOADING overlay, B10 inline RC, B16 tab heading) are
now queued for the next pass — see `docs/roadmap.md`.

### Shipped this drop

| Bug / Item | Status | Fix |
|---|---|---|
| 3.6 / B15 LIVE post-pit tyre age | Fixed | Leaderboard renders a `FRESH` chip when tyre age is 0; aria-label and tooltip mirror the same fresh state. |
| 3.6 LIVE out-lap flag | Fixed | Median + compound-change heuristic from the replay view ports to the live page. Out-laps render as `Out lap` instead of a misleading raw lap time. |
| 3.11 LIVE race-control toggle | Fixed | New `Toggle race control messages` button in the live header, properly disabled when the message stream is empty, collapses the inline strip. |
| 5.9 COMPARE dynamic pair | Fixed | `dynamicCompare` now falls back to `leader vs P2` of the current frame whenever fewer than two drivers are pinned. Hardcoded NOR vs VER from the static manifest is gone. |
| 5.19 / 3.13 / B18 Session Summary typography | Fixed | `.session-summary-page` wrapper opts the H1 into the site-wide sans-serif (matches Replay/Live banners). |
| 3.13 Learn typography | Fixed | `.learn-module-page` wrapper promotes Learn module H1 to the same display scale as Replay/Live. |
| 5.16 / B26 DRS zones on track map | Fixed | `track-renderer.ts` reads real DRS zone metadata from `replay.trackMetadata.drsZones` and tints the corresponding polyline arc segments. New `pipeline/export/src/seed-drs-zones.mjs` populates `data/track-shapes/<trackId>.json` with the FIA-published 2025 zones (24/24 circuits seeded). |
| 5.15 Pit-stop pulses on track map | Fixed | `ReplayView` scans the loaded frame stream for tyre-compound transitions + tyre-age resets, then emits `PitPulse` markers with team colour. Pulses live for ~3.5s and fade via `drawPitPulses`. |
| Marshal-sector overlays | Shipped | New `drawMarshalSectors` paints the polyline arc whenever a race-control message references a sector flag (e.g. `Yellow flag in sector 2`). Toggleable from the playback toolbar (`Marshals M` chip + `M` keyboard shortcut). |
| FastF1 Miami + São Paulo corner distances | Fixed | Hydration script gained `--circuits` / `--rounds` filters and a pre-flight schedule resolver. Re-ran for round 6 (Miami) and round 21 (São Paulo) — both now have real `trackPosition` for every corner. |
| 2026 season catalogue | Shipped | New `pipeline/export/src/build-openf1-season-manifest.mjs`. Replay + session pack builders are year-aware. Packs shipped for Australia / China / Japan / Bahrain / Saudi Arabia / Miami (race + qualifying everywhere; sprint where applicable). |
| 2024 key races backfill | Shipped | Curated catalogue (Abu Dhabi finale, São Paulo wet, Las Vegas, British) packed for both race and qualifying. |
| Seasons index regeneration | Shipped | New `pipeline/export/src/refresh-seasons-index.mjs` rebuilds `data/manifests/seasons.json` straight from the on-disk pack inventory. |

### Files changed

- New: `pipeline/export/src/seed-drs-zones.mjs`, `pipeline/export/src/build-openf1-season-manifest.mjs`, `pipeline/export/src/build-2026-and-key-races.mjs`, `pipeline/export/src/refresh-seasons-index.mjs`.
- New: `data/manifests/openf1-2026-season.json`, `data/manifests/openf1-2024-season.json`.
- Updated: `data/track-shapes/<trackId>.json` × 24 (DRS zone seeding) + Miami / Interlagos corner distances.
- Updated: `pipeline/fastf1/hydrate-corner-distances.py`.
- Updated: `pipeline/export/src/build-openf1-replay-pack.mjs`, `build-openf1-session-pack.mjs`.
- Updated: `apps/web/src/components/replay/TrackCanvas.tsx`, `track-renderer.ts`, `ReplayView.tsx`, `PlaybackControls.tsx`, `Leaderboard.tsx`.
- Updated: `apps/web/src/components/live/live-route-client.tsx`.
- Updated: `apps/web/src/components/telemetry/session-route-client.tsx`.
- Updated: `apps/web/src/app/learn/[slug]/page.tsx`, `apps/web/src/app/globals.css`.
- Updated: `apps/web/src/lib/data.ts` (`drsZones` and `marshalSectors` types).
- New packs: 14 sessions across 6 GP weekends in 2026; 7 sessions across 4 key 2024 races.
- Updated: `data/manifests/seasons.json` and the web mirror — 3 seasons / 34 GPs / 81 sessions.

### Verification

- `npm run next:build -w @f1-racing/web`: 306 static pages compile cleanly (was 256 in the v3 build).
- `node pipeline/export/src/seed-drs-zones.mjs`: 24/24 circuits seeded.
- `python pipeline/fastf1/hydrate-corner-distances.py --year 2025 --circuits miami,interlagos`: 2/2 hydrated.
- `node pipeline/export/src/refresh-seasons-index.mjs`: 3 seasons / 34 GPs / 81 sessions registered.
- Smoke probes against `/`, `/replay/2026/miami-grand-prix/race/`, `/replay/2024/abu-dhabi-grand-prix/race/`, `/learn/car/`, `/sessions/2026/japanese-grand-prix/race/`, `/cars/current-spec/`: all 200 OK.

### Carried into next pass (from v3)

P0 visual regressions (B3 / B7 / B8), P1 data correctness (B4 / B5 / B6 / B10 / B16 / B21), P2 polish (B2 skeleton / B13 progress / B14 tyre overflow / B17 hero camera / B22 viewport pause). See `docs/roadmap.md`.

VERSION V4
---

# F1 RACING VIEWER — QA EVALUATION REPORT v2

**Tester:** AI QA | **Date:** 2026-05-21 | **Build:** Netlify `playful-peony-77899c` | **Scope:** All pages, all tabs, all interactive flows

***

## 1. SITE-WIDE OBSERVATIONS

### 1.1 Theme Inconsistency — CRITICAL BUG

| Page | Theme |
|---|---|
| LIVE | Dark |
| REPLAY Workspace | Dark |
| SESSION SUMMARY | **Light (white bg)** |
| REPLAY LIBRARY hero | Dark → transitions to **Light** card section |
| LEARN index | **Light** |
| LEARN module (Car) | **Light** |
| MODELVIEW | Dark header → **Light** card stage |

**Impact:** Jarring visual context switch. User feels like they've left the app. Navigation bar stays dark on all pages which creates a floating nav anomaly on light pages. Benchmark (F1 official, Fastf1, RaceFans) — all use a single consistent theme throughout their session UIs. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/)

### 1.2 Navigation — Active State

- REPLAY nav item underlined on Replay Library. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/)
- LIVE, MODELVIEW, LEARN have no active underline/highlight when on their respective pages.
- **Bug:** Nav active indicator not applied consistently to all routes.

### 1.3 Page Title Branding

- All pages show `REPLAY-FIRST F1 VIEWER` as subtitle above `F1 Racing` logo — good for context but "F1 Racing" is a generic name; consider a project name.

***

## 2. REPLAY PAGE — Australian Grand Prix

**URL:** `/replay/2025/australian-grand-prix/race/` [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

### 2.1 Header Stats Block

✅ STATUS: GREEN | REPLAY CLOCK: updates correctly | LAP: 1/57 | TRACK: Melbourne  
✅ WEATHER: 15.7C air / 19.2C track | WIND: 3.9m/s - 253°  
✅ Quick-links: REPLAY LIBRARY | MODELVIEW | ILEARN | SESSION SUMMARY — all working

### 2.2 Playback Controls — Tested

| Control | Result |
|---|---|
| PLAY | Works → changes to PAUSE, clock advances |
| PAUSE | Works → stops clock |
| +30s skip | Works → clock jumped 0:10→0:40, leader changed VER→NOR |
| 0.2x speed | Works → button highlights orange |
| Speed presets (0.1x–20x) | All selectable |
| -5m / -1m / -30s / -5s offsets | Visible, not tested for all edge cases |
| +5s / +30s / +1m / +5m | Visible |
| PREV LAP / NEXT LAP | Visible |
| LOAD FULL RACE button | Visible |
| Scrubber bar | Visible progress indicator |

**Bugs / Missing:**

- ❌ **No keyboard shortcut indicator on PLAY button itself** — shortcut is Space but button has no tooltip hint
- ❌ **No elapsed time / remaining time displayed on scrubber** — only "LOADED TO 47:52 / 1:46:08" in status bar which is small text
- ❌ **No scrubber drag-to-seek** — cannot click arbitrary position on scrubber bar to jump to that moment (this is standard in all media players)
- ❌ **No loop button** — for studying specific lap sections repeatedly
- ❌ **No restart button** — "R" key works per shortcut legend but no visible button
- ❌ **LOAD FULL RACE**: only loads 47:52 by default → confusing why not all loaded at once; no loading indicator/progress bar for this action
- ⚠️ Labels toggle (LABELS L), DRS (DRS D), Events (EVENTS B), Marshals (MARSHALS M) visible as toggles but small/hard to discover — no icons
- ⚠️ Speed presets row (0.1x → 20x) not labeled as "Speed" — a new user won't know what these are
- ⚠️ Shortcut legend (`Space play/pause · arrows seek · Shift+arrows 30s · [] laps · R restart · 1-5 speed presets · M marshals`) is plain text, very small, easy to miss

### 2.3 Track Map

✅ Cars animated and move during playback [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)
✅ Driver labels appear on track (NOR, VER, PIA, BOR etc.)  
✅ Race Control messages appear inside map overlay  
✅ Top-3 position strip below map (1 NOR Leader / 11 DOO Leader / 15 SAI Leader)  
⚠️ Only top 3 shown in position strip — no way to expand without the leaderboard  
❌ Cannot click car dots on map to select — must use leaderboard (conflicting UX; track map says "Click any marker to inspect a car")  
**Bug found:** Map click-to-select may not be working for all car positions when crowded

### 2.4 Leaderboard

✅ Columns: POS | DRIVER (3-letter code, full name, team) | GAP | TYRE  
✅ Live lap time shown on each driver row when selected  
✅ Leaderboard reorders dynamically as replay advances  
✅ 1 SELECTED / CLEAR shown when driver selected  
✅ SHIFT+CLICK for compare mode supported  
✅ Tyre legend at bottom (S SOFT, M MEDIUM, H HARD, I INTER, W WET)  
❌ GAP column: shows "+X.XXX" for gap, but no indication of whether it's gap to leader or to car ahead — ambiguous  
❌ No constructor color strip on driver rows (present in F1's own timing app)  
❌ DNF/DNS drivers: listed but position numbers are arbitrary (11, 15, 26) — should be greyed/separated at bottom  

### 2.5 Analysis Deck — 7 Tabs

**TELEMETRY (selected):** [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)
✅ Speed (km/h), Tyre compound + lap count, Last lap time  
✅ Throttle (bar), Brake (bar), Gear, DRS (0/1), RPM, LAP  
❌ No visual graphs/waveforms — all numeric readouts only. Benchmark: F1TV Pro shows waveform overlay per lap. Add mini bar charts or sparklines.  
❌ LAST LAP shows "-" at race start — expected but jarring

**COMPARE:** [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)
✅ "NOR vs VER" auto-compare with delta sections and AI-derived events  
✅ Derived events are quality: "sector gain at S1 – NOR is faster through S1, likely from a cleaner line or more committed entry"  
❌ No visual delta chart (time delta line across lap sectors like F1TV/FastF1)  
❌ Second driver for compare is always VER (default leader) — no UI to change compare target within this tab

**STINTS:**
✅ Shows compound, average lap time, trend (getting faster/slower), laps range  
✅ Side by side for 2 drivers  
❌ No visual stint timeline bar (common in strategy tools like RacingReference)  
❌ No pit stop events shown

**STRATEGY:**
✅ GREEN PIT LOSS (18.9s), SC/VSC PIT LOSS (11.5s), CROSSOVER → INTER (95%), CROSSOVER → WET (99%)  
✅ "Recommended pit windows" with context text  
❌ No probability chart/visualization  
❌ All data is static text — harder to scan quickly

**TRACK:**
✅ Path points (2469), Total laps (57), DRS zones (3 illustrative), Source: OPENF1  
❌ No visual mini track diagram in this panel  
❌ DRS zones labeled "illustrative" — should clarify when actual zones will be populated

**LAP TIMES:**
✅ Beautiful heatmap waterfall — all drivers across 57 laps, green→red per speed [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)
✅ Lap number axis at top (L1, L14, L29, L43, L57)  
❌ No hover tooltip on cells showing exact lap time  
❌ No ability to click a cell to jump the replay to that lap  
❌ Driver names truncated to team+code only, hard to read at a glance

**RACE CONTROL (98):**  
Badge shows 98 messages — not tested in detail but tab renders correctly

***

## 3. LIVE PAGE — Abu Dhabi Grand Prix (Yas Marina)

**URL:** `/live/` | STATUS: SIMULATED  [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/live/)

### 3.1 Header

✅ FEED: Local replay simulator | REPLAY CLOCK: 0:16/1:56:32 | LAP: 1/58  
✅ WEATHER: 26.8C air / 31.4C track | WIND: 2.9m/s - 328°  
✅ STATUS badge: "SIMULATED" (amber color) — distinct from "GREEN"  
✅ Quick-links: REPLAY ROUTE | ABU DHABI GRAND PRIX SUMMARY | MODELVIEW | LEARN  
✅ DISPLAY DELAY slider (0s) — unique to LIVE page, not in Replay  

### 3.2 Key Differences from Replay (correctly implemented)

✅ No playback controls bar — correct, it's live  
✅ Leaderboard shows **speed (km/h)** as sub-text instead of last lap  
✅ TYRE column shows "FRESH" badges  
✅ MESSAGES counter shows 1 instead of 98  

### 3.3 Bugs / Missing vs Replay

❌ **No Analysis Deck on Live page** — only "Selected live telemetry strips." Replay has a 7-tab Analysis Deck; Live has none. Users cannot see lap times, strategy, or stints during a live session. This is a major gap.  
❌ **No fastest lap tracker** visible on Live  
❌ DISPLAY DELAY slider: range unclear (0 to what? seconds? minutes?). No max label.  
❌ RACE CONTROL box: Shows only "SessionStatus: T+0s · Lap 1 · SESSION STARTED" — same single message even as simulation advances. Needs scrolling message feed like Replay.  

### 3.4 Leaderboard Live Differences

✅ Real-time gap updates (+0.417, +3.829, etc.)  
✅ Speed shown per driver  
⚠️ After selecting driver, leaderboard switches from speed to last lap times — mode switch is not labeled/indicated to user

***

## 4. SESSION SUMMARY PAGE

**URL:** `/sessions/2025/australian-grand-prix/race/` [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/2025/australian-grand-prix/race/)

### 4.1 Design

⚠️ **Light theme** — hard contrast switch from dark app  
✅ Header: Fastest Lap (NOR · 1:22.167), Track, Air/Track Temp, Rain Risk (100%)  
✅ Three CTAs: "Open replay", "Open compare route", "Open stint story"  
✅ Driver cards in 2-column grid: team name (colored), driver, CODE, best lap, compound, stints, best sector  

### 4.2 Driver Cards

✅ DNF/DNS badges visible (colored chips)  
✅ HAD card shows "Did not start"  
✅ All 20 drivers visible when scrolling  
❌ No driver headshot or number livery  
❌ No constructor championship points shown  
❌ "Open compare route" and "Open stint story" CTAs navigate nowhere (404 or same page) — dead links  
❌ Best Sector column always shows S2 for most drivers — suspicious, may be data issue  
❌ Stints count is sometimes "-" for DNF drivers where stints=1 is shown — inconsistent

***

## 5. MODELVIEW PAGE

**URL:** `/cars/current-spec/` [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/)

### 5.1 Features Working

✅ Season selector (2025, 2026) and Constructor selector (all teams)  
✅ View modes: Studio, Side, Front, Top, Orbit, Inspect — all switch correctly  
✅ Side view shows correct angle with description "Best read for wheelbase, body length, and rake" [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2026&constructor=fia-2026)
✅ Compare side-by-side: Ferrari SF-25 vs Red Bull RB21 rendered simultaneously [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=ferrari)
✅ Button toggles "Compare side-by-side" → "Hide compare"  
✅ Hotspot labels on 3D model (Rear wing, Floor, Tyres, Brakes, Front wing)  
✅ Airflow Layer panel: Overlay off / Front load / Floor channel / Rear wake  
✅ Current Model metadata: Season, Constructor, Asset size, Status  
✅ FIA 2026 concept car loads (~3.7MB), Red Bull RB21 (~3.1MB compressed), Ferrari SF-25 (~5.6MB)  
✅ Focus Point panel with clickable hotspots linking to learn modules  

### 5.2 Bugs / Missing

❌ **Inspect mode**: clicking Inspect button highlights it but no visible behavior change in the view — expected to show an exploded/annotated view  
❌ **No drag/rotate instructions** — users may not realize the model is interactive (no "drag to rotate" hint)  
❌ **Loading indicator**: "LOADING [CAR] - ~X MB" shown but no progress bar; model appears instantly (good) but text stays showing  
❌ **Compare mode**: left car has hotspot labels, right car has none and no label overlay — comparison is purely visual with no annotation on the reference car  
❌ **No animation**: no moving DRS, no suspension travel demo — static model only  
❌ **No zoom**: no scroll-to-zoom instruction or visible control  
❌ Season 2026 constructor options only show "FIA 2026 spec" — no per-team 2026 cars yet (expected but should be labeled "concept only")  

***

## 6. REPLAY LIBRARY PAGE

**URL:** `/replay/` [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/)

### 6.1 Features Working

✅ Dark hero section with "Find an exported F1 session" headline  
✅ 3-panel info cards: LATEST PACK / LIVE DESK / MODELVIEW  
✅ Quick-link buttons: Open latest replay / Open live feed / Open modelview / Open learn  
✅ Search bar: instant filter — "Monaco" → 1 result (Monaco 2025) working correctly  
✅ NEWEST FIRST / OLDEST FIRST sort toggles  
✅ "34 grand prix" count badge  
✅ 2026 session cards clearly marked "2026 preview replay" (orange label)  
✅ Sprint weekends labeled "SPRINT WEEKEND – FULL COVERAGE"  

### 6.2 Bugs / Missing

❌ **Theme split**: hero is dark, card grid is light — jarring transition mid-page  
❌ **2026 preview replays**: clicking Race/Qualifying cards for 2026 shows "2026 preview replay" text but unclear if they actually open or are placeholder  
❌ **No filters**: no filter by session type (Race only, Qualifying only), no filter by team or driver  
❌ **No "recently viewed" / bookmarks** section  
❌ **No season filter pill** — must scroll to find a specific year  
❌ Session cards: no race winner shown, no fastest lap, no weather icon — cards are sparse  
❌ Search: no debounce indicator, no "no results" empty state message observed  

***

## 7. LEARN PAGE

**URL:** `/learn/` [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/learn/)

### 7.1 Features Working

✅ 6 modules: Car → Aero → Tyres → Braking → Setup → Strategy  
✅---

## 7. LEARN PAGE (continued)

**URL:** `/learn/` + `/learn/car/` [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/learn/)

### 7.1 Features Working ✅

- 6 modules in recommended order: Car → Aero → Tyres → Braking → Setup → Strategy [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/learn/)
- Progress tracker: "0/6 read · 0%" with orange progress bar
- **MARK AS READ** works correctly: Car card shows "✓ READ" (green badge), counter updates to "1/6 · 17%", CTA changes to "Continue with Aero", button toggles to "MARK UNREAD" — localStorage persistence confirmed [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/learn/)
- Module cards show slug URL (`/learn/car`), step number (STEP 1 OF 6), description, and two sequential navigation links ("Continue to aero →", "View 3D car model →")
- HOW TO USE LEARN section: contextual explanation of the cross-surface workflow
- Module page layout: header, inline 3D model section, key points section, CONTINUE cards (2-up: "View 3D car model" + "Continue to aero") [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/learn/car/)

### 7.2 Bugs / Missing ❌

- **CRITICAL — Inline 3D model is completely blank (white canvas).** "Red Bull RB21" label visible at bottom-left but WebGL/Three.js canvas fails to render after 10+ seconds. No loading spinner, no error message, no fallback — the ~200px tall blank white box is confusing and broken. [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/learn/car/)
- **No "Mark as read" button inside the module itself** — must go back to `/learn/` index to mark. Users who finish a module have no in-page completion action.
- **No progress indicator inside module page** — user can't tell they're on step 1/6 while reading
- No estimated read time per module
- No images, diagrams, or illustrations in module text — pure text bullets only
- HOW TO USE LEARN section is hidden at the bottom; should be an onboarding tooltip or modal on first visit
- No search within Learn modules
- "Explore sessions →" and "Return to car overview →" footer links in Strategy module not tested — may be dead links

***

## 8. CROSS-PAGE BENCHMARK: CONSISTENCY MATRIX

| Feature | LIVE | REPLAY | SESSION SUMMARY | REPLAY LIBRARY | MODELVIEW | LEARN |
|---|---|---|---|---|---|---|
| Theme | Dark | Dark | **Light** | Mixed | Mixed | **Light** |
| Nav active state | ❌ | ❌ | ❌ | ✅ (underline) | ❌ | ❌ |
| Page title format | "Live · F1 Racing" | "GP · Race replay · F1 Racing" | "GP · Race · F1 Racing" | "Replay · F1 Racing" | "Modelview · F1 Racing" | "Learn/Car · F1 Racing" |
| Quick action buttons | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Section labels (orange caps) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Analysis / Data deck | Partial (telemetry only) | Full (7 tabs) | Cards view | None | None | None |
| Leaderboard | ✅ | ✅ | N/A | N/A | N/A | N/A |
| Track map | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Keyboard shortcuts | ❌ | ✅ (small text) | ❌ | ❌ | ❌ | ❌ |
| Search | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Scroll-to-top button | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mobile responsive | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested |

**Key benchmark gap vs F1TV Pro / FastF1 / Multiviewer:**

- F1TV shows telemetry waveform overlays → this app shows only numeric readouts
- FastF1 / RacingReference shows interactive lap time delta chart → this app shows heatmap only (good!) but no hover/click
- Multiviewer has floating draggable panels → this app is fixed-layout only
- All benchmarks use a single unified dark theme across all surfaces

***

## 9. BUG PRIORITY LIST

### 🔴 P0 — CRITICAL (blocks core functionality)

| # | Bug | Page | Impact |
|---|---|---|---|
| B1 | Inline 3D model in Learn/Car is blank — never renders | LEARN `/learn/car/` | LEARN module completely broken |
| B2 | No scrubber click-to-seek — cannot jump to arbitrary replay position | REPLAY | Core media control missing |
| B3 | "Open compare route" and "Open stint story" CTAs are dead links | SESSION SUMMARY | Feature promises that go nowhere |

### 🟠 P1 — HIGH (major UX friction)

| # | Bug | Page |
|---|---|---|
| B4 | Theme inconsistency — Session Summary, Learn, Replay Library use light theme while core app is dark | GLOBAL |
| B5 | Nav active state missing on 4/5 nav items | GLOBAL |
| B6 | Live page has no Analysis Deck (no stints, strategy, lap times during live session) | LIVE |
| B7 | Inspect mode button activates but view shows no visible change | MODELVIEW |
| B8 | Telemetry is pure numeric — no waveform/sparkline graphs | REPLAY/LIVE |
| B9 | No loading state/spinner for inline 3D model (blank canvas with no feedback) | LEARN |

### 🟡 P2 — MEDIUM (noticeable UX gaps)

| # | Bug | Page |
|---|---|---|
| B10 | Scrubber bar has no timestamp labels or elapsed/remaining display | REPLAY |
| B11 | LOAD FULL RACE has no progress indicator | REPLAY |
| B12 | Speed presets row unlabeled — no "SPEED" header | REPLAY |
| B13 | GAP column ambiguous (leader gap vs gap to car ahead) | REPLAY/LIVE |
| B14 | DISPLAY DELAY slider has no max-value label | LIVE |
| B15 | DNF/DNS drivers mixed into main leaderboard positions | REPLAY/LIVE |
| B16 | Compare side-by-side: right car has no hotspot labels | MODELVIEW |
| B17 | No "drag to rotate" hint on 3D model | MODELVIEW |
| B18 | No MARK AS READ button inside individual module page | LEARN |
| B19 | No progress step indicator inside module reading view | LEARN |
| B20 | Replay Library: 2026 preview session cards clickable but destination unclear | REPLAY LIB |

### 🔵 P3 — LOW / POLISH

| # | Note |
|---|---|
| B21 | Shortcut legend text too small and unstyled |
| B22 | Race Control toggle says "Show"/"Hide" inconsistently vs "Race Control" label |
| B23 | Session Summary: Best Sector shows S2 for nearly all drivers — potential data bug |
| B24 | No scroll-to-top button on any long pages |
| B25 | LOADING model text stays displayed even after model loads |
| B26 | No constructor color bar on leaderboard rows |

***

## 10. FEATURE IMPROVEMENT IDEAS (Prioritized)

### Replay Controls — Benchmark F1TV / Multiviewer

1. **Click-to-seek scrubber** with timestamp tooltip on hover — standard on all video/replay tools
2. **Waveform telemetry graphs** — throttle/brake/speed as sparkline curves per lap, not just live numbers
3. **Lap time delta visualization** — classic F1 delta chart (green/red relative to reference lap) in the COMPARE tab
4. **Loop a lap segment** — press L to loop current lap for repeated study
5. **Keyboard shortcut cheatsheet overlay** — press `?` to toggle a styled modal of all shortcuts
6. **RESTART button** visible in controls bar (not just `R` key)
7. **Speed label** on the 0.1x–20x preset row ("PLAYBACK SPEED ▼")
8. **Scrubber segment markers** — show pit stop events, safety car periods, lap boundaries as tick marks on the scrubber bar
9. **Mini lap timeline** below scrubber showing SC/VSC/RED FLAG events as color zones

### Live Page

1. **Live Analysis Deck** — port at minimum STINTS and STRATEGY tabs to the live surface
2. **Fastest lap banner** — flash animation when fastest lap is set
3. **Race Control message feed** — scrolling log rather than single-message display
4. **DISPLAY DELAY slider** — add "0s" and "30s" endpoint labels, plus numeric readout

### Leaderboard

1. **Constructor color left-border** on each driver row (red=Ferrari, blue=RBR, etc.)
2. **GAP label** — tooltip or column sub-header clarifying "gap to leader"
3. **DNF/DNS separation** — greyed-out section below racing drivers with "CLASSIFIED / NOT CLASSIFIED" divider
4. **Fastest lap indicator** — purple highlight on the fastest lap holder (F1 standard)
5. **Position change arrows** — show +2 / -1 position delta since last update

### Modelview

1. **"Drag to rotate / scroll to zoom" ghost overlay** on first load (fades after 2s)
2. **Animated DRS** — toggle DRS open/closed state on model
3. **Compare mode labels** — constructor name + car model shown above each panel in compare view
4. **Hotspot click behavior** — clicking a hotspot should snap camera to that part AND highlight it with a glow ring
5. **Wind tunnel mode** — colored particle stream over airflow layer (illustrative)

### Learn

1. **Fix inline 3D model rendering** — highest priority; the blank canvas is the core differentiator of this module
2. **In-page MARK AS READ button** at the bottom of each module
3. **Step progress chip** inside module header: "Step 2 of 6 · Aero"
4. **Estimated read time** per module card: "~4 min read"
5. **Diagrams / illustrations** for each module (at minimum labeled SVG diagrams)
6. **Contextual deep links** from Learn content into Replay — e.g., "See Norris's S1 gain →" links to jump replay to that moment

### Global / UX Polish

1. **Unified dark theme** across ALL pages — Session Summary, Learn, Replay Library card sections all need dark variants
2. **Consistent nav active states** — all 4 nav items should highlight when on their route
3. **Scroll-to-top button** on long pages (Session Summary, Replay Library, Learn)
4. **Keyboard shortcut icon** (⌨) in corner of Replay + Live pages linking to shortcut overlay
5. **Mobile layout pass** — not tested but given dense data density, likely broken below 768px
6. **Favicon and OG meta tags** — check for proper social share preview and tab icon
7. **404 page** — verify custom 404 for broken routes like "Open compare route"

***

## 11. OVERALL SCORES

| Dimension | Score | Notes |
|---|---|---|
| Feature depth | 8.5/10 | Analysis Deck is genuinely excellent; 7 tabs, AI-derived compare insights |
| Visual design | 7/10 | Dark theme looks great but theme inconsistency drags it down significantly |
| Replay controls | 6/10 | Play/pause/speed work but missing scrubber seek, loop, waveforms |
| Data accuracy | 8/10 | OpenF1-backed, real lap times, compounds, gaps all correct |
| Navigation UX | 6/10 | No active nav states, dead CTAs, inconsistent cross-links |
| Learn module | 4/10 | Inline 3D completely broken; text-only content otherwise |
| Modelview | 8/10 | Best-in-class 3D car inspector; compare mode is impressive |
| Live surface | 7/10 | Solid but missing Analysis Deck vs replay parity |
| **Overall** | **7.0/10** | **Strong analytical core; fix theme + Learn 3D + scrubber = 8.5+** |
