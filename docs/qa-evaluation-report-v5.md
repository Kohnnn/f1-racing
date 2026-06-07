# F1 Racing App - QA Evaluation Report v5

**Production URL:** https://playful-peony-77899c.netlify.app  
**Primary route:** https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2026&constructor=fia-2026&focus=front-wing  
**Test date:** 2026-05-29, Asia/Saigon  
**Tester:** QA AI via Playwright browser automation  
**Browser:** Chromium 148.0.7778.96, headless, viewport 1440 x 1150, deviceScaleFactor 1  
**Evidence bundle:** `output/playwright/qa-v5/qa-v5-results.json` plus screenshots in `output/playwright/qa-v5/`

## Executive Summary

The v5 production deployment passes the release-blocker benchmark that failed in v4. The FIA 2026 model loads and the loading badge clears, DRS changes both estimated and raw solver drag, AUS replay auto-loads the full race, Live Race Control advances beyond session start in OCI replay fallback, and `/sessions/` redirects to `/replay/`.

This is still an educational visualization, not quantitative CFD. Cd/Cl/Cy are correctly labelled as estimates, raw Lift remains effectively zero in the tested side-view scenarios, and rolling-road/wheel toggles are visible but have only a weak raw-force effect.

## Benchmark Summary

| Area | Result |
| --- | --- |
| Overall blocker benchmark | Pass |
| Modelview ready time | 9.119s, loading badge visible count `0` |
| Procedural FPS | 60 |
| Airfoil FPS | 60 |
| AUS replay full-load time | 1.467s |
| Live Race Control next-event time | 52.778s |
| OCI health | `200`, `{"ok":true,"service":"f1-racing-api"}` |
| Console evidence | 2 warnings, 2 errors |
| Network non-OK | `404` for missing `/data/silhouettes/fia-2026.json` |

Console evidence:

- WebGL warning: `GPU stall due to ReadPixels`.
- Canvas warning from QA sampling: `getImageData` would be faster with `willReadFrequently`.
- Expected resource error: missing FIA 2026 SVG silhouette JSON returned `404`.
- Transient `/learn/aero/` error: `TypeError: Failed to fetch` from a Next static chunk.

## Modelview

### Finding V5-MV-01

**Status:** pass  
**Severity:** P1  
**Reproduction steps:** Open the primary route and wait for the FIA 2026 model and wind tunnel panel.  
**Expected behavior:** Page loads, wind tunnel is visible, FIA 2026 GLB renders, and the loading badge clears.  
**Actual behavior:** GLB request returned `200`; `model-viewer.loaded` was `true`; visible `.car-viewer-loading` count was `0`; wind tunnel was visible.  
**Benchmark:** ready within 9.119s.  
**Screenshot:** `output/playwright/qa-v5/modelview-primary.png`

## Wind Tunnel Modes

### Finding V5-WT-01

**Status:** pass  
**Severity:** P2  
**Reproduction steps:** Click `Procedural`, `Airfoil`, `SVG art`, and `GLB hull`.  
**Expected behavior:** All four modes are visible, active state changes, and `Silhouette:` label updates.  
**Actual behavior:** All four modes were clickable with `aria-selected="true"` on the active mode. Labels updated to `PROCEDURAL`, `AIRFOIL`, `-`, and `GLB`.  
**Screenshots:** `mode-procedural.png`, `mode-airfoil.png`, `mode-svg-art.png`, `mode-glb-hull.png`

### Finding V5-WT-02

**Status:** warn  
**Severity:** P3  
**Reproduction steps:** Click `SVG art` on FIA 2026.  
**Expected behavior:** Either a curated SVG silhouette renders or fallback copy is user-facing.  
**Actual behavior:** FIA 2026 SVG art is still missing and `/data/silhouettes/fia-2026.json` returns `404`. Fallback copy is clean and does not expose internal commands, paths, `node`, `pipeline/export`, or build instructions.  
**Screenshot:** `output/playwright/qa-v5/mode-svg-art.png`

### Finding V5-WT-03

**Status:** warn  
**Severity:** P3  
**Reproduction steps:** Click `GLB hull`.  
**Expected behavior:** GLB-derived hull renders as a legible educational silhouette.  
**Actual behavior:** GLB mode loads and the label reports `GLB`, but the visual hull remains noisy compared with Procedural/Airfoil.  
**Screenshot:** `output/playwright/qa-v5/mode-glb-hull.png`

## Airfoil Mode

