# flow-2p5d pipeline

This folder is the authoring home for the projected-flow compare system.

Purpose:

- document how source `GLB` files become derived compare assets
- keep templates for per-car metadata
- add future validation or export scripts without mixing them into the OpenFOAM pipeline

Recommended future additions:

- `export-top-mask.py` or Blender automation
- `build-car-registry.mjs`
- `check-flow-assets.mjs`

Current rule:

- treat `GLB` as source of truth for presentation
- treat masks and previews as derived files
- keep registry ids stable once published
