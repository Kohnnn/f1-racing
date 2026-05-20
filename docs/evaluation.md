
---

# F1 Racing App — QA Evaluation Report

**URL:** `https://playful-peony-77899c.netlify.app/`
**Tester:** Comet (AI QA)
**Date:** 2026-05-20
**Scope:** All 4 open tabs + linked routes (Home, Learn, Sessions/Summary, 2026 preview)

***

## 1. SITE STRUCTURE MAP

```
/ (Home)
├── /live                           ← Live Workspace
├── /replay                         ← Replay Library
│   └── /replay/{year}/{race}/{session}  ← Race Workspace
├── /cars/current-spec              ← Modelview (GLB viewer)
├── /learn                          ← Learn index
│   └── /learn/{car|aero|tyres|braking|setup|strategy}
└── /sessions/{year}/{race}/{session} ← Session Summary
```

***

## 2. PAGE-BY-PAGE QA

### 2.1 HOME (`/`)

**Status: ✅ Functional**

- Hero section renders correctly with "REPLAY THE RACE." headline [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/)
- CTA "OPEN LATEST REPLAY" correctly links to Abu Dhabi GP Race
- Red Bull RB21 hero GLB loads (~3.1 MB compressed) with inline driver links to formula1.com
- 4 nav items: LIVE / REPLAY / MODELVIEW / LEARN — all correctly routed
- Navigation tag reads "REPLAY-FIRST F1 VIEWER" as brand sub-label
- Footer/anchor `#core-loop` scroll works

**Issues:**

- `title` tag = `"Home"` — not descriptive. Should be `"F1 Racing – Replay-First F1 Viewer"` for SEO/tab clarity
- The home nav does NOT include the active page indicator (`aria-current`) — inconsistent with inner pages
- "SCROLL" anchor link on hero is plain text, no visible scroll button/arrow icon, low affordance [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/)

***

### 2.2 LIVE (`/live`)

**Status: ✅ Functional (Simulated feed)**
 [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/live/)

**What works:**

- Feed status: "Local replay simulator" clearly labeled — users won't mistake it for a real live feed
- Replay clock ticks correctly (confirmed: 6:32 → 7:44 over test period)
- Lap counter increments: `5/58 → 8/58` during observation
- Weather + wind data present (26.8°C air, 31.4°C track, 2.5 m/s wind)
- Track map (Yas Marina) renders with all 20 car markers, labeled
- Leaderboard: all 20 drivers shown, full name + team + gap + tyre + laps
- Driver selection via leaderboard click works: "SELECTED" counter updates (0→1), CLEAR button appears
- Driver telemetry strip appears after selection: SPEED, TYRE, LAST LAP, THROTTLE (bar chart), BRAKE (bar chart), GEAR, DRS, RPM, LAP — all populate and update in real-time
- Race Control messages show (SessionStatus, GREEN LIGHT messages)
- Search box in leaderboard present (`aria-label="Search leaderboard"`)

**Issues:**

- `STATUS: LIVE` label is misleading when feed is actually a local replay simulator — "LIVE" should conditionally render as "SIMULATED" or use a different color/badge
- `MESSAGES: 1` counter shown on initial load but only 2 race control messages exist — counter increments to 2 but the toggle button for race control messages is `disabled` in the DOM  — users cannot expand/view message history [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)
- Leaderboard title says "CLICK TO INSPECT" but no tooltip or visual cue explains the shift-click multi-select capability — discoverability issue
- No visible keyboard shortcut hints on the Live page (replay page has them, live does not)
- Mobile/narrow viewport: nav collapses correctly but the telemetry strip layout becomes cramped at ~480px width (seen when the page opened in narrow tab ) [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/)

***

### 2.3 REPLAY LIBRARY (`/replay`)

**Status: ✅ Functional**
 [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/)

**What works:**

- Full 2025 season listed in reverse-chronological order (Abu Dhabi → Miami)
- Sprint weekends correctly labeled "SPRINT WEEKEND - FULL COVERAGE" with all 4 session types (Race, Sprint, Sprint Qualifying, Qualifying)
- Regular weekends labeled "RACE + QUALIFYING"
- **2026 season section exists** with Japan GP as "2026 preview replay" (Race only, placeholder notice)
- CTAs at top: "Open latest replay", "Open live feed", "Open modelview", "Open learn" — all work
- 3 featured cards (LATEST PACK / LIVE DESK / MODELVIEW) are helpful quick-access anchors