### Finding V5-AF-01

**Status:** pass  
**Severity:** P1  
**Reproduction steps:** Click `Airfoil`, move Airfoil AoA from `-12deg` to `16deg`, and repeat intermediate changes.  
**Expected behavior:** Airfoil AoA control appears, DRS is hidden or irrelevant, shape changes, Cl direction changes plausibly, Cd stays positive, and solver remains live.  
**Actual behavior:** Airfoil AoA slider appeared; DRS control was hidden. At `-12deg`, Cl est was `-1.44` and Cd est was `0.22`. At `16deg`, Cl est was `1.92` and Cd est was `0.27`. Canvas hash changed and FPS stayed at `60`.  
**Screenshots:** `airfoil-aoa-negative.png`, `airfoil-aoa-positive.png`

## Procedural DRS

### Finding V5-DRS-01

**Status:** pass  
**Severity:** P1  
**Reproduction steps:** In Procedural mode, compare DRS closed and open after settling.  
**Expected behavior:** Rear wing geometry changes, Cd/Cl estimates change, raw Drag changes by at least 5 percent in the expected direction, and warming state clears.  
**Actual behavior:** DRS changed canvas output and estimates. Raw Drag changed from `1.576` closed to `1.467` open, a `-6.92%` delta. Cd est changed `0.76 -> 0.68`; Cl est changed `-2.12 -> -1.95`; FPS stayed `60`; solver warming overlay was absent after settling.  
**Screenshots:** `procedural-drs-closed.png`, `procedural-drs-open.png`

## Yaw

### Finding V5-YAW-01

**Status:** pass  
**Severity:** P1  
**Reproduction steps:** Move Yaw to `-15deg`, `0deg`, and `15deg`.  
**Expected behavior:** Labels update, wind rake/streamlines respond visually, and Cy changes sign with yaw.  
**Actual behavior:** Labels updated to `YAW -15deg`, `YAW 0deg`, and `YAW 15deg`. Cy est changed `-0.36 -> 0.00 -> 0.36`, and canvas hashes changed across yaw states.  
**Screenshots:** `yaw--15.png`, `yaw-0.png`, `yaw-15.png`

## Wind Rake And Probe

### Finding V5-WR-01

**Status:** pass  
**Severity:** P2  
**Reproduction steps:** Set Wind rake low/high, click the canvas at upper and lower positions, and hover the canvas.  
**Expected behavior:** Wind rake marker moves to the slider/clicked height, particle source follows it, and probe shows U, Cp, vorticity, and distance/inside-body status.  
**Actual behavior:** Canvas clicks updated the control to `28%` and `78%`. Hover probe showed `U 65.8 m/s`, `Cp 0.000`, vorticity `0.187`, and distance `0.9%`.  
**Screenshots:** `wind-rake-low.png`, `wind-rake-high.png`, `wind-rake-click-upper.png`, `wind-rake-click-lower.png`, `hover-probe.png`

## Rolling Road And Wheels

### Finding V5-RW-01

**Status:** warn  
**Severity:** P3  
**Reproduction steps:** Toggle `Rolling road` and `Wheels rotating` off/on in Procedural mode.  
**Expected behavior:** Visual road/wheel state changes and, if represented in the worker, solver/wake readouts change detectably.  
**Actual behavior:** Canvas hash changed and the visual state changed. Raw Drag changed only `1.568 -> 1.573`, which is too small to call a meaningful solver effect. No runtime crash was observed.  
**Screenshots:** `rolling-road-wheels-off.png`, `rolling-road-wheels-on.png`

## Replay And Live

### Finding V5-REP-01

**Status:** pass  
**Severity:** P1  
**Reproduction steps:** Open `/replay/2025/australian-grand-prix/race/`.  
**Expected behavior:** AUS replay auto-loads all race chunks without pressing `Load full race`.  
**Actual behavior:** Replay reached `Loaded 1:46:08 / 1:46:08` in 1.467s, `Load full race` was hidden, and all 7 chunk requests returned `200`.  
**Screenshot:** `output/playwright/qa-v5/aus-replay.png`

### Finding V5-LIVE-01

**Status:** pass  
**Severity:** P1  
**Reproduction steps:** Open `/live/` and wait for the next Race Control event.  
**Expected behavior:** Live page source copy is not contradictory and Race Control advances beyond `SESSION STARTED`.  
**Actual behavior:** Feed source was `OCI replay fallback`; Race Control showed `T+0s` session start and advanced to `T+416s · Lap 1 · GREEN LIGHT - PIT EXIT OPEN` after about 52.8s.  
**Screenshot:** `output/playwright/qa-v5/live.png`

