# ParaView Export For The Website Pack

After `simpleFoam` finishes, use ParaView to export one surface CSV for the website pack builder.

## Goal

Produce:

- `pipeline/openfoam/exports/mcl39-baseline-15ms/car-surface.csv`

with these columns present:

- `p`
- `wallShearStress:0`
- `wallShearStress:1`
- `wallShearStress:2`

## Open the solved case

From the case folder you can use either:

```bash
paraFoam
```

or open the VTK output under:

- `pipeline/openfoam/cases/mcl39-baseline/postProcessing/carSurface/...`

## Select the right surface

Use the `carPatch` surface from the `carSurface` function-object output.

That is the best source for the first website export because the starter case already samples:

- `p`
- `U`
- `wallShearStress`

## Verify arrays before export

In ParaView:

1. select the sampled car surface
2. switch to `Spreadsheet View`
3. confirm the surface has the needed arrays

If the array names differ, do not panic. You can still use the pack builder, but you must update the matching column names in:

- `pipeline/openfoam/config/mcl39-baseline-15ms.example.json`

## Save as CSV

1. select the sampled car surface
2. choose `File -> Save Data`
3. save as:
   - `pipeline/openfoam/exports/mcl39-baseline-15ms/car-surface.csv`
4. keep point-data and field arrays enabled if ParaView prompts you

## Check the CSV quickly

Run:

```bash
npm run check:openfoam:ready
```

That command validates the presence of the expected CSV headers.

## Then build the website pack

```bash
npm run apply:openfoam:inputs
npm run build:openfoam:overlay -- --config pipeline/openfoam/config/mcl39-baseline-15ms.local.json
```
