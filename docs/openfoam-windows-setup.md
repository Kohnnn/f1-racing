# OpenFOAM On Windows

For this repo, the easiest path is usually:

- Blender on Windows
- Node.js on Windows
- OpenFOAM in WSL2 Ubuntu

## Recommended path: WSL2 + Ubuntu

1. install WSL2
2. install Ubuntu from the Microsoft Store
3. install OpenFOAM in Ubuntu using the official OpenFOAM instructions for your chosen release
4. open Ubuntu and load the OpenFOAM environment

Typical shell pattern after install:

```bash
source /opt/openfoam*/etc/bashrc
```

## Working with this repo from WSL

This repo lives on the Windows side, so from Ubuntu it should be reachable at a path like:

```bash
/mnt/c/Users/Admin/Desktop/PersonalWebsite/interactive-note/f1-racing
```

Then run:

```bash
cd /mnt/c/Users/Admin/Desktop/PersonalWebsite/interactive-note/f1-racing
node pipeline/openfoam/src/init-openfoam-local.mjs
node pipeline/openfoam/src/check-openfoam-readiness.mjs
cd pipeline/openfoam/cases/mcl39-baseline
./Allrun
```

## Suggested tool split

- Blender cleanup: Windows
- OpenFOAM solve: WSL2 Ubuntu
- ParaView export: Windows or WSL, whichever is easier on your machine
- website build: Windows PowerShell or Command Prompt

## Native Windows option

If you prefer the native OpenFOAM Windows build, keep using the same repo files and same case folder. Only the shell environment changes.

The starter case files themselves do not depend on WSL2.

## After the solve

Export the car surface CSV to:

- `pipeline/openfoam/exports/mcl39-baseline-15ms/car-surface.csv`

Then from `f1-racing` run:

```bash
npm run apply:openfoam:inputs
npm run build:openfoam:overlay -- --config pipeline/openfoam/config/mcl39-baseline-15ms.local.json
```

## When to use the readiness checker

Run this any time you want a quick missing-input report:

```bash
npm run check:openfoam:ready
```

It tells you which items are still missing before the case or overlay-pack build can complete.
