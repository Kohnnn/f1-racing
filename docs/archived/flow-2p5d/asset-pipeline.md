# 2.5D asset pipeline

## Short answer

No, you do not need to manually create every per-car asset forever.

You do need one source model per car. The derived assets can be generated with a repeatable authoring workflow.

## Asset contract

For each car, split assets into two categories.

### Required source asset

- `GLB` display model

This is the only asset that should be considered truly manual and car-specific.

### Derived assets

- `top-mask.png` or `top-mask.svg`
- `preview.png` or `preview.svg`
- metadata fields such as era, year, notes, and normalization length

These should follow one template and one naming convention.

## Recommended workflow now

For the first few cars, use a semi-manual workflow:

1. import the `GLB` into Blender
2. duplicate it to a simplified `flow-demo` version
3. remove tiny details that do not affect the top silhouette
4. render an orthographic top mask
5. export a preview image
6. update `data/flow/car-registry.json`

This is the fastest reliable path while the compare system is still being built.

## Recommended workflow later

Once the site structure is stable, automate the derived assets:

- Blender export script for top masks and previews
- optional offscreen `three.js` tool for mask generation from a standard camera
- registry validation script that checks for missing files and broken paths

## Naming convention

Per-car folder under `apps/web/public/assets/cars/`:

```text
<car-id>/
  top-mask.png or top-mask.svg
  preview.png or preview.svg
```

Registry id should match folder name.

## Minimum first publishable package

For a car to appear in the projected-flow compare:

- `id`
- `name`
- `era`
- `publicModelPath`
- `topMaskPath`
- `previewPath`
- `scaleLengthMeters`

## What should stay standardized

Do not vary these between cars unless the whole compare system version changes:

- top-view framing
- orientation
- pixel resolution of mask export
- metric formulas
- flow solver preset

## Authoring checklist

- confirm car points in the same direction as other models
- confirm length normalization field is set
- confirm top mask is high-contrast and tightly framed
- confirm preview image matches the same product style
- confirm registry entry paths match the public files
