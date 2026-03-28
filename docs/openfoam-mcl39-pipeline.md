# McLaren OpenFOAM Pipeline

Use this as the first end-to-end path from the local McLaren GLB to a publishable CFD overlay pack.

## Goal

Do one simple offline run first:

- cleaned McLaren geometry
- one steady external aero case
- one CSV export from ParaView
- one website pack with `cp` and `cf`

Do not try to build a full F1-grade aero workflow on the first pass.

## What is already prepared in the repo

- starter case: `pipeline/openfoam/cases/mcl39-baseline`
- pack builder: `pipeline/openfoam/src/build-openfoam-overlay-pack.mjs`
- example config: `pipeline/openfoam/config/mcl39-baseline-15ms.example.json`
- CSV drop zone: `pipeline/openfoam/exports/mcl39-baseline-15ms`
- site integration reference: `data/packs/sims/openfoam-starter-case.json`

## Recommended environment

Best beginner path on Windows:

1. install OpenFOAM in WSL2 Ubuntu
2. use Blender on Windows for cleanup
3. keep the repo on the Windows side, but run the OpenFOAM case from WSL

If you prefer the official native Windows build, the same case files still apply.

## Inputs you must provide

These are the parts I cannot produce automatically from inside the repo:

1. confirm the source model license allows public publishing of derived assets
2. export a watertight CFD STL from Blender as `mcl39_clean.stl`
3. choose the coefficient reference values you want to use:
   - `areaM2`
   - `lengthM`
4. export one ParaView CSV containing:
   - `p`
   - `wallShearStress:0`
   - `wallShearStress:1`
   - `wallShearStress:2`
5. update the final `triangleCount` once your render-mesh mapping is settled

## Recommended first action

Copy:

- `pipeline/openfoam/config/mcl39-user-inputs.example.json`

to:

- `pipeline/openfoam/config/mcl39-user-inputs.local.json`

and fill what you already know.

Fastest way:

```bash
npm run init:openfoam:local
```

Then run:

```bash
npm run check:openfoam:ready
```

That gives you a concrete missing-input checklist.

For a field-by-field explanation of that file, use:

- `docs/openfoam-local-inputs.md`

## Geometry prep

Use the McLaren GLB only as the visual source.

For CFD, clean it in Blender and export a separate STL.

Minimum geometry rules:

- closed and watertight
- scaled in meters
- no loose floating parts
- no internal cockpit detail
- no tiny bolt-level geometry
- one body shell for the first run

Orientation expected by the starter case:

- `+x` points downstream
- `+z` points up
- the nose points toward negative `x`

Copy the STL here:

- `pipeline/openfoam/cases/mcl39-baseline/constant/triSurface/mcl39_clean.stl`

## First CFD run

From an OpenFOAM shell inside `f1-racing`:

```bash
cd pipeline/openfoam/cases/mcl39-baseline
./Allrun
```

That runs:

- `surfaceCheck`
- `surfaceFeatureExtract`
- `blockMesh`
- `snappyHexMesh -overwrite`
- `checkMesh`
- `simpleFoam`

## What to inspect after the run

Check these first:

- `pipeline/openfoam/cases/mcl39-baseline/log.simpleFoam`
- `pipeline/openfoam/cases/mcl39-baseline/postProcessing/carForceCoeffs`
- `pipeline/openfoam/cases/mcl39-baseline/postProcessing/carSurface`

If the case does not converge cleanly, do not publish the numbers yet.

## Export one website-ready CSV

Open the solved case in ParaView and export the car surface to:

- `pipeline/openfoam/exports/mcl39-baseline-15ms/car-surface.csv`

The current example config assumes one CSV with both pressure and wall-shear columns.

Detailed steps are in:

- `docs/openfoam-paraview-export.md`

## Build the website pack

From `f1-racing`:

```bash
npm run apply:openfoam:inputs
npm run build:openfoam:overlay -- --config pipeline/openfoam/config/mcl39-baseline-15ms.local.json
```

That writes mirrored outputs into:

- `data/packs/sims/openfoam/mcl39-baseline-15ms.json`
- `apps/web/public/data/packs/sims/openfoam/mcl39-baseline-15ms.json`
- `data/packs/sims/openfoam/mcl39-baseline-15ms/*.csv`
- `apps/web/public/data/packs/sims/openfoam/mcl39-baseline-15ms/*.csv`

## What to edit before trusting the coefficients

Fill `pipeline/openfoam/config/mcl39-user-inputs.local.json` with your real values, then run `npm run apply:openfoam:inputs`.

That writes `pipeline/openfoam/config/mcl39-baseline-15ms.local.json` with the applied values for:

- `reference.areaM2`
- `reference.lengthM`
- `meshBinding.triangleCount`
- optional hotspot values and summary metrics still live in the example config until you replace them with real results

## Where it plugs into the site

- wind route: `apps/web/src/app/sims/wind/page.tsx`
- car route: `apps/web/src/app/cars/current-spec/page.tsx`
- example overlay contract: `data/packs/sims/f1-cfd-overlay.schema.example.json`

## Suggested next upgrades after the baseline works

1. add rotating wheels
2. add prism layers and finer local refinement
3. add a second scenario at higher speed
4. add a DRS-open variant
5. add a proper render-mesh mapping stage for on-car coloring
