# F1 Racing App — QA Evaluation Report v4

**Production URL:** https://playful-peony-77899c.netlify.app  
**Primary route:** https://playful-peony-77899c.netlify.app/cars/current-spec/?season=2026&constructor=fia-2026&focus=front-wing  
**Recent shipped commit:** `8318c0c feat(wind-tunnel): improve airflow controls`  
**Test date:** 2026-05-29, Asia/Saigon  
**Tester:** QA AI via Playwright browser automation  
**Browser:** Chromium 148.0.7778.96, headless, viewport 1440 x 1150, deviceScaleFactor 1  
**Evidence bundle:** `output/playwright/qa-v4/qa-v4-results.json` plus screenshots in `output/playwright/qa-v4/`  
**Post-fix local evidence:** `output/playwright/qa-v4-ship/qa-v4-ship-results.json` plus screenshots in `output/playwright/qa-v4-ship/`
**Post-deploy production benchmark:** `output/playwright/qa-v4-deploy-benchmark-final/qa-v4-deploy-benchmark-final-results.json` plus screenshots in `output/playwright/qa-v4-deploy-benchmark-final/`

## Executive Summary

The airflow improvement commit is a real improvement over v2/v3. Airfoil mode exists inside the Modelview wind tunnel, AoA changes the visible airfoil and the Cl estimate, yaw now changes the rake angle and Cy sign, DRS visibly changes rear-wing geometry in Procedural mode, and the public SVG/GLB missing-profile fallback no longer exposes CLI/build commands.

The live v4 deployment gaps are important:

- The FIA 2026 GLB now renders, but the Modelview loading badge remains visible over the rendered model.
- SVG art mode is still missing for FIA 2026 and falls back. The copy is clean, but the mode is not functional for the primary constructor.
- DRS changes the procedural geometry and estimated Cd/Cl, but the raw worker Drag/Lift values settle back to nearly the same values. Treat the Cd/Cl changes as illustrative, not CFD-derived.
- Constructor Cd/Cl estimates now differ by constructor, but raw Drag/Lift values remain effectively identical.
- GLB hull works after settling, but the outline is jagged/noisy and feels like an exported edge artifact, not a polished educational silhouette.
- AUS replay partial-load behavior, Race Control log behavior, and `/sessions/` deprecated duplicate behavior remain open.

The local ship patch fixes the release blockers found here: the Modelview badge clears, DRS changes raw Drag by about `-5.91%`, AUS replay auto-loads to full duration, Live Race Control advances past `SESSION STARTED`, and `/sessions/` redirects to `/replay/`.

Post-deploy benchmark after follow-up commit `cd1d6a0` passes the blocking checks on production: FIA 2026 model load badge clears, DRS raw Drag changes `1.586 -> 1.467` (`-7.50%`), AUS replay reaches `Loaded 1:46:08 / 1:46:08` without manual load, `/live/` reports `OCI replay fallback` and advances Race Control to `T+416s`, `/sessions/` redirects to `/replay/`, and OCI health returns `200`.

## Console And Network Evidence

- Page errors: none.
- Modelview network:
  - `200` https://playful-peony-77899c.netlify.app/models/2026/fia-spec/fia-2026.glb
  - `200` https://playful-peony-77899c.netlify.app/data/wind-profiles/fia-2026.json
  - `404` https://playful-peony-77899c.netlify.app/data/silhouettes/fia-2026.json
- Console warnings/errors:
  - WebGL performance warnings: `GPU stall due to ReadPixels`.
  - Canvas warning from QA sampling: `Multiple readback operations using getImageData...`.
  - Resource error for the missing silhouette JSON, matching the `404` above.
- OCI/API:
  - `GET https://f1-api.129.150.58.64.sslip.io/health` returned `200`, body `{"ok":true,"service":"f1-racing-api"}`.
  - `/live/` requested `https://f1-api.129.150.58.64.sslip.io/api/live/status` with `200`.
  - AUS replay requested OCI chunk endpoints `/api/replay/2025/australian-grand-prix/race/chunk/0`, `/chunk/1`, `/chunk/2` with `200`.

## 1. Modelview Page Load

### Finding MV-01

