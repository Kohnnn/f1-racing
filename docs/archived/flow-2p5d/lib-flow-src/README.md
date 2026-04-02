# Flow library scaffold

This folder is reserved for the app-side projected-flow implementation.

Planned modules:

- `types.ts` - contracts for registry entries, presets, and metrics
- `defaults.ts` - shared compare defaults and simulation presets
- `field.ts` - mask analysis and relative metric helpers
- `lbm.ts` - lightweight D2Q9 lattice Boltzmann solver for the top-view demo
- `mask-loader.ts` - future asset-loading helper if the flow system grows beyond one route
- `renderer.ts` - future canvas or WebGL drawing helpers if the demo becomes multi-car
