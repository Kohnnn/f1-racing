# OpenFOAM pipeline

This folder is the local CFD handoff for the `f1-racing` app.

## What is here

- `cases/mcl39-baseline/` - starter OpenFOAM case for one simple external aero run
- `config/mcl39-baseline-15ms.example.json` - website pack builder config
- `exports/mcl39-baseline-15ms/` - where to drop the first ParaView CSV export
- `src/build-openfoam-overlay-pack.mjs` - converts exported CFD values into browser-safe pack files

## Fast path

1. Copy `pipeline/openfoam/config/mcl39-user-inputs.example.json` to `pipeline/openfoam/config/mcl39-user-inputs.local.json` and fill it.
   Or run:

```bash
npm run init:openfoam:local
```

2. Clean the McLaren mesh into a watertight STL.
3. Copy it to `pipeline/openfoam/cases/mcl39-baseline/constant/triSurface/mcl39_clean.stl`.
4. Run `npm run check:openfoam:ready`.
5. Run the OpenFOAM case.
6. Export the car surface from ParaView to `pipeline/openfoam/exports/mcl39-baseline-15ms/car-surface.csv`.
7. Apply your local values into a local config:

```bash
npm run apply:openfoam:inputs
```

8. Build the website pack:

```bash
npm run build:openfoam:overlay -- --config pipeline/openfoam/config/mcl39-baseline-15ms.local.json
```

The generated pack lands in both:

- `data/packs/sims/openfoam/`
- `apps/web/public/data/packs/sims/openfoam/`

## Inputs you still need to provide

- cleaned STL geometry
- confirmed public-use license for the source 3D model
- real reference area and reference length values you want to use for coefficients
- final triangle count after you settle the render-to-CFD mapping
- one ParaView CSV export with `p` and `wallShearStress`

Use `npm run check:openfoam:ready` any time you want a machine-readable missing-input report.

Useful helper commands:

- `npm run init:openfoam:local`
- `npm run check:openfoam:ready`
- `npm run inspect:glb:mcl39`