**Status:** warn  
**Severity:** P1  
**Reproduction steps:** Open the primary route and wait 22 seconds.  
**Expected behavior:** Page loads, wind tunnel is visible, and the FIA 2026 model either reaches a clean loaded state or shows a clear error.  
**Actual behavior:** Page loads and the wind tunnel is visible. The FIA 2026 GLB renders visually and `model-viewer.loaded` is `true`, but `.car-viewer-loading` remains in DOM and visible with `Loading FIA 2026 concept car · ~3.7 MB`.  
**Screenshot:** `output/playwright/qa-v4/modelview-primary-top.png`, `output/playwright/qa-v4/modelview-loading-bar-stuck.png`  
**Console/network evidence:** GLB request returned `200`; no page error. WebGL emitted performance warnings.

### Finding MV-02

**Status:** pass  
**Severity:** P3  
**Reproduction steps:** Open the primary route and scroll to the wind tunnel.  
**Expected behavior:** The wind tunnel panel is visible inside the existing Modelview page.  
**Actual behavior:** The panel is present on the Modelview page, under the model controls, titled `Wind tunnel · 2D Navier-Stokes`.  
**Screenshot:** `output/playwright/qa-v4/modelview-wind-tunnel-initial.png`

## 2. Wind Tunnel Mode Switcher

### Finding WT-01

**Status:** pass  
**Severity:** P3  
**Reproduction steps:** Inspect the silhouette mode switcher. Click `Procedural`, `Airfoil`, `SVG art`, and `GLB hull`.  
**Expected behavior:** Four modes are visible and active state/label update correctly.  
**Actual behavior:** All four modes are visible. `aria-selected` and active styling update on each click. The label updates to `Silhouette: Procedural`, `Airfoil`, `-`, and `GLB`.  
**Screenshots:** `output/playwright/qa-v4/mode-procedural.png`, `output/playwright/qa-v4/mode-airfoil.png`, `output/playwright/qa-v4/mode-svg-art.png`, `output/playwright/qa-v4/mode-glb-hull-settled-12s.png`

### Finding WT-02

**Status:** warn  
**Severity:** P2  
**Reproduction steps:** Click `SVG art` on the primary FIA 2026 route.  
**Expected behavior:** SVG art mode renders a constructor-specific silhouette or shows user-facing fallback copy.  
**Actual behavior:** SVG art is not available for FIA 2026. The fallback is user-facing and does not expose `build-wind-profiles`, `pipeline/export`, `node` commands, or filesystem paths.  
**Screenshot:** `output/playwright/qa-v4/mode-svg-art.png`  
**Evidence:** Fallback text: `Silhouette not available for this constructor yet. Switch to Procedural or Airfoil mode for the live solver while this constructor-specific outline is prepared.`

### Finding WT-03

**Status:** warn  
**Severity:** P2  
**Reproduction steps:** Click `GLB hull` and wait 12 seconds.  
**Expected behavior:** GLB hull mode should render a usable hull silhouette and clear solver warm-up.  
**Actual behavior:** The solver becomes live after settling and FPS reads about 51-52, but the hull outline is very jagged/noisy, with wavy exported edges and rough front detail. It is functional, but it looks artifact-like and weak as an educational silhouette.  
**Screenshot:** `output/playwright/qa-v4/mode-glb-hull-settled-12s.png`

### Finding WT-04

**Status:** pass  
**Severity:** P3  
**Reproduction steps:** Simulate a missing wind-profile JSON request with a Playwright `404`, then click `SVG art` and `GLB hull`.  
**Expected behavior:** Missing SVG/GLB data fallback should not expose CLI commands or local paths.  
**Actual behavior:** Both missing-data fallbacks show the same user-facing message and no build commands or filesystem paths.  
**Screenshots:** `output/playwright/qa-v4/fallback-svg-missing-profile.png`, `output/playwright/qa-v4/fallback-glb-missing-profile.png`

## 3. Airfoil Mode

### Finding AF-01

