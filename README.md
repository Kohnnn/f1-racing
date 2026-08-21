# f1-racing

Static-first Formula 1 telemetry and explainer product.

This workspace currently combines three connected product surfaces:

- `Modelview`: 3D car browsing with local GLB assets
- `Replay`: race playback backed by exported static packs
- `Learn`: short engineering modules for core F1 subsystems

The current Formula 1 explainer at `interactive-explanation/formula-1-racing/` is the concept source for the learning modules, but this workspace is now its own app with a static export frontend, generated data packs, local 3D models, and an optional thin Worker API.

## Live deployment

- Production URL: `https://f1-demo.netlify.app`
- Current production deploy flow: `docs/deploy-guide.md`
- Static output directory: `apps/web/out`

## Current status

Implemented now:

- Next.js 15 static-export app in `apps/web`
- replay-first landing page with a poster-first optional 3D stage
- compatibility redirects from legacy Sessions URLs into canonical Replay routes
- Compare and Stints indexes that deep-link into Replay analysis
- guided replay workspace with provenance, completeness, telemetry, strategy, and race-control views
- standalone compare and stint detail routes backed by static packs
- `model-viewer` car surface with the current local car catalog
- six learn modules: `/learn/car`, `/learn/aero`, `/learn/tyres`, `/learn/braking`, `/learn/setup`, and `/learn/strategy`
- real OpenF1 metadata and exported packs in the generated data flow
- starter OpenFOAM pipeline docs and scripts for future baked CFD overlays

Not active in the current app:

- the old `/sims/wind` route
- the old active `flow-2p5d` app surface

Those materials are now archived under `docs/archived/flow-2p5d/`.

## Main routes

- `/` - product overview
- `/cars/current-spec` - `model-viewer` car surface
- `/replay` - replay index
- `/replay/2026/miami-grand-prix/race` - featured replay selected by the current manifest
- `/sessions` and `/sessions/...` - compatibility redirects to matching Replay routes
- `/compare` - sessions with lap-compare packs
- `/stints` - sessions with stint packs
- `/learn` - learn surface overview
- `/learn/car`
- `/learn/aero`
- `/learn/tyres`
- `/learn/braking`
- `/learn/setup`
- `/learn/strategy`

## Runtime shape

- Frontend: `Next.js`
- Current live hosting: `Netlify`
- Static deploy artifact: `apps/web/out`
- Static data delivery: bundled public assets and generated manifests
- Optional thin API: `Cloudflare Workers` in `workers/metadata-api`
- Upstream data: `OpenF1` primary, `FastF1` optional enrichment
- 3D viewer: `model-viewer` for car pages only
- CFD workflow: offline-precomputed assets derived from OpenFOAM or a compatible workflow

Cloudflare Pages and R2 remain documented options for the longer-term static-first architecture in `docs/deployment.md` and `docs/cloudflare-first-deploy.md`.

## Commands

### Install

```bash
npm ci
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

### Source-only CI verification

```bash
npm run quality:source
```

This pack-free check runs in GitHub Actions for pushes and pull requests targeting `main`. Generated season packs and Git LFS model assets are not required.

### Production build and verification

```bash
npm run quality
npm run build
npm run smoke:static
```

The production gate requires the generated, gitignored season packs. Replay diagnostics are available on any replay URL with `?debug=1` or the backtick shortcut.

### Manual Netlify production deploy

See `docs/deploy-guide.md` for the exact working commands and known monorepo caveats.

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

### Check Cloudflare CLI auth

```bash
npm run cloudflare:whoami
```

### Optional Cloudflare Worker deploy

```bash
npm run worker:deploy
```

## Product architecture

The core rule is:

Do not fetch large raw telemetry directly from OpenF1 in the browser.

Instead:

1. ingest OpenF1 offline
2. normalize and derive compact session packs
3. upload versioned files to object storage
4. let the frontend fetch only the pack needed for the current route

For the current live deploy, the exported packs and manifests are served directly from the static build.

## Docs

- `docs/architecture.md` - system architecture and product surfaces
- `docs/data-schema.md` - pack shapes and derived data contracts
- `docs/deployment.md` - hosting, CDN, caching, and deployment workflow
- `docs/deploy-guide.md` - concrete build and manual deployment commands, including the working Netlify CLI flow
- `docs/cloudflare-first-deploy.md` - step-by-step first deploy on Cloudflare Pages and optional Worker setup
- `docs/dev-journal-2026-04-01.md` - development notes and previous deployment history
- `docs/openfoam-overlays.md` - OpenFOAM feasibility and baked CFD overlay workflow
- `docs/openfoam-mcl39-pipeline.md` - step-by-step McLaren starter workflow from STL to website pack
- `docs/openfoam-blender-cleanup.md` - Blender cleanup checklist for the McLaren CFD mesh
- `docs/openfoam-local-inputs.md` - field-by-field guide for `mcl39-user-inputs.local.json`
- `docs/openfoam-paraview-export.md` - ParaView export steps for the surface CSV
- `docs/openfoam-windows-setup.md` - Windows and WSL2 setup guidance for the starter case
- `docs/archived/flow-2p5d/` - archived projected-flow documents and reference materials
- `docs/roadmap.md` - phased build plan and progress tracking

Optional Worker scaffold:

- `workers/metadata-api`

## Workspace layout

- `apps/web/` - frontend app
- `packages/` - shared UI, schemas, utilities
- `pipeline/` - ingestion and export scripts
- `data/` - generated manifests and pack outputs
- `workers/metadata-api/` - optional Cloudflare Worker for tiny metadata endpoints
- `docs/archived/flow-2p5d/` - archived projected-flow exploration

## External assets already wired

Local GLBs currently connected:

- `glb_model/f1_2025_mclaren_mcl39.glb`
- `glb_model/f1_2025_apx_gp_apx01.glb`

Public model paths:

- `/models/2025/mclaren/mcl39.glb`
- `/models/2025/apx-gp/apx01.glb`

## Environment notes

- Root `.env` is local-only and gitignored.
- `NETLIFY_AUTH_TOKEN` is used for CLI deploys.
- `NETLIFY_SITE_ID` may be stale if the target Netlify site has been recreated.
- The static frontend does not require Appwrite runtime variables.
- Deployment environment owns any public API origin.
- Automatic Netlify source builds are disabled because generated season packs are not stored in Git; production uses the verified `apps/web/out` artifact.
- Rotate any credential exposed in a local `.env` before using the related service.

## Recommended next steps

1. calibrate and ship offline CFD assets before presenting aerodynamic outputs as validated
2. optimize the largest GLB assets with Draco or Meshopt
3. automate the verified Netlify build and smoke workflow
