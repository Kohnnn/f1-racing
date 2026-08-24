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
python -m unittest backend.test_path_validation backend.test_replay_chunks
python -m py_compile backend/main.py
npm run build
npm run smoke:static
```

`npm run build` validates the deterministic newest-complete-race manifests before creating `apps/web/out`; it does not fetch or rewrite OpenF1 packs.

Plan indexed OpenF1 regeneration without creating a candidate or making provider requests:

```bash
npm run release:regenerate:openf1 -- --dry-run
```

Live regeneration requires recorded operator approval. It captures exact responses privately, rebuilds only sessions with complete terminal source evidence from cache, derives provenance, runs the existing candidate gates, and prints the retained candidate path without deploying:

```bash
npm run release:regenerate:openf1 -- --rights-status approved --rights-reference <approval-reference>
```

## Candidate release gate

`npm run release:artifact` requires Node.js 22 and a clean worktree. It rejects `F1_CANDIDATE_ROOT` and `--candidate-root`, creates a fresh marker-owned directory under the OS temporary directory, copies the canonical and public projections, and binds the build to the clean 40-character source commit. It regenerates candidate evidence briefs, audits the data, runs `quality`, `check:featured`, isolated Python compilation, one build, and static smoke against that candidate, then writes a deterministic sorted SHA-256 manifest for the complete built release unit. A failed candidate is retained at the printed path; promoted canonical, public, and build trees remain unchanged.

Install the three required Playwright engines once:

```bash
npx playwright install chromium firefox webkit
```

Run the release regressions, create one candidate, and set the printed path for every later gate:

```bash
npm run test:release-data
npm run test:release-data:e2e
npm run test:release-gates
npm run release:artifact
set F1_CANDIDATE_ROOT=<candidate-path-printed-by-release-artifact>
npm run release:data
npm run release:security
npm run release:browser
```

`release-manifest.json` records the source-bound `releaseId`, byte-only `assetReleaseId`, source commit, generated timestamp, canonical hostname, sorted artifact hashes, MIME types, cache policies, counts, measurements, provenance, and freshness. `release-record.json` remains outside the deployed output and identifies the unpromoted candidate. Every browser, security, and parity invocation writes immutable passing or failing evidence under `%F1_CANDIDATE_ROOT%\evidence\<releaseId>\<gate>\sha256-<evidence-digest>\`, including `report.json` and `evidence-index.json`; the index is re-audited after finalization.

Current production packs predate the complete-pack provenance contract. `release:artifact` therefore fails until each publicly indexed session has normalized results and weather artifacts plus `release/provenance-ledger.json` coverage with terminal completion, UTC source/retrieval/generated fields, approved rights status and reference, source-response digests, complete coverage counts, and SHA-256 entries for every required file. Missing values remain missing; the gate does not synthesize them. Candidate evidence briefs omit unavailable source sessions while requiring a non-empty canonically ordered anchored subset. Candidate-aware quality, featured-data, build, and smoke commands read only the candidate inputs and built output. Static builds replace known `model-viewer` CDN fallback constants with same-origin paths and fail if dependency drift removes an expected constant.

## Preview locally

```bash
npx serve "%F1_CANDIDATE_ROOT%\apps\web\out" -l 3000
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
from = "/sessions"
to = "/replay"
status = 301
force = true

[[redirects]]
from = "/sessions/*"
to = "/replay/:splat"
status = 301
force = true

[[redirects]]
from = "/live"
to = "/race-desk"
status = 301
force = true
```

Set any public API origin in the Netlify deployment environment. Do not add private tokens, API keys, or SSH values to `NEXT_PUBLIC_*` variables.

## Authentication and site linkage

Check the active Netlify account and linked project from `apps/web` without copying credentials into commands:

```bash
cd apps\web
npx netlify status
cd ..\..
```

The linked project must be `https://f1-demo.netlify.app` with site ID `d783914b-0638-46bc-ae4b-371b66cca51e`. The repository root is not linked, so every deploy command below also passes that fixed site ID explicitly.