**Status:** pass  
**Severity:** P2  
**Reproduction steps:** Click `Airfoil`. Move `Airfoil AoA` from negative to positive.  
**Expected behavior:** Airfoil AoA slider appears, visible airfoil shape changes, and Cl estimate changes direction plausibly.  
**Actual behavior:** `Airfoil AoA` appears in Airfoil mode. At negative AoA the airfoil tilts one way; at positive AoA it visibly reverses. Pixel sample diff between negative and positive screenshots was 14.84, and the visual change is obvious.  
**Screenshots:** `output/playwright/qa-v4/airfoil-aoa-negative.png`, `output/playwright/qa-v4/airfoil-aoa-positive.png`

### Finding AF-02

**Status:** pass  
**Severity:** P2  
**Reproduction steps:** Set AoA negative, zero, and positive; observe readouts.  
**Expected behavior:** Cl should change sign/direction with AoA; Cd should remain positive and change modestly.  
**Actual behavior:** Cl estimate changed from `-1.44` at negative AoA to `+1.44` at positive AoA. Repeated changes showed Cd positive, roughly `0.08` at 0 deg and about `0.18-0.25` at larger AoA values.  
**Screenshot:** `output/playwright/qa-v4/airfoil-aoa-positive.png`  
**Note:** The coefficient readouts are illustrative. Raw worker Lift did not align cleanly with the displayed Cl sign, so this should not be presented as quantitative CFD.

### Finding AF-03

**Status:** pass  
**Severity:** P3  
**Reproduction steps:** Stay in Airfoil mode and inspect controls. Repeatedly change AoA.  
**Expected behavior:** DRS should be hidden/irrelevant in Airfoil mode and solver should not crash.  
**Actual behavior:** `DRS open` is not shown in Airfoil mode. Repeated AoA changes from negative to positive kept the solver live at 60 FPS with no page errors.  
**Screenshot:** `output/playwright/qa-v4/airfoil-aoa-negative.png`

## 4. Procedural Mode And DRS

### Finding DRS-01

**Status:** pass  
**Severity:** P1  
**Reproduction steps:** Return to `Procedural`, toggle `DRS open` off/on.  
**Expected behavior:** Rear wing geometry visibly changes and Cd/Cl estimates change.  
**Actual behavior:** Rear wing geometry visibly changes. Cd estimate changed from `0.76` closed to `0.68` open. Cl estimate changed from `-2.12` closed to `-1.95` open.  
**Screenshots:** `output/playwright/qa-v4/procedural-drs-closed.png`, `output/playwright/qa-v4/procedural-drs-open.png`

### Finding DRS-02

**Status:** warn  
**Severity:** P1  
**Reproduction steps:** Toggle DRS and wait for the solver to settle. Compare raw solver Drag/Lift.  
**Expected behavior:** Raw Drag/Lift should change after the geometry/mask changes.  
**Actual behavior:** The immediate solver values reset, then settled back to nearly the same values: closed `Drag 0.05 / Lift 0.03`, open `Drag 0.05 / Lift 0.03`. The visual/estimated coefficients change, but raw worker forces do not meaningfully validate that DRS has changed the flow result.  
**Screenshots:** `output/playwright/qa-v4/procedural-drs-closed.png`, `output/playwright/qa-v4/procedural-drs-open.png`

## 5. Yaw Behavior

### Finding YAW-01

**Status:** pass  
**Severity:** P1  
**Reproduction steps:** Move yaw from `-15` to `0` to `+15`.  
**Expected behavior:** Wind rake angle and streamlines/wake should respond. Cy should change sign.  
**Actual behavior:** Rake line angle and streaklines visibly changed. Cy changed from `-0.36` at `-15 deg` to `0.00` at `0 deg` to `+0.36` at `+15 deg`. Cd also rose from `0.76` at 0 deg to `0.81` at +/-15 deg. No stuck UI labels observed.  
**Screenshots:** `output/playwright/qa-v4/yaw-minus-15-rerun.png`, `output/playwright/qa-v4/yaw-zero.png`, `output/playwright/qa-v4/yaw-plus-15-rerun.png`

### Finding YAW-02

**Status:** warn  
**Severity:** P2  
**Reproduction steps:** Observe yaw-driven flow.  
**Expected behavior:** Flow should look educationally credible, not just decorative.  
**Actual behavior:** The rake and particle band do rotate convincingly, but the visualization is still dominated by a dense white particle slab. It communicates direction, but not much about separation, pressure recovery, or wake structure. Add vector/vorticity/separation overlays before calling this CFD-like.  
**Screenshot:** `output/playwright/qa-v4/yaw-plus-15-rerun.png`

