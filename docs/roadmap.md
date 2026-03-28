# Roadmap

## Status

This file is the progress tracker for the new `f1-racing` product.

## Product phases

### Phase 0 - foundation
- [x] Create workspace scaffold
- [x] Document architecture
- [x] Document data schemas
- [x] Document deployment plan
- [x] Choose package manager
- [x] Initialize app workspace

### Phase 1 - ingestion core
- [x] Build OpenF1 metadata fetcher
- [x] Build session metadata normalizer
- [x] Build manifest generator
- [x] Export first session summary pack
- [x] Validate one season/race/session end-to-end

### Phase 2 - session explorer
- [x] Build season -> race -> session navigation
- [x] Build session summary page
- [x] Build driver/session metadata cards
- [x] Load compressed static packs from storage
- [ ] Add minimal search and manifest lookup

### Phase 3 - lap compare
- [x] Build two-driver lap comparison page
- [x] Render speed trace
- [x] Render throttle trace
- [x] Render brake trace
- [x] Build delta-dominance map
- [x] Add corner annotations

### Phase 4 - stint and strategy stories
- [x] Build stint trend page
- [ ] Build pit-stop timeline
- [ ] Build weather context layer
- [ ] Build undercut / overcut explanation layer
- [x] Build strategy pack export

### Phase 5 - learn modules from current explainer
- [x] Split current F1 explainer concepts into `/learn/car`
- [x] Build `/learn/aero`
- [x] Build `/learn/tyres`
- [x] Build `/learn/braking`
- [x] Build `/learn/setup`
- [x] Build `/learn/strategy`

### Phase 6 - 3D car viewer
- [x] Add `model-viewer` route
- [x] Load local GLB assets
- [x] Add hotspots and annotations
- [x] Add poster-image fallback
- [x] Keep 3D isolated from data-heavy routes

### Phase 7 - wind sim viewer
- [x] Define sim scenario grid
- [x] Build source-scenario manifest for sim results
- [ ] Publish first streamlines/pressure packs
- [x] Build browser wind-sim explainer route
- [x] Define baked overlay schema example
- [ ] Connect sim outputs to learn/aero module

### Phase 8 - replay-lite
- [ ] Build top-down replay view
- [ ] Build position interpolation packs
- [ ] Add driver focus mode
- [ ] Add event markers
- [ ] Keep replay separate from learning pages

## Technical tasks

### Frontend
- [ ] Initialize Next.js app
- [ ] Set up route groups for learn/data/replay
- [ ] Create shared telemetry chart primitives
- [ ] Create track map primitive
- [ ] Create annotation system
- [ ] Add route-level loading and error states

### Pipeline
- [ ] Define canonical schemas
- [ ] Create ingest scripts
- [ ] Create derive scripts
- [ ] Create export scripts
- [ ] Add versioned file naming
- [ ] Add compression step

### Infrastructure
- [ ] Set up Cloudflare Pages
- [ ] Set up R2 bucket layout
- [ ] Set up Workers for metadata/search
- [ ] Add CI workflow for app deploy
- [ ] Add CI workflow for data export

## Current recommendation

Build order should be:

1. ingestion + manifests
2. session explorer
3. lap compare
4. stint/strategy
5. learn modules
6. model-viewer
7. wind sim
8. replay-lite

## Notes

The current `interactive-explanation/formula-1-racing/` route remains a useful concept source, but this new product should avoid collapsing all learning, telemetry, and replay concerns into one giant page.