Do not use credentials found in repository `.env` files. Revoke and rotate any exposed token in Netlify before deploying.

## Immutable preview and production deploy

Automatic Netlify source builds are intentionally disabled because `data/packs/seasons/` and its public mirror are generated, gitignored release inputs. Keep GitHub push webhooks and Netlify build hooks unconfigured; `[build].ignore` does not stop build-hook deploys. A source-only Netlify checkout cannot pass `check:featured`; do not weaken that gate or ingest remote telemetry during deployment.

After authentication, linkage, and all local candidate gates pass, upload the exact candidate as a draft deploy without rebuilding:

```bash
npx netlify deploy --site d783914b-0638-46bc-ae4b-371b66cca51e --no-build --json --dir "%F1_CANDIDATE_ROOT%\apps\web\out"
```

Record the returned `site_id`, `deploy_id`, and immutable `deploy_url`. The deploy ID must be 24 lowercase hexadecimal characters, the site ID must be `d783914b-0638-46bc-ae4b-371b66cca51e`, and the immutable origin must match `https://<deploy-id>--f1-demo.netlify.app`. Run all remote preview gates against that origin:

```bash
npm run release:parity -- https://<deploy-id>--f1-demo.netlify.app
npm run release:security -- https://<deploy-id>--f1-demo.netlify.app
npm run release:browser -- https://<deploy-id>--f1-demo.netlify.app
```

Only after those gates pass and the named release operator approves the evidence, publish that named atomic deploy without rebuilding or re-uploading:

```bash
npx netlify api restoreSiteDeploy --data "{\"site_id\":\"d783914b-0638-46bc-ae4b-371b66cca51e\",\"deploy_id\":\"<verified-preview-deploy-id>\"}"
```

The command is production-changing. Confirm the deploy ID and evidence path before running it. Record the returned deployment metadata and verify the canonical site names that deploy as its current production deployment. The repository does not yet write promotion data back into `release-record.json`; preserve the command output and gate evidence externally.

Bind canonical production to the verified immutable permalink:

```bash
npm run release:parity -- https://f1-demo.netlify.app --deploy-permalink https://<verified-preview-deploy-id>--f1-demo.netlify.app
npm run release:security -- https://f1-demo.netlify.app
npm run release:browser -- https://f1-demo.netlify.app
```

Canonical parity queries Netlify deployment metadata and requires the expected site, production context, ready state, non-draft deploy, canonical alias, publication timestamp, and matching immutable permalink. It compares the candidate manifest byte-for-byte at both origins, samples critical artifact hashes, MIME types, and cache policies, and verifies permanent query-preserving `/live` and `/sessions` redirects. Preserve every evidence path before clearing the candidate variable:

```bash
set F1_CANDIDATE_ROOT=
```

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

Before promotion, record a retained previous production deploy's deploy ID, immutable permalink, `releaseId`, manifest SHA-256, featured-session state, and passing evidence paths. Verify the permalink is still available under Netlify's configured retention window. Default deploy retention may be only 30 days, so the required provider rollback window plus 30 days must be confirmed rather than assumed.

To restore that exact atomic deploy, either use **Publish Deploy** on its Netlify deploy-detail page or run the named-deploy API operation from the linked site:

```bash
npx netlify api restoreSiteDeploy --data "{\"site_id\":\"d783914b-0638-46bc-ae4b-371b66cca51e\",\"deploy_id\":\"<retained-deploy-id>\"}"
```

This is a production-changing operation. Confirm the deploy ID and retained evidence before running it. Do not use `rollbackSiteDeploy` for a controlled drill because it does not name the target deploy.

After restoration, rerun canonical parity with the retained immutable permalink, then canonical security and browser gates. Record reason, operator, UTC time, restored release/deploy identities, featured state, and all new evidence paths. No retained previous release or executed rollback drill has been proven for the current baseline; ticket 25 remains blocked until both exist.