## 6. Wind Placement And Wind Rake

### Finding WR-01

**Status:** pass  
**Severity:** P2  
**Reproduction steps:** Move `Wind rake` low and high, then click the canvas at upper/lower vertical positions.  
**Expected behavior:** Rake marker and particle spawn band should follow the selected height.  
**Actual behavior:** Slider and canvas clicks update the marker. Slider landed at about `15%` and `88%`; canvas clicks set about `28%` and `74%`. Particle spawn band follows the marker.  
**Screenshots:** `output/playwright/qa-v4/wind-rake-low.png`, `output/playwright/qa-v4/wind-rake-high.png`, `output/playwright/qa-v4/wind-rake-click-upper.png`, `output/playwright/qa-v4/wind-rake-click-lower.png`

### Finding WR-02

**Status:** warn  
**Severity:** P3  
**Reproduction steps:** Hover over the canvas inside and outside the body.  
**Expected behavior:** Probe should show U, Cp, vorticity, and distance/inside-body status.  
**Actual behavior:** Probe appears and shows `U`, `Cp`, Greek `ω`, and either `inside body` or `d`. Inside-body status works. Outside-body distance sometimes shows `d -` rather than a numeric distance, so the distance readout is incomplete.  
**Screenshots:** `output/playwright/qa-v4/wind-probe-hover.png`, `output/playwright/qa-v4/wind-probe-hover-outside.png`

## 7. Rolling Road And Wheels

### Finding RW-01

**Status:** warn  
**Severity:** P2  
**Reproduction steps:** Toggle `Rolling road` and `Wheels rotating` off and on.  
**Expected behavior:** Visual road/wheel behavior should change and solver should remain stable.  
**Actual behavior:** The UI toggles work and no runtime errors occur. Visual changes are present but subtle. Readouts barely changed: off `Drag 0.05 / Lift 0.03`, on `Drag 0.04 / Lift 0.03`. The feature is stable, but the educational impact is weak unless the wheel/road flow effect is made easier to see.  
**Screenshots:** `output/playwright/qa-v4/rolling-wheels-off.png`, `output/playwright/qa-v4/rolling-wheels-on.png`

## 8. Performance

### Finding PERF-01

**Status:** pass  
**Severity:** P2  
**Reproduction steps:** Observe FPS during Procedural, Airfoil, DRS change, and GLB hull. Drag sliders repeatedly.  
**Expected behavior:** Interface remains usable, no long 1 FPS warm-up, no worker errors.  
**Actual behavior:** Headless Chromium stayed usable. Procedural initial after page settle: 58-60 FPS. Airfoil after repeated AoA changes: 60 FPS. Procedural after DRS: 55-60 FPS. GLB hull after 12 seconds: about 51-52 FPS. No page errors or worker crashes observed.  
**Screenshots:** `output/playwright/qa-v4/modelview-wind-tunnel-initial.png`, `output/playwright/qa-v4/mode-glb-hull-settled-12s.png`  
**Caution:** Headless desktop FPS is not a substitute for mid-range laptop/mobile profiling.

## 9. Regression Checks

### Finding REG-01

**Status:** pass  
**Severity:** P3  
**Reproduction steps:** Open `/learn/` and `/learn/aero`.  
**Expected behavior:** Learn pages render; embedded 3D loads or fails gracefully.  
**Actual behavior:** `/learn/` renders module cards. `/learn/aero` renders the McLaren MCL39 `model-viewer`; after 16 seconds, no loading/error overlay remained. WebGL emitted performance warnings only.  
**Screenshots:** `output/playwright/qa-v4/regression-learn.png`, `output/playwright/qa-v4/regression-learn-aero.png`

### Finding REG-02

**Status:** pass  
**Severity:** P3  
**Reproduction steps:** Open `/replay/`.  
**Expected behavior:** Replay library renders.  
**Actual behavior:** Replay library renders with `34 grand prix`, search/sort controls, CTAs, and session cards.  
**Screenshot:** `output/playwright/qa-v4/regression-replay.png`

