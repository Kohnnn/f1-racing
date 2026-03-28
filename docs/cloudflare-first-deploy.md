# Cloudflare First Deploy

Use this guide when you want the fastest realistic deployment of `f1-racing` on Cloudflare.

Recommended first release shape:

- `Cloudflare Pages` for the static site
- no `R2` yet unless you already need large external asset storage
- no `Worker` yet unless you want `/api/latest`, `/api/search`, and `/api/health`

That keeps the first release simple and matches the repo's static-first setup.

## What this repo already supports

- static export from `apps/web`
- output directory: `apps/web/out`
- optional Worker scaffold in `workers/metadata-api`

## Fastest path

1. build the site locally
2. create a Cloudflare Pages project
3. point Pages at this repo or upload the build output
4. verify the core routes
5. add the optional Worker later only if you actually need it

## Before you start

You need:

- a Cloudflare account
- this repo working locally
- Node.js installed

Optional but useful:

- `wrangler` auth for CLI checks and Worker deploys

Check CLI auth with:

```bash
npx wrangler whoami
```

If that is not authenticated yet, sign in with:

```bash
npx wrangler login
```

## Step 1: build locally

From `f1-racing`:

```bash
npm install
npm run check:data
npm run build
```

This should produce:

- `apps/web/out`

That folder is the Pages deployment output.

## Step 2: choose how to deploy Pages

You have two good options.

### Option A: Git-connected Pages project

Use this if you want Cloudflare to rebuild on every push.

In Cloudflare Pages:

1. create a new Pages project
2. connect your GitHub repository
3. use these build settings:

- build command: `npm install && npm run build`
- build output directory: `apps/web/out`
- root directory: `f1-racing` only if your connected repository root is the parent workspace; leave it blank if this repo itself starts at `f1-racing`

If Cloudflare asks for framework preset, use a custom static build if needed. The important part is the output directory.

### Option B: direct upload

Use this if you want the simplest first publish without wiring Git integration yet.

Build locally, then upload:

- `apps/web/out`

to a new Pages project through the Pages dashboard.

## Step 3: first-release recommendation

For the first public version, keep it simple:

- serve `data`, `models`, and `posters` directly from Pages static assets
- skip `R2` until you really need larger or more frequently updated pack storage
- skip the Worker until you want search or tiny metadata endpoints

This works well because the app is already configured for static export.

## Step 4: verify the deployed site

After Pages finishes, open and test:

- `/`
- `/sessions`
- `/sessions/2025/australian-grand-prix/qualifying`
- `/compare/2025/australian-grand-prix/qualifying/NOR/PIA`
- `/cars/current-spec`
- `/sims/wind`

Check especially:

- charts render
- `model-viewer` loads the GLBs
- static data requests under `/data/...` succeed
- routes load with trailing slashes

## Step 5: custom domain

After the Pages site works on `*.pages.dev`, add your custom domain in Cloudflare Pages.

Do this only after the default deployment is healthy.

## Optional Step 6: enable the Worker

Only do this if you want the small metadata/search API.

Worker location:

- `workers/metadata-api`

The Worker is intentionally tiny. It should not serve large telemetry packs.

### Set the asset origin

The Worker needs the deployed static site's base URL.

Set:

- `ASSET_ORIGIN=https://your-pages-site.pages.dev`

or your final custom domain.

### Validate the Worker locally

From `f1-racing`:

```bash
npm run cloudflare:whoami
npm run worker:check
```

### Deploy the Worker

From `f1-racing`:

```bash
npm run worker:deploy
```

Then verify:

- `/api/health`
- `/api/latest`
- `/api/search?q=norris`

## Optional Step 7: move heavy assets to R2 later

Do this later, not on day one, if:

- GLBs grow too large
- pack files become numerous
- you want separate asset versioning from Pages deploys

Good candidates for `R2` later:

- telemetry packs
- CFD packs
- large GLBs
- posters and future replay assets

At that point:

1. create the bucket
2. upload versioned files
3. point manifests or `ASSET_ORIGIN` to the new asset host

## Common mistakes

- deploying the repo root instead of `apps/web/out`
- trying to use the Worker for large pack delivery
- introducing mutable asset names without a versioning strategy
- forgetting that current GLBs are large and may need optimization later

## What you still need to provide

I cannot do these parts without your Cloudflare account access:

- Cloudflare login
- Pages project creation
- custom domain attachment
- Worker production env var values
- any later `R2` bucket and public asset URL decisions

## Recommended first deploy today

If you want the lowest-friction path today, do exactly this:

```bash
npm install
npm run check:data
npm run build
```

Then:

1. create a Pages project
2. deploy `apps/web/out`
3. test the main routes
4. leave `R2` and the Worker for a second pass
