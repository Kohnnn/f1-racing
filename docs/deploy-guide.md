# F1 Racing Deployment Guide

Production is a Next.js 15 static export deployed to Netlify.

- Production URL: `https://f1-demo.netlify.app`
- Build output: `apps/web/out`
- Build configuration: `netlify.toml`
- Optional API: configured by deployment environment, not hardcoded in source

## Prerequisites

- Node.js 22
- npm
- Netlify CLI authentication for the intended account

Install dependencies deterministically:

```bash
npm ci
```

## Validate and build

Run the repository quality checks before producing the artifact:

```bash
npm run quality
npm run check:featured
python -m unittest backend.test_path_validation
python -m py_compile backend/main.py
npm run build
npm run smoke:static
```

`npm run build` validates the deterministic newest-complete-race manifests before creating `apps/web/out`; it does not fetch or rewrite OpenF1 packs.

## Preview locally

```bash
npx serve apps/web/out -l 3000
```

Verify at minimum:

```text
/
/replay/
/replay/2026/miami-grand-prix/race/
/replay/2026/miami-grand-prix/race/?tab=compare&drivers=NOR,VER#analysis
/race-desk/
/live
/compare/
/stints/
/cars/current-spec/
/learn/
/fonts/roboto-latin-400-v51.woff
/data/manifests/latest.json
/data/manifests/seasons.json
```

## Netlify configuration

`netlify.toml` is the source of truth:

```toml
[build]
command = "npm ci && npm run build"
publish = "apps/web/out"

[build.environment]
NODE_VERSION = "22"
NETLIFY_NEXT_PLUGIN_SKIP = "true"

[[redirects]]
from = "/live"
to = "/race-desk"
status = 301
force = true
```

Set any public API origin in the Netlify deployment environment. Do not add private tokens, API keys, or SSH values to `NEXT_PUBLIC_*` variables.

## Authentication and site linkage

Check the active Netlify account without copying credentials into commands:

```bash
npx netlify status
```

Confirm the linked site is `https://f1-demo.netlify.app` before deployment. If local linkage is absent or stale, link the site interactively or pass the verified site ID from the Netlify dashboard.

Do not use credentials found in repository `.env` files. Revoke and rotate any exposed token in Netlify before deploying.

## Production deploy

Netlify Git builds are intentionally skipped because `data/packs/seasons/` and its public mirror are generated, gitignored release inputs. A source-only Netlify checkout cannot pass `check:featured`; do not weaken that gate or ingest remote telemetry during deployment.

After authentication, linkage, build, and smoke tests pass:

```bash
npx netlify deploy --prod --no-build --dir apps/web/out
```

The deploy must publish the locally verified `apps/web/out` artifact, not `.next`.

## Production smoke test

After deployment, verify:

1. `/` opens the newest complete race selected by `data/manifests/latest.json`.
2. A clean Replay URL opens Story mode; `?tab=compare&drivers=NOR,VER#analysis` opens Workspace mode with both drivers selected.
3. `?tab=stints#analysis` opens Stints in Workspace mode without hydration errors.
4. Replay shows source, position coverage, frame count, generated date, and the pack note.
5. Story steps seek to evidence and omit unsupported claims.
6. Initial Replay loading remains bounded; `Load full race` fetches the remaining chunks explicitly.
7. `/race-desk/` uses only the static replay pack, and `/live` returns a permanent redirect to `/race-desk`.
8. Missing nonleader gaps remain unavailable rather than rendering `+0.000`.
9. The 2D map supports keyboard pan, zoom, and reset while preserving pointer and touch behavior.
10. Reduced-motion mode stops autonomous model rotation and starts the wind field paused.
11. `/fonts/roboto-latin-400-v51.woff` loads from the same origin without Unicode resolver or Troika worker requests.
12. Browser console, page errors, hydration errors, and failed core-route requests remain empty.

## Rollback

Use Netlify Deploys to republish the previous known-good production deploy. Do not rebuild during rollback; restoring the immutable prior artifact reduces variables.
