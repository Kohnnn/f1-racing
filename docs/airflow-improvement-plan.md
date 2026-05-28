# Airflow Improvement Plan and Progress

## Context

The QA report flagged the wind tunnel as functional but not credible enough: DRS did not affect geometry or drag, yaw did not materially enter the solver, public fallback text exposed build commands, and the visual output felt weak. The follow-up direction was to prioritize the existing wind tunnel panel, add an airfoil function inside that panel, and balance model accuracy with dynamic visualization.

## Goals

- Keep airflow work inside the existing Modelview wind tunnel panel.
- Add an `Airfoil` mode as a solver-validation shape, not a separate page.
- Make major controls alter the obstacle or inlet field instead of only labels.
- Keep coefficients clearly illustrative while making the visual response physically plausible.
- Remove public-facing developer/build instructions.

## Implemented In This Pass

### Airfoil Mode

- Added `Airfoil` as a fourth silhouette mode next to `Procedural`, `SVG art`, and `GLB hull`.
- Added a NACA 2412-inspired airfoil builder with an angle-of-attack control.
- The airfoil uses the same canvas renderer, particle field, pressure tint, and worker solver as the F1 car outline.
- The panel now exposes `Airfoil AoA` only while Airfoil mode is active.

### DRS Geometry Response

- Procedural F1 silhouette now accepts `drsOpen`.
- DRS flattens/trims the rear-wing section in the actual polygon sent to the mask builder.
- This forces a solver restart through a new mask when DRS changes.
- Estimated `Cd` and `Cl` now reflect a plausible DRS reduction instead of staying identical.

### Constructor-Specific Aero Profiles

- Added a small constructor profile map in the wind tunnel component.
- Profiles tune rear-wing height, nose height, estimated `Cd`, and estimated `Cl` for available constructors.
- This prevents every constructor from using exactly the same procedural shape and coefficient baseline.

### Solver Boundary Inputs

- Fixed solver/display grid mismatch: worker now uses `320 x 144`, matching the canvas mask dimensions.
- Yaw now enters the worker inlet profile as a crossflow velocity component.
- Rolling road now changes the lower boundary condition.
- Rotating wheels add localized swirl/wake injection around the canonical wheel positions.
- The worker validates incoming masks and resets velocity/pressure when the mask changes.

### Wind Placement

- Added `Wind rake` control to move the inlet concentration vertically.
- Clicking the canvas also places the wind rake at that height.
- The renderer draws the wind-rake line and handle directly on the stage.
- Particle spawning now clusters around the selected rake height so users can probe front wing, floor, cockpit, rear wing, or airfoil sections intentionally.

### Readouts and UX

- Added `Cd`, `Cl`, `Cy`, drag delta, and lift delta readouts alongside existing solver force, Reynolds, and FPS values.
- Added a stage hint: click canvas to place wind rake and hover to probe local flow.
- Updated copy to state that controls alter the obstacle and inlet field while coefficients remain illustrative.
- Replaced missing SVG/GLB silhouette fallback copy with user-facing guidance.
- Replaced the missing exploded-view message that exposed an internal command.

## Remaining Work

### Accuracy Improvements

- Calibrate procedural `Cd`/`Cl` estimates against known F1-order magnitudes and chosen reference area.
- Replace simple constructor profile constants with exported per-model aero metadata.
- Add side-force history and yaw sweep mode to show `Cy` response over time.
- Add a convergence score based on recent force variance instead of only FPS/live state.

### Visualization Improvements

- Add a vector field overlay toggle.
- Add separation/wake markers derived from vorticity thresholds.
- Improve pressure scaling stability so colors do not jump during warm-up.
- Add a high/medium/low quality preset that controls particles, solver transfer cadence, and pressure iterations.

### Solver Improvements

- Move from simple wheel wake injection to wheel boundary rotation tied to actual wheel mask positions.
- Add a stronger reset/reconvergence path for yaw and wind-rake changes.
- Consider reducing worker frame payload frequency while maintaining solver tick frequency.

### Model Viewer Follow-Up

- Add explicit `loading`, `ready`, `error`, and `timeout` states to the main Modelview GLB loader.
- Validate the FIA 2026 GLB load path in local and deployed builds.
- Add retry and poster fallback when a GLB fails.

## Verification Checklist

- Build succeeds with `npm run next:build -w @f1-racing/web`.
- `/cars/current-spec/?season=2026&constructor=fia-2026&focus=front-wing` renders the panel.
- Switching to `Airfoil` shows the airfoil and `Airfoil AoA` slider.
- Changing AoA changes the airfoil shape and `Cl` estimate.
- Toggling DRS in Procedural mode visibly changes rear-wing geometry and coefficient estimates.
- Changing yaw changes wake angle and `Cy` estimate.
- Moving `Wind rake` or clicking the canvas moves the inlet marker and particle spawn band.
- `SVG art`/`GLB hull` missing states do not expose build commands.
