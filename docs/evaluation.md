
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
