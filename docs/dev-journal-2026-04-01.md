# Dev Journal — F1 App

## 2026-04-01 — F1 App Deployment Sprint

### Objective
Ship a minimal F1 racing app with three working surfaces (model viewer, replay, learn) and archive the 2.5D simulation work for later.

---

### What was done

#### Archived 2.5D simulation work
Moved the following to `docs/archived/flow-2p5d/`:
- `pipeline/flow-2p5d/` — LBM solver, mask pipeline, export scripts
- `apps/web/src/lib/flow/` — Flow types, state, car registry
- `apps/web/src/components/flow/` — Flow compare view, sim panel, projected flow lab
- `apps/web/public/assets/cars/` — Pre-generated car images for flow
- `data/flow/` — Flow data packs
- `docs/flow-2p5d/` — Prior art and notes
- `apps/web/src/app/sims/wind/` — Both wind sim pages (compare + base)

Removed from active code:
- `getFlowCarRegistry` and `getWindOverlaySchemaExample` from `data.ts`
- Deleted all archived items from source tree

#### GLB model handling
- Removed `glb_model/` from `.gitignore`
- Compressed GLBs copied to `public/models/`:
  - `f1_2025_mclaren_mcl39-compressed.glb` → `public/models/2025/mclaren/mcl39.glb` (37 MB, down from 116 MB)
  - `f1_2025_apx_gp_apx01.glb` → `public/models/2025/apx-gp/apx01.glb` (30 MB)
- Original 116 MB backed up to `mcl39-original.glb`
- Updated `data/packs/cars/catalog.json` size label

#### Stripped `/cars/current-spec` to minimal
Rewrote `CarModelBrowser` as minimal viewer:
- Removed all hotspots, camera presets, CFD overlays, `overlaySchema` prop
- Kept only season/constructor dropdowns + `model-viewer` with fixed camera orbit
- Removed `getWindOverlaySchemaExample` import
- Removed `Suspense` wrapper (not needed for minimal viewer)

Cleaned up `globals.css`:
- Removed ~470 lines of car-browser + flow CSS (`.car-browser-panel`, `.camera-preset-row`, `.car-browser__hotspot`, `.hotspot-list`, `.overlay-palette`, all `.flow-*` classes)
- Added new `.car-viewer-minimal` block (~25 lines)

#### Fixed home page
- Changed 3-card grid from `panel-grid--two` to `panel-grid--three` (class did not exist)
- Removed wind surface card
- Removed wind/learn/stints compare links from hero actions
- Added `panel-grid--three` CSS class to `globals.css`

#### Fixed `/learn` pages
- Updated `learn/modules.ts` with real F1 technical content for all 6 modules (car, aero, tyres, braking, setup, strategy)
- Updated `learn/page.tsx` to use `panel-grid--three` and removed stale `/cars/current-spec` and `/sims/wind` panels
- Updated `learn/[slug]/page.tsx` with cleaner rendering (ordered list for body content)

#### Replay feature
Another AI built the `/replay` surface. Routes added:
- `/replay` — replay index
- `/replay/[season]/[grandPrix]/[session]` — 27+ session replay pages
- Replay data packs added under `data/packs/seasons/2025/*/qualifying/replay.json`

---

### Deployment

**Platform**: Netlify (chosen for fastest initial deploy)

**Deploy command**:
```bash
export NETLIFY_AUTH_TOKEN=... && npx netlify deploy --dir=apps/web/out --prod --filter @f1-racing/web
```

**Production URL**: https://magical-palmier-8cd5d3.netlify.app

**Build output**: 74 static routes generated

---

### What still needs work

- Phase 8 (replay-lite) is now partially done — replay surface is live
- Phase 7 (wind/cfd) remains archived — see `docs/archived/flow-2p5d/`
- Phase 4: pit-stop timeline, weather context, undercut/overcut explanation still not built
- GLB assets are large (37 MB) — consider Meshopt/Draco compression for production
- Replay data coverage is limited to 2025 demo weekend and a few races
- No custom domain configured yet
- Netlify site ID is a random name — should rename in Netlify dashboard

---

### Environment notes

Secrets are stored in `.env` at repo root (not committed). Keys present:
- `NETLIFY_AUTH_TOKEN` — for CLI deploys
- `NETLIFY_SITE_ID` — Netlify site identifier
- `F1_APPWRITE_*` — Appwrite database config (not yet wired up)
- `OCI_SSH_CONNECT` — OCI instance SSH connection string (for backend)

`.env` is in `.gitignore` — do not commit it.

---

### File changes summary

Modified (active code):
- `apps/web/src/app/page.tsx` — home page
- `apps/web/src/app/cars/current-spec/page.tsx` — minimal car viewer
- `apps/web/src/components/model-viewer/car-model-browser.tsx` — stripped
- `apps/web/src/app/globals.css` — removed flow CSS, added panel-grid--three
- `apps/web/src/lib/data.ts` — removed flow functions
- `.gitignore` — unignored glb_model/
- `data/packs/cars/catalog.json` — updated size label
- `apps/web/src/app/learn/page.tsx` — fixed grid, removed stale panels
- `apps/web/src/app/learn/modules.ts` — real F1 content
- `apps/web/src/app/learn/[slug]/page.tsx` — cleaner rendering

New (active):
- `docs/archived/flow-2p5d/` — archived 2.5D simulation work
- `apps/web/src/app/replay/` — replay feature
- `apps/web/src/components/replay/` — replay components
- `data/packs/seasons/2025/*/qualifying/replay.json` — replay data packs

Deleted (archived):
- `pipeline/flow-2p5d/`
- `apps/web/src/lib/flow/`
- `apps/web/src/components/flow/`
- `apps/web/public/assets/cars/`
- `data/flow/`
- `docs/flow-2p5d/`
- `apps/web/src/app/sims/wind/` (both pages)
