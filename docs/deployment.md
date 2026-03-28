# Deployment

## Recommended production choices

If you want the fastest practical first deploy, read:

- `docs/cloudflare-first-deploy.md`

Use this stack unless a later constraint forces a change:

- frontend: `Cloudflare Pages`
- object storage: `Cloudflare R2`
- thin API: `Cloudflare Workers`
- upstream data: `OpenF1`
- optional enrichment: `FastF1`
- 3D viewer: `model-viewer`
- CFD overlays: baked packs derived offline from OpenFOAM or another CFD workflow

## Why this stack

### Cloudflare Pages

Use Pages for the web app because:

- the app is now configured for static export
- global edge caching matters for telemetry packs
- it fits the static-first architecture better than a heavier always-on server

### Cloudflare R2

Use R2 for:

- session packs
- compare packs
- stint packs
- strategy packs
- replay packs
- CFD and wind-sim assets
- GLB and poster assets if they outgrow the app bundle

### Cloudflare Workers

Use Workers for only the light endpoints:

- latest manifest
- search
- metadata lookup
- optional pack URL resolution
- optional webhook refresh endpoints

Do **not** use Workers to proxy large raw OpenF1 responses for normal page loads.

## Free-tier-safe deployment shape

Use a Pages-first, Worker-optional setup.

That means:

- Pages serves the exported frontend
- static packs are fetched directly as files
- the Worker is only used for tiny metadata/search routes if you enable it

This keeps the bulk of traffic on static asset delivery and avoids burning Worker requests on pack delivery.

## Deployment plan for this repo

### What to deploy from the repo

Frontend app:

- `apps/web`

Static Pages output:

- `apps/web/out`

Generated static data during build:

- `apps/web/public/data`
- `apps/web/public/models`
- `apps/web/public/posters`

Optional Worker app:

- `workers/metadata-api`

Pipeline and docs stay in the repo but are not the main runtime surface.

## Recommended build flow

### During CI or manual deploy

1. `npm install`
2. `npm run generate:sample` for local/demo data
3. optional `npm run ingest:openf1:2025`
4. optional `npm run build:openf1:session -- --grandPrixSlug ... --sessionSlug ...`
5. `npm run build`
6. deploy `apps/web/out`

Recommended Cloudflare Pages config:

- build command: `npm install && npm run build`
- output directory: `apps/web/out`

## Best practice for production data

Do not rely on sample packs in production.

Instead:

- run ingestion/export jobs separately
- upload generated packs to R2
- keep only a small manifest in the app bundle or on Workers
- point the frontend to immutable pack URLs

## Environment approach

For the current scaffold, no secret is required for historical OpenF1 access.

If you later add:

- private storage credentials
- build-time upload tokens
- sponsor-tier live OpenF1 access

then place those in CI or Pages environment variables, not in the repo.

For the optional Worker, set:

- `ASSET_ORIGIN` = your Pages hostname or your custom static asset domain

## CDN and cache strategy

### Immutable files

Version or hash large files:

```text
seasons/2025/australian-grand-prix/qualifying/compare/nor-pia.v1.json.br
cars/2025/mclaren/mcl39-draco.v2.glb
sims/mclaren/baseline-speed-280-yaw-1p5.v1.json.br
```

Set long cache TTLs for immutable assets.

### Mutable manifests

Keep short-lived manifests small:

- `latest.json`
- `seasons.json`
- optional `openf1-2025-season.json`

The app should fetch a small manifest first, then load route-specific immutable packs.

## What to use for each surface

### Sessions / compare / stints

Use:

- static JSON packs from R2
- SSG routes in Next.js
- lightweight SVG/canvas charts

For the first deployment, serving packs directly from Pages static assets is acceptable if you want to avoid R2 setup until later.

Do not use:

- live browser calls to OpenF1 on every route load

### Cars

Use:

- `model-viewer`
- GLB stored in public assets or R2
- poster fallback images
- hotspot deep links and camera presets

Do not use:

- heavy full-scene Three.js unless the viewer needs features `model-viewer` cannot cover

### Wind / CFD

Use:

- baked scenario packs
- surface metrics and streamlines from offline processing
- mesh-linked overlays only if geometry mapping is solved

Do not use:

- live CFD solving in production requests
- browser-side physics solving

## OpenFOAM deployment note

If you use OpenFOAM later:

- keep the solver and post-processing outside the deployed app
- export reduced overlay packs from the CFD pipeline
- serve only the baked results to the browser

Read:

- `docs/openfoam-overlays.md`

## GitHub Actions recommendation

### `build-web.yml`

Use for:

- install dependencies
- run data checks
- run `npm run build`
- deploy `apps/web/out` to Pages

### `ingest-openf1.yml`

Use for:

- scheduled or manual season/session ingest
- export real packs
- upload to storage
- refresh manifests

### `publish-cfd-assets.yml`

Use later for:

- taking OpenFOAM-derived overlay packs
- validating schema
- publishing them to R2

## Optional Worker deployment

The Worker scaffold is already prepared in:

- `workers/metadata-api`

Purpose:

- `/api/latest`
- `/api/search?q=...`
- `/api/health`

Keep it optional.
If you want to stay comfortably inside the free tier, do not use it for telemetry pack delivery.

Recommended Worker flow:

1. set `ASSET_ORIGIN`
2. run `npm run worker:check`
3. deploy once you are ready to attach routes in Cloudflare

## Large asset warning

Your current GLBs are large:

- McLaren MCL39 is large enough that optimization is strongly recommended before production
- APX GP is smaller, but still worth compressing if it stays in public delivery

Recommended next asset tasks:

1. Draco or Meshopt compression
2. reduced poster images
3. possible LOD or decimated variants

## Minimum production checklist

- [ ] Pages project connected
- [ ] R2 bucket created or Pages static assets chosen for the first release
- [ ] latest manifest strategy decided
- [ ] real pack upload flow in place
- [ ] GLB assets optimized
- [ ] poster assets prepared
- [ ] compare and session routes tested against real exported packs
- [ ] wind route tested against at least one real overlay pack
- [ ] optional Worker connected to the deployed asset origin

## Recommended default

If you were deploying today, I would use:

- `Cloudflare Pages` for the app
- `Cloudflare R2` for all packs and heavy assets
- `Cloudflare Workers` only for small metadata/search endpoints

That is the cleanest fit for this repo and for the static-first Formula 1 product you want.
