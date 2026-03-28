# f1-racing

Static-first Formula 1 telemetry and explainer product.

This workspace combines two product surfaces:

- `Learn`: explanation-first modules for the car, aero, tyres, braking, setup, weather, and strategy
- `Data`: telemetry-first tools for session browsing, lap compare, stint stories, replay, and analysis

The current Formula 1 explainer at `interactive-explanation/formula-1-racing/` is the concept source for the learning modules, but this workspace is designed as a separate production-grade app with a static data pipeline, CDN-backed race packs, and a thin API layer.

## Current status

Implemented now:

- Next.js app scaffold in `apps/web`
- static session explorer
- static compare route
- real OpenF1 2025 season metadata ingest
- one real OpenF1 session-pack export for 2025 Australian GP qualifying
- `model-viewer` car surface with local 2025 McLaren and APX GP GLBs
- wind-sim reference route with a baked CFD schema example
- starter OpenFOAM case and website pack builder for the McLaren baseline run
- corner-level compare annotations layered on top of telemetry traces
- stint story route backed by static stint packs
- split learn modules for `/learn/car`, `/learn/aero`, `/learn/tyres`, `/learn/braking`, `/learn/setup`, and `/learn/strategy`

## Main routes

- `/` - product overview
- `/sessions` - static session explorer
- `/sessions/2025/australian-grand-prix/qualifying` - real exported 2025 session pack
- `/compare/2025/australian-grand-prix/qualifying/NOR/PIA` - real compare route with telemetry traces
- `/stints/2025/australian-grand-prix/qualifying` - static stint story route
- `/learn` - learn surface overview
- `/learn/car`
- `/learn/aero`
- `/learn/tyres`
- `/learn/braking`
- `/learn/setup`
- `/learn/strategy`
- `/cars/current-spec` - `model-viewer` car surface
- `/sims/wind` - baked CFD / wind-sim reference surface

## Recommended stack

- Frontend: `Next.js`
- Hosting: `Cloudflare Pages`
- Storage: `Cloudflare R2`
- Thin API: `Cloudflare Workers`
- Upstream data: `OpenF1` primary, `FastF1` optional enrichment
- 3D viewer: `model-viewer` for car pages only
- Wind simulation: offline-precomputed assets derived from OpenFOAM or a compatible CFD workflow

## Commands

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

### Generate sample packs

```bash
npm run generate:sample
```

### Validate manifests

```bash
npm run check:data
```

### Ingest real OpenF1 2025 season metadata

```bash
npm run ingest:openf1:2025
```

### Build one real OpenF1 session pack

Example:

```bash
npm run build:openf1:session -- --grandPrixSlug australian-grand-prix --sessionSlug qualifying
```

### Production build

```bash
npm run build
```

### Build one OpenFOAM overlay pack from exported CFD CSV

```bash
npm run build:openfoam:overlay -- --config pipeline/openfoam/config/mcl39-baseline-15ms.example.json
```

### Apply your local CFD inputs to a local overlay config

```bash
npm run apply:openfoam:inputs
```

### Create the ignored local CFD input file

```bash
npm run init:openfoam:local
```

### Check what is still missing for the OpenFOAM pipeline

```bash
npm run check:openfoam:ready
```

### Inspect the McLaren GLB triangle summary

```bash
npm run inspect:glb:mcl39
```

### Optional Cloudflare Worker validation

```bash
npm run worker:check
```

## Product architecture

The core rule is:

Do not fetch large raw telemetry directly from OpenF1 in the browser.

Instead:

1. ingest OpenF1 offline
2. normalize and derive compact session packs
3. upload versioned files to object storage
4. let the frontend fetch only the pack needed for the current route

## Docs

- `docs/architecture.md` - system architecture and product surfaces
- `docs/data-schema.md` - pack shapes and derived data contracts
- `docs/deployment.md` - hosting, CDN, caching, and deployment workflow
- `docs/openfoam-overlays.md` - OpenFOAM feasibility and baked CFD overlay workflow
- `docs/openfoam-mcl39-pipeline.md` - step-by-step McLaren starter workflow from STL to website pack
- `docs/openfoam-blender-cleanup.md` - Blender cleanup checklist for the McLaren CFD mesh
- `docs/openfoam-local-inputs.md` - field-by-field guide for `mcl39-user-inputs.local.json`
- `docs/openfoam-paraview-export.md` - ParaView export steps for the surface CSV
- `docs/openfoam-windows-setup.md` - Windows and WSL2 setup guidance for the starter case
- `docs/roadmap.md` - phased build plan and progress tracking

Optional Worker scaffold:

- `workers/metadata-api`

## Workspace layout

- `apps/web/` - frontend app
- `packages/` - shared UI, schemas, utilities
- `pipeline/` - ingestion and export scripts
- `data/` - generated manifests and pack outputs

## External assets already wired

Local GLBs currently connected:

- `glb_model/f1_2025_mclaren_mcl39.glb`
- `glb_model/f1_2025_apx_gp_apx01.glb`

Public model paths:

- `/models/2025/mclaren/mcl39.glb`
- `/models/2025/apx-gp/apx01.glb`

## Recommended next steps

1. add RPM/gear overlays to compare traces
2. connect one real OpenFOAM-derived or mapped CFD overlay pack to the car surface
3. link wind-sim outputs directly back into `/learn/aero`
4. add replay-lite routes on top of the real 2025 data flow