**Issues:**

- **Session coverage is inconsistent** — all 2025 races listed as "Race and support session exported" but there's no explanation of what "support session" means (Practice? Qualifying?). The links only show Race + Qualifying, so "support session" copy is misleading
- **Season order**: the list goes Abu Dhabi (end of season) → Australian (start), which is reverse-chron. This is fine but there's no toggle to sort oldest-first for users following the season chronologically
- The page lacks filtering: no filter by circuit, session type, or sprint/non-sprint
- **2026 Japan GP**: labeled "RACE ONLY" and "More sessions become available as the OpenF1 archive opens up" — but the entry point is `/replay/2026/japan-grand-prix/race` which may 404 or show incomplete data without user warning. No "preview" / "incomplete" visual badge on the card
- No search/filter on the library page — as the list grows (multiple seasons), this will become unusable

***

### 2.4 RACE REPLAY WORKSPACE (`/replay/2025/australian-grand-prix/race/`)

**Status: ✅ Functional — richest surface**
 [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/replay/2025/australian-grand-prix/race/)

**What works:**

- Header stat strip: STATUS / REPLAY CLOCK / LAP / TRACK / WEATHER / WIND — all correct
- Data source badge: "FASTF1 FEED" shown prominently
- Track map (Melbourne): all 20 car markers render, labeled with driver codes
- Top-3 mini-banner below map: `1 NOR Leader | 2 VER +2.057 | 3 RUS +4.246` — updates live
- **Playback controls** (fully tested):
  - Play/Pause toggles correctly; clock advances (0:00 → 0:04 → 0:10)
  - Car positions update on map during playback
  - Speed presets: 0.1x / 0.2x / 0.5x / 1x / 2x / 4x / 8x / 16x / 20x — range is excellent
  - Seek buttons: -5m / -1m / -30s / -5s / +5s / +30s / +1m / +5m — complete
  - "Prev lap" / "Next lap" present
  - "BUFFERED TO 9:58" badge indicates data loaded limit clearly
- Toggle buttons: LABELS L / DRS D / EVENTS B — all togglable, keyboard shortcut hints shown
- **Race Control event buttons**: 80+ "Jump to [event] at [timestamp]" buttons exist in the DOM, stacked on the scrubber track — correctly structured but visually all render at coordinates (743, 593) (same X/Y for all), indicating they are overlapping on a timeline widget and only one is visible at a time
- Leaderboard: 20 drivers, full detail (gap, speed km/h, tyre compound + laps)
- **Driver selection**: click selects driver (1 SELECTED shown), CLEAR button appears
- **Analysis Deck** — 3 tabs:
  - `TELEMETRY · 1`: Shows NOR card with Speed/Tyre/Last Lap/Throttle/Brake/Gear/DRS/RPM/Lap — live-updating ✅
  - `COMPARE`: Shows "NOR vs VER" featured lap pair with Delta sections + Derived events (AI-generated natural-language insights) ✅
  - `STINTS`: Shows "Tyre window snapshot" for VER vs NOR with compound + average lap time ✅

**Issues:**

- **`LAST LAP: -`** on telemetry at Lap 1 — expected, but visually looks like missing data. A label like `"N/A (lap 1)"` would be clearer
- **`button "Toggle race control messages" [disabled]`** in DOM — a button exists to toggle the race control messages panel but it's disabled. Users can see the messages listed inline but have no way to expand/hide them. The disabled state is unexplained
- **"BUFFERED TO 9:58"**: The replay data only covers 9:58 out of a ~2h race. Users who try to skip ahead will hit a buffer wall with no clear indicator of how to load more — no "Load more" button visible
- **Session Summary** (`/sessions/`) link goes to a separate route — some users may not find it
- **Driver speeds at 0 km/h** for DNF drivers (LAW, BOR, ALO, SAI, HAD, DOO) shown in leaderboard — `0 km/h` is confusing when these cars are parked/retired. Should show "DNF" or "RETIRED" state
- The `COMPARE` tab hardcodes "NOR vs VER" regardless of selected drivers — it should dynamically compare the two selected drivers instead
- Tyre column shows "I" for Intermediate without a legend — new users won't know what M/H/S/I mean

