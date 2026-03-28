# How To Fill `mcl39-user-inputs.local.json`

This file is your small manual checklist for the first McLaren OpenFOAM run.

Path:

- `pipeline/openfoam/config/mcl39-user-inputs.local.json`

It exists so you can keep your real local values out of git while still generating a website-ready overlay config later.

## What this file controls

You only need to fill the parts the repo cannot know automatically:

- license confirmation
- your chosen reference area
- your chosen reference length
- the triangle count for the render mesh binding

After you fill it, run:

```bash
npm run check:openfoam:ready
npm run apply:openfoam:inputs
```

## File shape

Current template:

```json
{
  "modelId": "mclaren-2025-mcl39",
  "scenarioId": "mcl39-baseline-15ms",
  "license": {
    "confirmedForWebsite": false,
    "sourceUrl": "",
    "notes": "Set confirmedForWebsite to true only after you verify the source model license allows publishing derived assets."
  },
  "reference": {
    "areaM2": null,
    "lengthM": null
  },
  "meshBinding": {
    "triangleCount": null,
    "mappingNotes": "Set this after you settle the render-mesh mapping for the website overlay."
  },
  "artifacts": {
    "cleanStlPath": "pipeline/openfoam/cases/mcl39-baseline/constant/triSurface/mcl39_clean.stl",
    "surfaceCsvPath": "pipeline/openfoam/exports/mcl39-baseline-15ms/car-surface.csv"
  }
}
```

## Field-by-field guide

### `modelId`

Leave this as:

```json
"modelId": "mclaren-2025-mcl39"
```

Do not change it unless you are building a different car.

### `scenarioId`

Leave this as:

```json
"scenarioId": "mcl39-baseline-15ms"
```

Do not change it unless you are creating a different scenario such as another speed or DRS state.

### `license.confirmedForWebsite`

Set this to `true` only after you check that the source model license allows you to publish:

- the model on your site
- cleaned derivative geometry
- screenshots or renders made from it
- baked CFD overlay outputs based on it

Use:

```json
"confirmedForWebsite": true
```

only when you are sure.

If you are not sure yet, leave it `false`.

### `license.sourceUrl`

Put the original model page or license source here.

Example:

```json
"sourceUrl": "https://example.com/original-model-page"
```

If you do not have the URL yet, you can leave it blank temporarily.

### `license.notes`

This is optional human context for yourself.

Examples:

- `"Personal use only, do not publish yet."`
- `"Commercial reuse allowed with attribution."`

### `reference.areaM2`

This is the reference area used for the coefficient calculation in the website config.

For this project, the simplest recommendation is:

- use one consistent frontal reference area for all your McLaren scenarios

Why:

- `Cd` and `Cl` only make sense relative to the reference values you choose
- consistency matters more than perfection for the first website version

If you know the real engineering reference area you want, use that.

If you do not, choose one frontal-area estimate and keep it unchanged across all future scenarios.

Example starter value:

```json
"areaM2": 1.5
```

Important:

- do not keep changing this between scenarios, or your coefficients stop being comparable

### `reference.lengthM`

This is the reference length used by the OpenFOAM force-coefficient setup.

For this project, the simplest recommendation is:

- use the overall car length in meters

Example starter value:

```json
"lengthM": 5.2
```

If your cleaned CFD model is scaled differently, use the real measured length of that cleaned model.

### `meshBinding.triangleCount`

This should be the triangle count of the render mesh you plan to bind the CFD overlay to.

In most cases, this is **not** the full raw GLB triangle count.

Use the triangle count for:

- the body-shell render mesh
- or the mapped display mesh that will receive the overlay

Do not blindly use the total McLaren GLB count unless you are truly binding to the entire file as-is.

What I already measured:

- `npm run inspect:glb:mcl39` reports `1,088,576` total triangles for the full GLB

That number is useful as a ceiling, but it is probably too high for the actual overlay binding.

Good sources for the real binding count:

1. Blender statistics for the cleaned display mesh
2. the exported simplified render mesh you intend to color
3. your mesh-mapping step if it outputs a known target triangle count

Example starter value if you use the current placeholder binding:

```json
"triangleCount": 84216
```

Replace that with your real mapped mesh count when you know it.

### `meshBinding.mappingNotes`

Use this to remind yourself what the count refers to.

Example:

```json
"mappingNotes": "Triangle count is for the simplified body-shell display mesh exported from Blender."
```

### `artifacts.cleanStlPath`

Normally leave this unchanged.

It should point to:

- `pipeline/openfoam/cases/mcl39-baseline/constant/triSurface/mcl39_clean.stl`

### `artifacts.surfaceCsvPath`

Normally leave this unchanged.

It should point to:

- `pipeline/openfoam/exports/mcl39-baseline-15ms/car-surface.csv`

## Recommended starter version

Use this only as a practical starting point if you want to unblock the workflow quickly.

Replace values later when you know more.

```json
{
  "modelId": "mclaren-2025-mcl39",
  "scenarioId": "mcl39-baseline-15ms",
  "license": {
    "confirmedForWebsite": false,
    "sourceUrl": "",
    "notes": "Still checking source-model license for website use."
  },
  "reference": {
    "areaM2": 1.5,
    "lengthM": 5.2
  },
  "meshBinding": {
    "triangleCount": 84216,
    "mappingNotes": "Starter placeholder for a simplified body-shell render mesh. Replace with the real mapped mesh triangle count."
  },
  "artifacts": {
    "cleanStlPath": "pipeline/openfoam/cases/mcl39-baseline/constant/triSurface/mcl39_clean.stl",
    "surfaceCsvPath": "pipeline/openfoam/exports/mcl39-baseline-15ms/car-surface.csv"
  }
}
```

## What to do after editing

1. save `pipeline/openfoam/config/mcl39-user-inputs.local.json`
2. run:

```bash
npm run check:openfoam:ready
```

3. when the missing values are filled, run:

```bash
npm run apply:openfoam:inputs
```

That writes:

- `pipeline/openfoam/config/mcl39-baseline-15ms.local.json`

4. after your STL and ParaView CSV are ready, build the browser pack:

```bash
npm run build:openfoam:overlay -- --config pipeline/openfoam/config/mcl39-baseline-15ms.local.json
```

## What I still cannot fill automatically

I still need you to decide or provide:

- whether the model license is safe for publishing
- the source URL for that model license
- the reference area you want to use
- the reference length you want to use
- the final triangle count for the render-mesh binding

Those are the only meaningful human inputs left in this file.