### Finding V5-LIVE-02

**Status:** warn  
**Severity:** P2  
**Reproduction steps:** Use `/live/` during this production test.  
**Expected behavior:** If OCI live WebSocket is available, source reads `OCI live`; otherwise fallback copy is explicit.  
**Actual behavior:** This test validated OCI replay fallback, not a true live WebSocket session. The copy is now consistent, but true OCI-live behavior remains unvalidated until a real live-backed session is available.

## Regression Routes

### Finding V5-REG-01

**Status:** pass  
**Severity:** P2  
**Reproduction steps:** Open `/learn/`, `/learn/aero`, `/replay/`, and `/sessions/`.  
**Expected behavior:** Learn/replay pages render, and deprecated `/sessions/` redirects to canonical `/replay/`.  
**Actual behavior:** `/learn/`, `/learn/aero`, and `/replay/` rendered content. `/sessions/` redirected to `https://playful-peony-77899c.netlify.app/replay/`.  
**Screenshot:** `output/playwright/qa-v5/sessions-redirect.png`

### Finding V5-REG-02

**Status:** warn  
**Severity:** P2  
**Reproduction steps:** Open `/learn/aero` during the regression pass.  
**Expected behavior:** Page renders without console errors.  
**Actual behavior:** Page rendered content, but console captured `TypeError: Failed to fetch` from a Next static chunk. The failing request was not identified in this run and should be investigated before treating `/learn/aero` as clean.  
**Console evidence:** `output/playwright/qa-v5/qa-v5-results.json`

## Scorecard vs v4

| Prior issue | v5 result | Status |
| --- | --- | --- |
| FIA 2026 GLB never loads | GLB loaded; loading badge cleared in 9.119s. | Fixed |
| SVG ART exposes developer CLI command | Fallback copy is clean; no internal commands or paths exposed. SVG asset still missing. | Partially fixed |
| DRS toggle has no effect | DRS changes geometry, estimates, and raw Drag by `-6.92%`. | Fixed |
| YAW slider/control weakness | Labels update and Cy sign changes from `-0.36` to `0.36`. | Fixed |
| Constructor DRAG/LIFT identical across cars | Not re-tested across constructors in v5; FIA raw Drag now responds to DRS/yaw. | Not revalidated |
| Solver FPS/warm-up issue | Procedural and Airfoil held 60 FPS; warming overlay cleared. | Fixed on tested route |
| Loading bar never dismisses after 3D renders | Loading badge absent after GLB loaded. | Fixed |
| AUS GP partial replay behavior | Auto-loaded full race without manual click. | Fixed |
| Race Control log behavior | OCI replay fallback advanced beyond start event. | Fixed for fallback |
| Sessions deprecated page behavior | `/sessions/` redirects to `/replay/`. | Fixed |
| Missing FIA SVG art | SVG data still missing, but fallback is safe. | Still open |
| Noisy GLB hull | GLB hull still works but remains visually noisy. | Still open |
| Probe `d -` | Hover sample returned distance `0.9%`. | Fixed in sampled area |

## Credibility Assessment

**Status:** warn  
**Severity:** P2

The airflow feature is credible as an educational control-driven visualizer. It is not credible as quantitative CFD. The UI now labels Cd/Cl/Cy as estimates, which is appropriate. DRS, yaw, airfoil AoA, and wind rake produce visible and numeric responses. Remaining fake-feeling areas are GLB hull noise, particle density that can read as decorative streaks, raw Lift staying near zero, and rolling-road/wheel toggles having little measurable force effect.

## Release Decision

**Decision:** v5 production passes the blocker benchmark and is acceptable for another evaluation pass.

Do not describe the solver as validated CFD. Keep the wording educational and estimate-based.

## Prioritized Next Fixes

1. Investigate the `/learn/aero` `TypeError: Failed to fetch` console error.
2. Add FIA 2026 SVG art or disable `SVG art` when no curated silhouette exists.
3. Improve GLB hull extraction quality for FIA 2026.
4. Make rolling-road and wheel effects more legible in the solver/readouts.
5. Add a convergence/settled indicator for raw solver values.
6. Validate true OCI-live WebSocket mode during a real live-backed session.
7. Reduce visual particle slab density with vector, pressure, or vorticity overlays.