***

### 2.5 MODELVIEW (`/cars/current-spec/`)

**Status: ✅ Functional — visually impressive**
 [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2025&constructor=mclaren)

**What works:**

- Season dropdown: 2025 / 2026
- Constructor dropdown: Red Bull Racing / McLaren / Ferrari / Mercedes / Aston Martin / Alpine (6 constructors)
- Switching Ferrari loads "Ferrari SF-25" with correct description ✅
- Camera preset buttons: Studio / Side / Front / Top — all switch view correctly, active state highlighted in orange
- 3D model loads with hotspot labels: Front wing, Floor, Rear wing, Brakes, Tyres — clickable
- Hotspot click pans camera toward component
- Airflow layer overlay: Off / Front load / Floor channel / Rear wake — toggleable
- Disclaimer: "Visual guide only. Not a measured aerodynamic result." ✅
- Focus panel on right: links to learn modules per component
- Asset size shown: `~36.2 MB (compressed)` — transparency is good
- URL updates with `?season=2025&constructor=ferrari` on change — shareable/deep-linkable ✅

**Issues:**

- **Constructor list is limited to 6**: Missing Williams, Racing Bulls, Haas, Kick Sauber. No explanation of why — users may expect all 10 teams
- **2026 season**: If selected, unclear which constructors are available; no 2026-specific constructor list visible from the dropdown (shows same 6 as 2025)
- **Model load indicator**: "LOADING MCL39 · ~36.2 MB (COMPRESSED)" appears but disappears quickly; on slow connections there's no persistent spinner
- **Top view** camera angle: the car fills the viewport well in Studio, Side, Front but Top view may clip the car depending on viewport size — not verified but likely
- **Hotspot click vs drag conflict**: clicking a hotspot on a draggable 3D canvas is error-prone — a small mis-drag dismisses the hotspot. No dedicated "click mode" vs "orbit mode" toggle
- **No comparison mode**: Users cannot load two constructors side-by-side for bodywork comparison despite the description saying "comparing bodywork shape against Red Bull reference" — the reference model is implicit, not shown

***

### 2.6 LEARN (`/learn/`, `/learn/car`, etc.)

**Status: ✅ Functional — content surface**
 [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/learn/)

**What works:**

- 6 modules: Car / Aero / Tyres / Braking / Setup / Strategy
- Each module card shows next-link suggestions (2 NEXT LINKS)
- `/learn/car` loads correctly with "Key Points" list
- Module cards link correctly to each subpage
- Cross-linking between modules works ("Continue to aero", "Return to tyres", etc.)

**Issues:**

- **No progress tracking** — users can't see which modules they've completed
- **No back navigation** within learn modules (breadcrumb only shows current page)
- The learn index shows all 6 modules as equal — no indication of recommended reading order
- Module pages appear text-only (on the `/learn/car` page viewed) — no inline 3D model embed or media, despite the description promising "pair with the 3D model"
- **No mobile-optimized reading view** — long-form text on narrow screen has standard paragraph layout, no estimated read time

***

### 2.7 SESSION SUMMARY (`/sessions/2025/australian-grand-prix/race/`)

**Status: ✅ Functional — loads asynchronously**
 [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/2025/australian-grand-prix/race/)

**What works:**

- Async load: "Fetching drivers, laps, and strategy" shown before data populates ✅
- Loads: Fastest Lap (NOR 1:22.167), Track (Melbourne), Air/Track temps, Rain Risk (100%), Pit loss, SC pit loss, crossover %
- Full 20-driver card list with best lap + tyre compound + stints
- 3 CTAs: "Open replay", "Open compare route", "Open stint strategy"

**Issues:**

