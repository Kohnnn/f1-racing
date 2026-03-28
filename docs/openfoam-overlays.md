# OpenFOAM For Mesh-Linked CFD Overlays

## Short answer

Yes, OpenFOAM is usable for mesh-linked CFD overlays in this product.

It is a good fit for the **offline baked-CFD workflow** we already want:

1. run or obtain an OpenFOAM case offline
2. sample or export surface and streamline data
3. normalize that data into compact browser-safe packs
4. attach those packs to the same GLB or a mapped render mesh in the app

It is **not** a good fit for solving airflow live in the browser.

## Why it is usable

OpenFOAM already supports the parts we need for post-processing and export:

- `surfaces` function objects for sampling fields on 2D or 3D surfaces
- surface sampling output in formats such as `vtk`, `raw`, `ensight`, and related formats
- `foamToVTK` for converting OpenFOAM results to VTK for downstream processing and visualization

The official docs confirm:

- the sampling system can write sampled surface data in multiple formats including `vtk`, `raw`, and `csv`
- the `surfaces` function object is intended for post-processing on surfaces
- `foamToVTK` is the standard path for converting OpenFOAM case data into VTK outputs

## What makes it practical for this site

For this product we do not need a full CFD workstation in production.
We need:

- precomputed pressure fields
- precomputed friction or wall-shear fields
- precomputed streamline sets
- a way to bind those outputs to a car model or a simplified aero explainer

That is exactly the kind of problem OpenFOAM output can support well.

## What must match

The important constraint is geometry matching.

### Best case

Best case is:

- the render GLB and the CFD body surface come from the same mesh lineage
- face/triangle correspondence is known or recoverable

Then surface overlays are straightforward.

### Hard case

Hard case is:

- the GLB topology differs substantially from the CFD mesh
- the CFD case was run on another body or another triangulation

Then you need a mapping step:

- nearest-face transfer
- barycentric remap
- sampled point cloud projection
- UV-space bake if available

Without that mapping, values like `Cp` or `Cf` will not line up correctly on the render mesh.

## Recommended OpenFOAM workflow

### 1. Keep CFD outside the app runtime

Do not make the browser call a solver.

Instead:

- run OpenFOAM offline
- export the surface and streamline outputs
- convert into small static packs
- serve those packs from storage/CDN

### 2. Export the right data

Start with these outputs:

- surface pressure / pressure coefficient
- surface friction / wall shear
- streamline geometry
- part-level force summaries if available

### 3. Convert to app-friendly format

Recommended internal export target:

- one scenario per file
- one model id per file
- one metric scale per file
- optional separate streamline file

### 4. Attach to the car viewer

Recommended frontend flow:

- load GLB with `model-viewer`
- load a baked overlay pack for the chosen scenario
- render:
  - surface color legend
  - hotspot probes
  - optional screen-space streamlines or linked overlays

## Useful OpenFOAM outputs for this app

### Surface fields

Use for:

- `Cp`
- `Cf`
- wall shear
- pressure zones by part

Good for:

- `/cars/current-spec`
- `/learn/aero`
- `/sims/wind`

### Streamlines

Use for:

- roofline feed
- floor-edge wake
- diffuser recovery patterns
- dirty-air or yaw comparisons

Good for:

- aero learning modules
- scenario switching

### Force summaries

Use for:

- drag index
- downforce index
- front / rear aero balance
- component force contribution

Good for:

- side panel metrics
- compare cards
- scenario tables

## Suggested OpenFOAM export path

### Option A - direct sampling function objects

Use OpenFOAM `surfaces` sampling to generate surface outputs per scenario.

Good when:

- you already know which fields you want
- you want cleaner per-surface exports

### Option B - convert case to VTK first

Use `foamToVTK` and process VTK outputs in a separate conversion step.

Good when:

- you want a more general downstream toolchain
- you want to inspect and validate results in ParaView or other tooling before app packaging

## Recommended app schema

Use the baked schema already added in:

- `data/packs/sims/f1-cfd-overlay.schema.example.json`

Key fields there are:

- `modelId`
- `scenarioId`
- `meshBinding`
- `colorScale`
- `scalarFields`
- `overlays.streamlines`
- `overlays.hotspots`

That is a good first browser contract for OpenFOAM-derived outputs.

## Feasibility for your current assets

### McLaren / APX GP GLBs

Feasible if:

- you can run CFD on matching meshes
- or you can create a stable mapping from CFD surface to render mesh

### FS_CFD_database

Useful as:

- a source-scenario reference
- a data-shape reference
- a post-processing UX reference

Not sufficient as a direct overlay source for the current F1 GLBs because it is not an F1 geometry dataset.

## Recommended implementation phases

### Phase 1

- use OpenFOAM-derived packs only on `/sims/wind`
- show scenario metadata, scalar ranges, hotspots, and streamline references

### Phase 2

- connect one overlay to `/cars/current-spec`
- one model
- one scenario
- one field, likely `Cp`

### Phase 3

- add scenario switching:
  - baseline
  - low ride height
  - high yaw
  - DRS open / closed

### Phase 4

- connect selected overlay summaries back to `/learn/aero`

## Practical recommendation

Use OpenFOAM as the offline source of truth for CFD exports.

For this product, the best pattern is:

- OpenFOAM offline
- surface/streamline export
- conversion to small static packs
- `model-viewer` or learn-page overlay rendering in the app

That is feasible, scalable, and aligned with the static-first architecture already in `f1-racing`.

## Repo starter assets

This repo now includes a first McLaren starter path:

- case scaffold: `pipeline/openfoam/cases/mcl39-baseline`
- pack builder: `pipeline/openfoam/src/build-openfoam-overlay-pack.mjs`
- readiness checker: `pipeline/openfoam/src/check-openfoam-readiness.mjs`
- local-input applier: `pipeline/openfoam/src/apply-openfoam-user-inputs.mjs`
- starter checklist: `data/packs/sims/openfoam-starter-case.json`
- step-by-step walkthrough: `docs/openfoam-mcl39-pipeline.md`

Use those to get from one cleaned STL to one publishable baseline overlay pack before attempting higher-fidelity scenarios.
