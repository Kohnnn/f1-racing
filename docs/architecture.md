# Architecture

## Goal

Build a production-grade Formula 1 product that is static-first, telemetry-aware, and explanation-friendly.

The product should combine:

- engineering explainers for how the car works
- telemetry tools for how laps, stints, and races unfold
- optional 3D and wind-sim modules where they genuinely improve understanding

This is intentionally different from the current all-in-one `interactive-explanation/formula-1-racing/` page.

## Architecture verdict

The proposed direction is good.

The strongest architecture is:

- static frontend
- offline data ingestion
- precomputed compact race/session packs
- CDN-delivered immutable assets
- thin serverless metadata/search layer

This avoids loading raw telemetry from OpenF1 on every page view and keeps the browser focused on rendering and interaction instead of heavy data wrangling.

## Product surfaces

### 1. Learn

Explanation-first pages inspired by the current F1 interactive explanation.

Recommended pages:

- `/learn/car`
- `/learn/aero`
- `/learn/tyres`
- `/learn/braking`
- `/learn/setup`
- `/learn/strategy`

These pages should reuse the current explainer concepts:

- component explorer
- airflow and floor behavior
- rear wing / DRS tradeoff
- tyre window and wear
- braking and entry stability
- track-dependent setup compromise
- weather and pit strategy

But they should not depend on live telemetry to function.

### 2. Data

Telemetry-first views using precomputed OpenF1 packs.

Recommended routes:

- `/sessions/[season]/[grand-prix]/[session]`
- `/compare/[session]/[drivers]`
- `/stints/[session]`
- `/replay/[session]`

These routes should focus on:

- fastest-lap analysis
- driver-vs-driver delta views
- stint pace evolution
- pit windows and weather context
- simplified replay or map playback

### 3. Car and sim modules

Dedicated modules for richer visual explanation.

Recommended routes:

- `/cars/current-spec`
- `/sims/wind`

Use these carefully:

- `model-viewer` for a GLB car viewer with hotspots
- precomputed wind or CFD-style visual assets for aero explanations

They should support the learning product, not dominate it.

## Recommended stack

### Frontend

Use `Next.js`.

Why:

- app router works well for content-heavy and route-heavy products
- good static generation support
- route-level metadata and SEO
- easy split between learning pages and telemetry pages
- straightforward integration with serverless edge endpoints when needed

### Hosting

Use `Cloudflare Pages`.

Why:

- edge delivery matters for static race packs
- clean fit with immutable file caching
- integrates naturally with `Cloudflare Workers`
- pairs well with `R2`

Secondary option:

- `Vercel`

### Storage

Use `Cloudflare R2` for session and derived data packs.

Why:

- race/session packs should be stored outside the app deployment
- easier versioning and cache control
- large files are better served as objects than bundled app assets

### Thin API

Use `Cloudflare Workers` for:

- latest manifest
- search
- metadata lookup
- optional route-to-pack resolution

Do not use a heavy always-on backend unless live features become a real requirement later.

### Upstream data

Primary source:

- `OpenF1`

Optional enrichment:

- `FastF1`

Use OpenF1 for ingestion because it already covers:

- telemetry
- laps
- positions
- pit stops
- weather
- race control
- standings
- radio-related context

But do not mirror OpenF1 one-to-one into the client.

## Data flow

### 1. Ingest

Pull by:

- season
- grand prix
- session

Recommended OpenF1 pulls:

- session metadata
- laps
- car telemetry
- positions
- weather
- pit stops
- race control
- stints if derivable from lap/compound changes

### 2. Normalize

Convert raw upstream structures into internal canonical schema.

Goals:

- stable keys
- consistent timestamps / lap references
- track/session/driver alignment
- minimal browser-safe fields

### 3. Derive

Produce product-specific artifacts such as:

- corner entry / apex / exit zones
- braking points
- throttle pickup points
- delta-dominance sections
- stint degradation lines
- undercut / overcut estimates
- weather crossover heuristics
- DRS zone summaries
- track-specific telemetry traces
- explanation annotations

### 4. Export

Publish small, purpose-built packs:

- session packs
- compare packs
- stint packs
- strategy packs
- replay packs
- sim packs

### 5. Deliver

Upload versioned compressed files to object storage and serve through CDN.

The app should read:

1. one small manifest
2. one route-specific pack
3. optional related packs on demand

## Folder strategy

### `apps/web/`

Owns the user-facing app.

Subareas should eventually include:

- `src/app/learn/`
- `src/app/sessions/`
- `src/app/compare/`
- `src/app/stints/`
- `src/app/replay/`
- `src/app/cars/`
- `src/app/sims/`

### `packages/`

Shared reusable code.

- `ui/` - layout, controls, cards, track map, telemetry blocks
- `schemas/` - zod or type schemas for all packs
- `telemetry-utils/` - scaling, interpolation, delta math, lap tools

### `pipeline/`

Offline data work.

- `ingest/`
- `normalize/`
- `derive/`
- `annotate/`
- `export/`
- `manifests/`

### `data/`

Build artifacts and manifests.

- `manifests/`
- `packs/seasons/`
- `packs/tracks/`
- `packs/cars/`
- `packs/sims/`

## How the current explainer feeds the new product

The current F1 explainer should not be copied directly into this app as one giant page.

Instead, split it into reusable conceptual modules.

### Learn module mapping

- overview car map -> `/learn/car`
- airflow / front wing / floor / rear wing -> `/learn/aero`
- tyres -> `/learn/tyres`
- braking -> `/learn/braking`
- setup tradeoffs -> `/learn/setup`
- weather + pit strategy -> `/learn/strategy`

### Data module mapping

- track compare concepts -> `/compare/...`
- lap builder concepts -> `/compare/...` and `/sessions/...`
- stint / weather / pit ideas -> `/stints/...`
- racecraft -> `/replay/...` or compare overlays

## `model-viewer` plan

Use `model-viewer` for the car-learning surface only.

Recommended use:

- one current-spec F1 car page
- hotspot annotations for front wing, floor, diffuser, sidepod inlet, rear wing, brake duct, suspension, tyre, halo
- poster image first, GLB lazy-loaded after
- compressed GLB with Draco or Meshopt

Do not use `model-viewer` as the base for all telemetry pages.

## Wind sim plan

Use wind or CFD-like simulation as an offline pipeline input.

Recommended workflow:

1. define scenario grid:
   - speed
   - yaw
   - ride height
   - wing level
   - DRS state
2. run sim offline
3. export derived assets:
   - pressure maps
   - streamlines
   - wake slices
   - underfloor sections
   - drag/downforce summaries
4. transform into browser-friendly packs
5. serve from object storage

The browser should visualize precomputed results, not compute CFD itself.

## First build priorities

### Priority 1

- session explorer
- lap compare
- corner explainer
- learn/car
- learn/aero

### Priority 2

- stint story
- learn/tyres
- learn/braking
- learn/setup
- strategy page

### Priority 3

- model-viewer car page
- replay-lite
- wind sim viewer

## Guardrails

Do:

- keep telemetry packs small
- cache aggressively
- version everything
- separate explanation content from replay content
- derive app-friendly schemas

Do not:

- fetch OpenF1 directly from the browser in production
- ship raw full-session telemetry blobs to all routes
- make 3D the first-load dependency for every page
- make replay the homepage before compare and session tools are solid