### Finding REG-03

**Status:** warn  
**Severity:** P1  
**Reproduction steps:** Open `/replay/2025/australian-grand-prix/race/`.  
**Expected behavior:** Prior AUS partial replay behavior should be resolved or clearly explained.  
**Actual behavior:** AUS still defaults to partial load: `Loaded 47:52 / 1:46:08`, `LOAD FULL RACE` remains required, and only three driver rows/markers are present initially (`VER`, `NOR`, `BOR`). OCI chunk requests return `200`, but the initial UX remains partial.  
**Screenshot:** `output/playwright/qa-v4/regression-aus-replay.png`

### Finding REG-04

**Status:** warn  
**Severity:** P2  
**Reproduction steps:** Open `/live/` and wait 12 seconds.  
**Expected behavior:** Live page renders and Race Control behaves like a log.  
**Actual behavior:** Live page renders and hits OCI `/api/live/status` with `200`. The UI says `Live OCI feed · speed 8.0x`, but the feed card says `Simulated Replay`. Race Control still shows only one message, `T+0s · Lap 1 · SESSION STARTED`, after the clock reaches 1:20.  
**Screenshot:** `output/playwright/qa-v4/regression-live-race-control.png`

### Finding REG-05

**Status:** warn  
**Severity:** P3  
**Reproduction steps:** Open `/sessions/`.  
**Expected behavior:** Deprecated Sessions route should redirect or clearly resolve to the canonical Replay page.  
**Actual behavior:** `/sessions/` renders duplicate Discover/Replay content with a note that Sessions has been folded into Discover and Replay. It remains a separate route and the nav still exposes `SESSIONS`.  
**Screenshot:** `output/playwright/qa-v4/regression-sessions.png`

## 10. Production API / OCI Check

### Finding API-01

**Status:** pass  
**Severity:** P2  
**Reproduction steps:** Fetch `https://f1-api.129.150.58.64.sslip.io/health`.  
**Expected behavior:** API responds with healthy status.  
**Actual behavior:** Response `200`, body `{"ok":true,"service":"f1-racing-api"}`.  
**Evidence:** `output/playwright/qa-v4/qa-v4-results.json`

### Finding API-02

**Status:** warn  
**Severity:** P2  
**Reproduction steps:** Open `/live/` and inspect network/text.  
**Expected behavior:** Live page should clearly state whether it uses OCI live data or simulator fallback.  
**Actual behavior:** Network confirms OCI status request succeeds. UI copy is mixed: top copy says `Live OCI feed`, but feed source says `Simulated Replay`. This is probably a replay-backed simulator with OCI status, but the user-facing state is ambiguous.  
**Screenshot:** `output/playwright/qa-v4/regression-live-race-control.png`

## v2/v3 Known Issue Scorecard vs v4

| Prior issue | v4 result | Status |
| --- | --- | --- |
| FIA 2026 GLB never loads | GLB request returns `200`, model renders, `model-viewer.loaded` is `true`. Loading badge remains visible. | Partially fixed |
| SVG ART exposes developer CLI command | SVG missing fallback is clean user-facing copy; no `build-wind-profiles`, `pipeline/export`, `node`, or paths visible. | Fixed |
| DRS toggle has no effect | DRS now changes rear-wing geometry and estimated Cd/Cl. Raw solver Drag/Lift still settle nearly unchanged. | Partially fixed |
| YAW slider/control weakness | Yaw changes rake angle, streamlines, and Cy sign from -0.36 to +0.36. | Fixed |
| Constructor DRAG/LIFT identical across cars | Cd/Cl estimates differ: FIA `0.76/-2.12`, Red Bull `0.83/-2.85`, McLaren `0.82/-2.78`. Raw Drag/Lift still about `0.05/0.03` for all. | Partially fixed |
| Solver FPS/warm-up issue | Procedural/Airfoil stay around 55-60 FPS in headless; GLB hull settles around 51-52 FPS after 12s. | Mostly fixed |
| Loading bar never dismisses after 3D renders | Still visible for FIA 2026 after render. | Still open |
| AUS GP partial replay behavior | Still partial by default with `Loaded 47:52 / 1:46:08`, `LOAD FULL RACE`, and three initial cars. | Still open |
| Race Control log behavior | Live still shows only `SESSION STARTED` after clock advances; not a useful live log. | Still open |
| Sessions deprecated page behavior | `/sessions/` still renders duplicate Replay content instead of redirecting. | Still open |

