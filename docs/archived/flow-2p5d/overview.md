# 2.5D projected-flow overview

## Goal

Build a blog-quality aero compare surface that pairs:

- a real `GLB` car viewer for identity and presentation
- a derived `top-view` obstacle mask for computation
- a shared `2D` flow solver for fair cross-era comparison

This is intentionally not full CFD. It is a repeatable projected-flow explainer.

## Product rule

Use one standard simulation setup for every car:

- top-view only for `v1`
- same car-length normalization
- same inflow direction
- same grid resolution preset
- same color scale and metric definitions

Comparisons are only meaningful when the setup stays fixed.

## Recommended public architecture

- `GLB` rendered in the car viewer
- `top-mask.png` loaded into the flow engine
- shared solver computes velocity, wake, and drag-proxy fields
- UI presents relative metrics, not CFD coefficients

## Per-car assets

Each car should eventually have:

- one source display model
- one derived top mask
- one derived preview image
- one metadata file or registry entry

Source versus derived split:

- source: `GLB`
- derived: `top-mask.png`, `preview.png`, optional side mask later

## Fair-comparison defaults

- one `top-view` obstacle mask per car
- same simulation domain padding
- same flow speed preset options
- same metric formulas:
  - `wakeWidth`
  - `wakeLength`
  - `wakeArea`
  - `dragProxy`

## What can be published

Safe claims:

- projected wake comparison
- relative drag proxy
- relative wake recovery
- qualitative planform-flow behavior

Avoid:

- real `Cd`
- real downforce
- race-team-grade CFD claims

## File layout

- `data/flow/car-registry.json` - canonical car manifest for the projected-flow system
- `pipeline/flow-2p5d/` - authoring notes and templates for generating derived assets
- `apps/web/public/assets/cars/` - served static assets for masks and previews
- `apps/web/src/lib/flow/` - app-side contracts and defaults

## Ref

- https://github.com/theOehrly/Fast-F1
- https://github.com/br-g/openf1
- https://github.com/IAmTomShaw/f1-race-replay
- https://github.com/adn8naiagent/F1ReplayTiming