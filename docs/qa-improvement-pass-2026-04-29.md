# QA Improvement Pass - 2026-04-29

This note documents the implementation pass based on `evaluation.md`.

## Fixed

- Normalized accented slugs in the shared `slugify()` helper so future `São Paulo` exports become `sao-paulo`, not `s-o-paulo`.
- Rebased OpenF1 replay frame time to the first lap start instead of the session start timestamp. Abu Dhabi replay now begins at race motion instead of sitting still for the pre-race buffer.
- Added a Yas Marina track shape to the synthetic track generator so Abu Dhabi no longer falls back to a generic decagon.
- Regenerated Abu Dhabi Race session/replay packs and split replay chunks.
- Fixed OpenF1 session lap enrichment so compounds and stints are derived from stint windows.
- Fixed session fastest-lap semantics so the global fastest lap is the only lap marked fastest in the table/header path.
- Remounted the `<model-viewer>` element on car changes so constructor switching reloads the GLB instead of retaining the previous Red Bull render.
- Added a visible model loading status for larger GLB files.
- Replaced public-facing implementation copy and raw session-key language with user-facing labels.
- Updated live/session/replay/library copy for clearer labels.

## Targeted Data Checks

- Abu Dhabi replay `chunk-000` now moves by the second frame:
  - `t=0`: VER at `(-481.8, -103.2)`
  - `t=8`: VER at `(-162.21, -184.13)`
- Abu Dhabi replay gap data now appears early:
  - `t=8`: NOR gap `0.209`
  - `t=40`: NOR gap `1.043`
- Abu Dhabi session lap pack now reports:
  - global fastest lap: `LEC 86.725`
  - `UNKNOWN` compounds: `0`
  - zero-index stint rows: `0`
- Abu Dhabi replay metadata now contains a 20-point Yas Marina synthetic path and 8 frame chunks.

## Remaining Work

- Rename existing `s-o-paulo-grand-prix` generated folders and manifest entries to `sao-paulo-grand-prix`; the slug helper fix prevents new bad slugs but does not migrate existing exported paths.
- Add true session date metadata to `seasons.json` cards if chronological library sorting is required.
- Expand Learn modules with richer educational content after the core replay/model defects are stable.
- Consider filtering or clearly labeling fictional/prototype car catalog entries such as APX GP.

## Verification Commands

Run from `f1-racing/`:

```bash
npm run build
```

For Netlify-style workspace verification:

```bash
npm run build -w @f1-racing/web
```