## Credibility / AI-Slop Assessment

**Status:** warn  
**Severity:** P1

The airflow panel is no longer just decorative: major controls now visibly alter the geometry or inlet field, and the readouts respond. However, it still has fake-feeling edges:

- The particle rendering often becomes a dense white slab, especially in Airfoil and yaw tests.
- Cd/Cl/Cy are clearly illustrative estimates, not validated solver outputs.
- Raw Drag/Lift values are tiny and often unchanged after coefficient-changing controls.
- GLB hull mode looks like a noisy extraction artifact.
- Probe `d -` outside-body readout weakens trust.

This is good enough for an educational visualizer if labeled honestly. It is not credible as CFD or as a quantitative aero tool.

## Ship Recommendation

**Decision:** do not ship `8318c0c` as-is. The airflow commit is a meaningful improvement, but the live v4 deployment found release-blocking behavior in the primary modelview path, DRS/raw-force credibility, AUS replay loading, and Live Race Control/source status.

**Post-fix local validation:** the blocker fixes pass against a local production build served from `apps/web/out` at `http://127.0.0.1:4173`. Run command evidence: `npm run build -w @f1-racing/web` passed, followed by `npm run next:build -w @f1-racing/web` after the replay-state patch.

**Production release decision:** ship the follow-up production deployment, not `8318c0c` alone. The deployed production build at `https://playful-peony-77899c.netlify.app` from commit `cd1d6a0` passed the post-deploy blocker benchmark on 2026-05-29. Unique deploy URL: `https://6a190884c67d609bff6b4459--playful-peony-77899c.netlify.app`.

Keep the wind tunnel framed as an educational visualizer with illustrative coefficients, not quantitative CFD.

| Finding | Owner area | Required fix | Acceptance check | Post-fix local result | Evidence |
| --- | --- | --- | --- | --- | --- |
| MV-01 | Modelview | Clear the custom loading badge when the `model-viewer` element fires `load` or reports `loaded === true`; show a user-facing timeout/error state only when the GLB never resolves. | FIA 2026 GLB renders and `.car-viewer-loading` is absent within 22 seconds. | Pass: `model-viewer.loaded === true`, GLB `200`, visible loading overlays `0`. | `output/playwright/qa-v4-ship/modelview-primary-after-fix.png`; `qa-v4-ship-results.json` |
| DRS-02 | Wind tunnel solver | Make raw Drag/Lift respond to procedural mask changes by integrating exposed pressure faces and wake deficit; keep Cd/Cl labelled as estimates. | DRS open visibly changes rear wing, Cd/Cl estimates change, and settled raw Drag changes by at least 5% in the expected direction. | Pass: raw Drag changed from `1.488` closed to `1.400` open (`-5.91%`); Cd est `0.76 -> 0.68`; Cl est `-2.12 -> -1.95`. | `output/playwright/qa-v4-ship/procedural-drs-closed-after-fix.png`; `procedural-drs-open-after-fix.png` |
| REG-03 | Replay loading | Auto-load all race chunks in the background while retaining chunked transport and clear progress UI. | AUS replay reaches `Loaded total / total` without pressing `Load full race`; no stalled partial default. | Pass: AUS replay reached `Loaded 1:46:08 / 1:46:08`; `Load full race` button hidden; all 7 chunks returned `200`. | `output/playwright/qa-v4-ship/replay-aus-after-fix.png`; `qa-v4-ship-results.json` |
| REG-04 / API-02 | Live page | Normalize Race Control timestamps, load static Race Control data for replay fallback, and make source copy unambiguous. | `/live/` shows more than `SESSION STARTED` once the clock passes the next event; source reads `OCI live`, `OCI replay fallback`, or `Local replay simulator` consistently. | Pass locally: source `Local replay simulator`; Race Control showed 2 messages, including `T+99s · Lap 2 · DRS ENABLED`. OCI health returned `200`. | `output/playwright/qa-v4-ship/live-after-fix.png`; `qa-v4-ship-results.json` |