- **Page is wider than viewport** causing horizontal scroll — driver cards appear to extend beyond the right edge. Layout appears to use fixed-width cards without `max-width: 100%` responsive constraint [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/2025/australian-grand-prix/race/)
- **Best Lap = 0.000** for DNF drivers (HAD, DOO, SAI) — should show "DNF" or "DNS" [playful-peony-77899c.netlify](https://playful-peony-77899c.netlify.app/sessions/2025/australian-grand-prix/race/)
- Page title: `"Australian Grand Prix · Race · F1 Racing · F1 Racing"` — **"F1 Racing" is duplicated** in the title tag. Bug
- Session summary link not in main nav — accessible only from within a replay workspace; no direct entry point

***

## 3. CROSS-CUTTING ISSUES

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1 | HIGH | Replay Workspace | `Toggle race control messages` button is `disabled` — no way to expand/collapse messages |
| 2 | HIGH | Session Summary | Page title has duplicated brand name: `"F1 Racing · F1 Racing"` |
| 3 | HIGH | Session Summary | Horizontal overflow / layout break on narrow viewport |
| 4 | MED | Live | `STATUS: LIVE` shown during simulated replay — misleading |
| 5 | MED | Race Replay | `LAST LAP: -` shows no value on lap 1 — needs null state label |
| 6 | MED | Race Replay | DNF drivers show `0 km/h` — should show RETIRED/DNF state |
| 7 | MED | Race Replay | `COMPARE` tab hardcoded to NOR vs VER, ignores selected driver |
| 8 | MED | Modelview | Only 6 of 10 constructors available — no explanation for missing teams |
| 9 | MED | Replay Library | "Support session" copy is vague/misleading |
| 10 | LOW | Home | `<title>Home</title>` — not descriptive |
| 11 | LOW | Live | No keyboard shortcut hints on live page (replay page has them) |
| 12 | LOW | Replay Library | No search/filter — will become unusable as season list grows |
| 13 | LOW | Tyre display | M / H / S / I tyre codes used with no legend anywhere |
| 14 | LOW | Learn | No progress tracking or recommended reading order |
| 15 | LOW | Modelview | Hotspot click vs orbit drag conflict — easy to accidentally orbit instead of clicking |

My comment:
YOU STRIP DOWN MY REPLAY FEATURE NOW IT DOG SHIT PLEASE FOLLOW THE ABOVE GIT REPO ADD IT BACK AGAIN

STILL NO FUILD/AIR FLOW SIM ADD IT BACK TOO

console eror/logs:
race/:1 Error handling response: TypeError: Cannot read properties of undefined (reading 'success')
    at chrome-extension://cgdjpilhipecahhcilnafpblkieebhea/s2k-listener.js:13833:30
race/:1 Unchecked runtime.lastError: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received
race/:1 Uncaught (in promise) Error: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received
content.js:11 Uncaught Error: Extension context invalidated.
    at a (content.js:11:1155)
    at content.js:11:1041
a @ content.js:11
(anonymous) @ content.js:11
setTimeout
r @ content.js:11
(anonymous) @ content.js:11
setTimeout
s @ content.js:11
content.js:11 Uncaught Error: Extension context invalidated.
    at a (content.js:11:1155)
    at content.js:11:1041
a @ content.js:11
(anonymous) @ content.js:11
setTimeout
c @ content.js:11

***

## 4. IMPROVEMENT PASS 2026-05-20 (post-drop)

### 4.1 Issues fixed in this pass

| # | Status | Fix |
|---|---|---|
| 1 | Fixed | Race-control panel button is enabled whenever the session has any messages. Opens an in-place feed with category filters (All / Flags / DRS / Penalties / Investigations / SC-VSC / Other), seek-on-click rows, an "upcoming" muted state for messages still in the future, and a dedicated `Race control · N` tab in the analysis deck. The popover shows the full ordered list, newest first, with the elapsed/upcoming distinction. Race-control rewind hygiene works because the elapsed flag is recomputed from `currentTime` every render. |
| 2 | Fixed | Session summary `<title>` no longer duplicates `· F1 Racing`. The route-level `generateMetadata` now returns just `${grandPrix} · ${session}` and lets the root layout template add the brand suffix. Home page now uses an absolute title `F1 Racing — Replay-first F1 viewer`. |
| 3 | Fixed | Session summary horizontal overflow. `panel-grid > *` and `.driver-card` got `min-width: 0`, names wrap with `word-break: break-word`. Verified at 360 / 768 / 1280px. |
| 4 | Fixed | `STATUS: LIVE` no longer shown when running off the local replay simulator. The banner pill renders `SIMULATED` (amber) until the OCI socket pushes a real frame, at which point it flips to `LIVE` (green). `Last frame Ns ago` is rendered under the Feed tile. |
| 5 | Fixed | `LAST LAP: -` replaced with `Not yet completed` for drivers who have not yet crossed S/F. |
| 6 | Fixed | DNF / DNS / DSQ / LAPPED state now lives in `DriverSummary` (populated from OpenF1 `session_result`). The leaderboard renders a red `DNF`/`DNS`/`DSQ` pill in the gap column for retired drivers, line-throughs the name, and shows `Out of session` instead of `0 km/h`. The session-summary `DriverCard` shows a status badge and `Did not finish` / `Did not start` / `Disqualified` instead of `0:00.000`. |
| 7 | Fixed | Compare tab now builds a live compare pack from the two pinned drivers' fastest laps in the loaded `laps.json`. The Compare tab title flips to `live` when this dynamic pack is in use. Falls back to the static manifest pair when fewer than two drivers are pinned. |
| 8 | Fixed | Modelview shows a "Coming soon: Williams, Racing Bulls, Haas, Kick Sauber" callout under the constructor dropdown. Drop a GLB into `glb_model/` and add it to `pipeline/export/src/sync-web-models.mjs` to ingest. |
| 9 | Fixed | Replay library coverage labels now read `Race + qualifying`, `Sprint weekend - full coverage`, etc. The per-card subtitle uses the matching, concrete copy ("Race exported. Qualifying and sprint not yet released by OpenF1." etc.) |
| 10 | Fixed | Home page title is now `F1 Racing — Replay-first F1 viewer`. |
| 11 | Fixed | Live page now has a `Display delay` slider (0-60s, 5s steps) and a keyboard hints strip (`Click`, `Shift+Click`, `Esc`). |
| 12 | Fixed | Replay library has a search box (filters by GP name / slug / session name) and a Newest-first / Oldest-first sort toggle. |
| 13 | Fixed | Tyre legend strip docked at the bottom of the leaderboard panel. |
| 14 | Fixed | Learn index is a client component now. Adds: a recommended-order strip (Car → Aero → Tyres → Braking → Setup → Strategy), a localStorage progress bar, per-card `Mark as read` toggle, `✓ Read` badge, and a `Continue with X` shortcut. |
| 15 | Improved | The hotspot rail in Modelview already lists every focus point as a regular button, so users have a click path that doesn't conflict with orbit drag. The 3D model hotspots remain available too. |

### 4.2 Replay depth restored from the reference repos

The QA comment "you stripped down my replay feature" is addressed by porting the missing panels documented in `docs/reference-replay-source-analysis-2026-05-04.md`:

- **Race Control tab + popover** with category filters (Flags / DRS / SC-VSC / Penalties / Investigations / Other) and seek-on-click rows. Adapted from the F1ReplayTiming filter pattern and the IAmTomShaw race-control feed window.
- **Strategy tab** (new): green-flag pit loss, SC/VSC pit loss, intermediate/wet crossover thresholds, recommended pit windows, and per-driver tyre-window reads (compound, stint laps, average pace, trend per lap). Uses the existing `strategy.json` and `stints.json` packs and reacts to the leaderboard pinning.
- **Track tab** (new): centerline path-point count, total laps, illustrative DRS zone count, source label. The `TrackMetadata` schema is added to `apps/web/src/lib/data.ts` so a future FastF1 export can drop a `track.json` per session with corner labels, marshal sectors, sector boundaries, and DRS zones; the renderer falls back to the dense polyline today.
- **Compare-from-pinned-drivers**: Compare is no longer hardcoded to `manifest.compare`'s first key. Pin two drivers in the leaderboard and the Compare tab flips to a live pack built from their fastest laps in `laps.json`.

### 4.3 Modelview airflow / fluid sim — Tier 1 ships

`apps/web/src/components/wind/canvas-wind-tunnel.tsx` is the new Tier 1 Canvas Wind Tunnel:

- 60 Hz canvas with ~320 particles drifting along an analytical vector field (potential-flow doublet + downstream Karman wake + floor-channel acceleration).
- Pressure heat tint sampled on a 32×32 grid behind the particles. Blue = low pressure (faster flow), orange = high pressure (slower flow).
- Stylised side-profile silhouette with front-wing block, rear wing, and floor line. Rear wing turns green when DRS is open. Yaw rotates the silhouette by a small fraction.
- Six controls: airspeed (20-140 m/s), yaw (±15°), ride height (20-50 mm), DRS open/closed, rolling road / fixed, wheels rotating / stationary.
- Disclaimer: "Visual guide only - not a measured aerodynamic result. Tier 2 LBM solver coming next."
- Tier 2 (Web-Worker D2Q9 LBM driven by the GLB silhouette) is still planned per `docs/reference-replay-source-analysis-2026-05-04.md` Phase 5, and Tier 3 (cached OpenFOAM Cp fields baked into the GLB) is gated by the existing OpenFOAM scaffold under `pipeline/openfoam/`.

### 4.4 Files changed

- `apps/web/src/app/page.tsx`: home title (absolute).
- `apps/web/src/app/sessions/[season]/[grandPrix]/[session]/page.tsx`: title de-duplication.
- `apps/web/src/app/learn/page.tsx`, `apps/web/src/app/learn/learn-index.tsx`: client-side Learn index with progress.
- `apps/web/src/components/replay/Leaderboard.tsx`: DNF state, retired styling, tyre legend strip, copy.
- `apps/web/src/components/replay/ReplayView.tsx`: race-control panel + popover, full-feed filter, expanded analysis deck (Strategy / Track / Race control tabs), dynamic compare from pinned drivers, retired status wiring, sanitized note.
- `apps/web/src/components/replay/replay-route-client.tsx`: hydrates `drivers.json`, `laps.json`, `strategy.json` so ReplayView can build dynamic compare and retired state.
- `apps/web/src/components/replay/replay-insights.tsx`: new `ReplayStrategyPanel`, `ReplayTrackInfoPanel`.
- `apps/web/src/components/replay/replay-library.tsx`, `apps/web/src/components/replay/replay-library-client.tsx`: client-side search + sort toolbar, concrete subtitle copy.
- `apps/web/src/components/live/live-route-client.tsx`: SIMULATED/LIVE/Syncing pill, frame age, delay slider, ESC clears selection, keyboard hints strip.
- `apps/web/src/components/model-viewer/car-model-browser.tsx`: Coming-soon callout, Wind Tunnel host.
- `apps/web/src/components/wind/canvas-wind-tunnel.tsx`: new Tier 1 wind tunnel component.
- `apps/web/src/components/telemetry/driver-card.tsx`: `Did not finish` etc. labelling.
- `apps/web/src/lib/data.ts`: `DriverSummary.status`, `DriverSummary.finalPosition`, `TrackMetadata` schema.
- `apps/web/src/app/globals.css`: simulated/live pills, race-control filter strip, library toolbar, learn cards, wind tunnel, retired rows, status badges.
- `pipeline/export/src/build-openf1-session-pack.mjs`: pulls `session_result` into driver summaries (`status` + `finalPosition`).

### 4.5 Verification

- `npm run next:build -w @f1-racing/web` produces 256 static pages cleanly.
- `node pipeline/export/src/refresh-all-openf1-packs.mjs --skip-practice` rebuilt 60 / 60 sessions; every pack now includes `status`, `finalPosition`, retired-row eligible.
- `node pipeline/export/src/verify-replay-pack.mjs --season 2025 --grandPrixSlug abu-dhabi-grand-prix --sessionSlug race` passes.
- Smoke check (`curl -I`) returns 200 on `/`, `/live`, `/replay`, `/replay/2025/australian-grand-prix/race/`, `/sessions/2025/australian-grand-prix/race/`, `/cars/current-spec/`, `/learn`, `/robots.txt`.
- Title check: built HTML for the Australian session summary now contains `<title>Australian Grand Prix · Race · F1 Racing</title>` with no duplication.

### 4.6 Intentionally deferred

- Tier 2 LBM Web-Worker simulation and Tier 3 baked OpenFOAM Cp fields are queued for the next pass per the Modelview airflow plan.
- FastF1 `track.json` real export (corner labels, marshal sectors, DRS zones) is queued; the schema is in place and the runtime falls back to the dense polyline.
- Williams / Racing Bulls / Haas / Kick Sauber GLBs are not yet present in `glb_model/`. The catalog and Modelview already announce this with the Coming-soon strip.
- Live OCI feed `delay` is currently client-side only; backend buffer is a follow-up.
