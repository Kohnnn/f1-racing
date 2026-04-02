# Public car assets

Each public car folder should match the registry id in `data/flow/car-registry.json`.

Recommended layout:

```text
apps/web/public/assets/cars/
  <car-id>/
    top-mask.png
    preview.png or preview.svg
```

Notes:
- `top-mask.png` is the projected-flow obstacle mask used by the solver
- masks are extracted from the source GLB with shared framing rules so cars can be swapped in the same flow surface
- `preview.*` is optional and mainly used for cards or fallback thumbnails
- keep filenames stable once referenced by the registry
