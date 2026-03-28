# MCL39 baseline case

Starter case for one simple McLaren external aero run.

## Intent

Use this as the first pass only:

- `simpleFoam`
- `kOmegaSST`
- `15 m/s`
- moving ground
- fixed wheels
- one clean watertight STL

## Before you run

1. Clean the public car model in Blender.
2. Scale it to real-world meters.
3. Align it so:
   - `+x` is downstream
   - `+z` is up
   - the nose sits toward negative `x`
4. Export `mcl39_clean.stl`.
5. Copy that STL to `constant/triSurface/mcl39_clean.stl`.

## Run

From WSL2 Ubuntu or another OpenFOAM shell:

```bash
./Allrun
```

## Outputs to inspect first

- `log.simpleFoam`
- `postProcessing/carForceCoeffs`
- `postProcessing/wallShearStress`
- `postProcessing/carSurface`

## Next step for the website

Open the solved case in ParaView, export the car surface to CSV, and then run:

```bash
npm run build:openfoam:overlay -- --config pipeline/openfoam/config/mcl39-baseline-15ms.example.json
```