## Production Post-deploy Benchmark

**Status:** pass for release blockers
**Production URL:** `https://playful-peony-77899c.netlify.app`
**Unique deploy URL:** `https://6a190884c67d609bff6b4459--playful-peony-77899c.netlify.app`
**Commit:** `cd1d6a0 fix(wind): strengthen DRS raw drag response`
**Evidence:** `output/playwright/qa-v4-deploy-benchmark-final/qa-v4-deploy-benchmark-final-results.json`

| Check | Production result | Evidence |
| --- | --- | --- |
| OCI health | `200`, body `{"ok":true,"service":"f1-racing-api"}`. | benchmark JSON |
| Modelview | FIA 2026 model loaded in `14.5s`; visible `.car-viewer-loading` count `0`; wind tunnel visible. | `modelview-production-final.png` |
| Procedural DRS | Raw Drag `1.586 -> 1.467` (`-7.50%`), Cd est `0.76 -> 0.68`, Cl est `-2.12 -> -1.95`, FPS `60`. | `drs-closed-production-final.png`, `drs-open-production-final.png` |
| AUS replay | Auto-loaded to `Loaded 1:46:08 / 1:46:08`; `Load full race` hidden; all 7 chunks returned `200`. | `aus-replay-production-final.png` |
| Live | Feed source `OCI replay fallback`; Race Control advanced beyond start to `T+416s · Lap 1 · GREEN LIGHT - PIT EXIT OPEN`. | `live-production-final.png` |
| Regression routes | `/learn/`, `/learn/aero`, and `/replay/` render; `/sessions/` redirects to `/replay/`. | `sessions-redirect-production-final.png` |

Console/network residuals: one WebGL `ReadPixels` performance warning and one transient `TypeError: Failed to fetch` console error were captured during the benchmark. They did not block the user-visible flows above, but should remain visible in the next evaluation report.

## Post-fix Validation Checklist

- Modelview: primary FIA 2026 route loads, wind tunnel visible, GLB renders, loading badge clears, no page errors. **Local status: pass.**
- Wind tunnel modes: Procedural, Airfoil, SVG art, and GLB hull still switch correctly; missing SVG/GLB fallbacks remain user-facing and do not expose build commands or paths.
- Airfoil: AoA slider still appears only in Airfoil mode, shape and Cl estimate change direction with AoA, Cd estimate remains positive, repeated changes do not crash the worker.
- Procedural DRS: rear wing changes visibly, Cd/Cl estimates change, raw Drag changes after settling, solver warm-up clears. **Local status: pass.**
- Yaw/rake/probe: yaw changes rake angle and Cy sign; wind rake slider/canvas click move the marker; probe shows U, Cp, vorticity, and a valid distance or inside-body state.
- Replay: AUS race auto-loads to full duration, controls stay usable, and Race Control markers use normalized seconds. **Local status: pass.**
- Live: OCI health check passes, `/live/` renders, feed source copy is consistent, Race Control log updates beyond the initial session-start message. **Production status: pass via OCI replay fallback.**
- Regression: `/learn/`, `/learn/aero`, `/replay/`, and `/sessions/` render or redirect intentionally; `/sessions/` no longer appears as a duplicate nav destination. **Local status: pass; `/sessions/` redirects to `/replay/`.**
- Performance: Procedural and Airfoil remain usable while dragging sliders; no worker crashes, 1 FPS stalls, or persistent warm-up overlays.

## Remaining Prioritized Next Fixes

1. Improve FIA 2026 SVG art coverage or hide/disable SVG mode when no SVG silhouette exists.
2. Clean up GLB hull extraction for FIA 2026 so it reads as a car silhouette, not a noisy contour.
3. Add a convergence/validity indicator so users know when raw solver values have settled.
4. Make wind visualization less like a white particle band: add vector field, vorticity, separation, or pressure isoline overlays.
5. Fix probe distance outside-body (`d -`) and label `ω` as vorticity for users.
6. Investigate the transient production `TypeError: Failed to fetch` captured in the post-deploy benchmark.
7. Verify true OCI-live WebSocket mode during an actual live-backed session; this benchmark validated OCI replay fallback.
