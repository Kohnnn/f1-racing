# Blender Cleanup For CFD

Use this workflow to turn the public McLaren render model into a first-pass CFD STL.

## Goal

Export one simple watertight outer shell for the starter OpenFOAM case.

For the first run, do not chase perfect realism. Chase a stable, closed, clean mesh.

## Start from the McLaren model

Source file already in the repo:

- `glb_model/f1_2025_mclaren_mcl39.glb`

Import that into Blender and save a working file before you change anything.

## Recommended Blender setup

1. duplicate the imported collection so you keep one untouched source copy
2. rename the working mesh to `mcl39_cfd`
3. switch scene units to meters
4. apply rotation and scale with `Ctrl+A`

## Keep for the first CFD pass

- front wing main elements
- nose and chassis outer shell
- sidepods and engine cover outer shell
- floor outer shell
- diffuser outer shell
- rear wing main assembly
- tyres if they are clean enough to keep as simple solids

## Delete for the first CFD pass

- cockpit internals
- steering wheel
- driver or mannequin meshes
- cameras, antennas, mirrors if extremely thin or broken
- sponsor text if it is modeled as geometry
- bolts, brake lines, suspension detail that creates tiny broken surfaces
- duplicated floating parts inside bodywork

## Mesh cleanup checklist

1. join outer-shell pieces where it helps produce one closed body
2. recalculate normals to the outside
3. use merge-by-distance on obvious duplicate vertices
4. inspect for non-manifold edges
5. close visible holes
6. remove internal faces you do not need
7. make sure the model sits on the ground plane cleanly

## Orientation for the starter case

The OpenFOAM case expects:

- `+x` downstream
- `+z` upward
- nose pointing toward negative `x`

If your import is different, rotate it before export.

## Scale check

Before export, confirm the approximate overall size matches a real F1 car:

- length around 5 to 5.5 m
- width around 2 m
- height around 1 m

## Export

Export only the cleaned CFD mesh as STL:

- filename: `mcl39_clean.stl`
- selection only: on
- apply modifiers: on
- scale: 1.0

Put it here:

- `pipeline/openfoam/cases/mcl39-baseline/constant/triSurface/mcl39_clean.stl`

## If Blender reports problems

- holes or non-manifold edges: fix these before CFD
- intersecting shells: simplify or delete tiny intersecting parts
- very dense decorative geometry: delete it for the first pass

The first job is not a showpiece mesh. It is a solver-safe mesh.
