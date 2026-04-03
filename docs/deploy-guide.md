# F1 Racing App — Deployment Guide

This guide covers deploying the F1 Racing app using your existing infrastructure:
- **Frontend**: Cloudflare Pages (recommended) or Netlify
- **Data backend**: OCI instance
- **Database**: Appwrite

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Repository: github.com/Kohnnn/f1-racing            │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────▼────────┐
        │  GitHub Actions │  ← CI/CD: lint, build, deploy
        └────────┬────────┘
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌──────────┐
│ Cloudflare│ │ Netlify │ │ OCI VM   │  ← pick one for frontend
│ Pages    │ │ (backup)│ │ (backend)│
└────┬────┘ └─────────┘ └────┬─────┘
     │                        │
     │                        ▼
     │                 ┌────────────┐
     │                 │ Appwrite DB │
     │                 └────────────┘
     ▼
┌─────────────────────────────────────┐
│  apps/web/out/  (static export)     │  ← deployed to CDN
│  ├── data/packs/  (session data)    │
│  └── models/2025/  (GLB files)     │
└─────────────────────────────────────┘
```

## IMPORTANT: Secrets Management

**Never commit secrets to Git.** All sensitive values must be:
- Stored in `.env.local` (local development only — in `.gitignore`)
- Set as environment variables in your hosting dashboard (Cloudflare/Netlify)
- Set as GitHub Actions Secrets for CI/CD

The `.env` file at the repo root contains your actual secrets — keep it local and never push it.

---

## Step 1: Clone and Install Dependencies

```bash
git clone https://github.com/Kohnnn/f1-racing.git
cd f1-racing
npm install
```

---

## Step 2: Configure Environment Variables

Copy `.env` contents to `apps/web/.env.local` (this file is gitignored):

```bash
# Appwrite Database
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=<your_project_id>
NEXT_PUBLIC_APPWRITE_DATABASE_ID=<your_database_id>
APPWRITE_API_KEY=<your_api_key>

# OCI Backend (for future server-side features)
OCI_SSH_CONNECT=<your_oci_ssh_command>

# Appwrite Collection IDs — create these in Appwrite dashboard
NEXT_PUBLIC_APPWRITE_COLLECTION_SESSIONS=<your_sessions_collection_id>
NEXT_PUBLIC_APPWRITE_COLLECTION_DRIVERS=<your_drivers_collection_id>
NEXT_PUBLIC_APPWRITE_COLLECTION_LAPS=<your_laps_collection_id>
```

### Creating Appwrite Collections

In your Appwrite dashboard:

1. Create a database named `f1_racing`
2. Create these collections with these attributes:

**sessions collection**:
- `season` (integer, required)
- `grand_prix_slug` (string, required)
- `session_slug` (string, required)
- `session_key` (integer, required, indexed)
- `track_id` (string, required)
- `date` (string, required)
- `driver_count` (integer)

**drivers collection**:
- `session_key` (integer, indexed)
- `driver_code` (string, required)
- `team` (string, required)
- `best_lap_ms` (integer)

**laps collection**:
- `session_key` (integer, indexed)
- `driver_code` (string, required)
- `lap_number` (integer, required)
- `lap_time_ms` (integer)
- `sector_1_ms` (integer)
- `sector_2_ms` (integer)
- `sector_3_ms` (integer)

---

## Step 3: Set Up OCI Backend (Optional — for future features)

Your OCI instance is already running. To use it for server-side features:

```bash
# SSH into your instance using your SSH key
ssh -i <path_to_your_ssh_key> ubuntu@<your_oci_ip>

# On the instance, install Node.js and PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pm2

# Clone the repo
git clone https://github.com/Kohnnn/f1-racing.git /opt/f1-racing
cd /opt/f1-racing
npm install --production

# Set up PM2 to keep the backend alive
pm2 start apps/web/dist/server.js --name f1-api
pm2 save
pm2 startup
```

For the backend API (future), the server entry point is `apps/web/dist/server.js` after running `npm run build`.

---

## Step 4: Ingest OpenF1 Data

The pipeline fetches live data from the OpenF1 API and generates static JSON packs.

```bash
# Ingest all 2025 sessions
npm run ingest:openf1:2025

# Ingest a specific session
npm run build:openf1:session -- --grandPrixSlug australian-grand-prix --sessionSlug qualifying

# Export replay data for a session
npm run build:openf1:replay -- --grandPrixSlug australian-grand-prix --sessionSlug qualifying
```

Generated packs land in:
- `data/packs/seasons/<season>/<grand-prix>/<session>/` — session packs
- `apps/web/public/data/packs/seasons/<season>/<grand-prix>/<session>/` — served statically

To sync data to the OCI instance for server-side serving:

```bash
# From your local machine (update with your actual SSH key path and OCI IP)
rsync -avz --exclude='node_modules' --exclude='.git' \
  -e "ssh -i <path_to_your_ssh_key>" \
  apps/web/public/data/ ubuntu@<your_oci_ip>:/var/www/f1-racing/data/
```

---

## Step 5: Build the App

```bash
# Full build (generates static export)
npm install
npm run check:data
npm run build

# The output lands in:
# apps/web/out/
```

To verify locally:

```bash
# Serve the static build
npx serve apps/web/out -l 3000

# Or use the Next.js dev server
cd apps/web && npm run dev
```

---

## Step 6: Deploy Frontend

### Option A: Cloudflare Pages (Recommended)

#### Via GitHub Actions (automatic on push)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Pages
2. Create a project → Connect to GitHub
3. Select your repo
4. Set these build settings:

| Setting | Value |
|---------|-------|
| Production branch | `main` |
| Build command | `npm install && npm run build` |
| Build output directory | `apps/web/out` |
| Root directory | (leave blank) |

5. Add environment variable: `NODE_VERSION = 20`
6. Click **Save and Deploy**

#### Environment Variables in Cloudflare Pages

Add these in Pages → Settings → Environment Variables (use your actual values from Appwrite):

```
NODE_VERSION = 20
NEXT_PUBLIC_APPWRITE_ENDPOINT = https://sgp.cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID = <your_project_id>
NEXT_PUBLIC_APPWRITE_DATABASE_ID = <your_database_id>
```

#### Verify the Deployment

After Cloudflare finishes building:

```
https://<your-project>.pages.dev/
/sessions
/cars/current-spec
/replay
```

---

### Option B: Netlify

Your app can be deployed to Netlify as a static export from `apps/web/out`.

1. Go to [app.netlify.com](https://app.netlify.com)
2. New site from Git → Connect to GitHub
3. Select your repo
4. Build settings:

| Setting | Value |
|---------|-------|
| Build command | `npm install && npm run build` |
| Publish directory | `apps/web/out` |

5. Add environment variables in Netlify dashboard only if the app actually uses them.

```
NODE_VERSION = 20
```

At the time of writing, the current frontend does not read the Appwrite variables in runtime code, so they are not required for the static deploy itself.

#### Manual Netlify CLI deploy used in production

This is the flow that successfully deployed the app on 2026-04-02.

Build first:

```bash
npm install
npm run check:data
npm run build
```

Then deploy with the token from the repo root `.env`:

```powershell
$env:NETLIFY_AUTH_TOKEN = "<your token>"
npx netlify sites:create --name "f1-racing" --account-slug "kohnnn" --disable-linking --filter "@f1-racing/web" --json
npx netlify deploy --prod --no-build --dir "C:\absolute\path\to\f1-racing\apps\web\out" --site "<site-id>" --filter "@f1-racing/web" --message "Deploy f1-racing static export" --json
```

Successful production deploy from this repo:

- site name: `f1-racing-622`
- production URL: `https://f1-racing-622.netlify.app`
- deploy permalink: `https://69ce773e819bc90ef83703ba--f1-racing-622.netlify.app`

#### Why this command shape matters

- Use `apps/web/out`, not `.next`.
- Use `--no-build` because the static export is already built locally.
- Use `--filter "@f1-racing/web"` because this is a monorepo and the Netlify CLI otherwise prompts for workspace selection.
- Use an explicit `--site <site-id>` because stale local linking or stale `.env` site IDs can cause `404` errors against dead Netlify sites.
- Use an absolute `--dir` path to avoid the CLI resolving `out` against the workspace root.

#### Known issues we hit and how to avoid them

- Root `.env` had a stale `NETLIFY_SITE_ID` that no longer resolved in the current Netlify account.
- `apps/web/.netlify/state.json` also pointed at a stale site.
- Running Netlify commands from the monorepo root without `--filter` caused an interactive workspace prompt and CLI failure.
- Passing `out` as a relative path from `apps/web` still resolved incorrectly; an absolute path was reliable.

#### Verify the deployment

After deploy, verify these routes:

```text
/
/sessions/
/cars/current-spec/
/replay/
/compare/2025/demo-weekend/qualifying/VER/NOR/
/data/manifests/latest.json
/data/manifests/seasons.json
```

The successful 2026-04-02 deploy returned `200` for all of those routes.

---

## Step 7: Set Up GitHub Actions CI/CD

Create `.github/workflows/deploy.yml` in the repo:

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm install

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_APPWRITE_ENDPOINT: ${{ vars.NEXT_PUBLIC_APPWRITE_ENDPOINT }}
          NEXT_PUBLIC_APPWRITE_PROJECT_ID: ${{ vars.NEXT_PUBLIC_APPWRITE_PROJECT_ID }}
          NEXT_PUBLIC_APPWRITE_DATABASE_ID: ${{ vars.NEXT_PUBLIC_APPWRITE_DATABASE_ID }}

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: f1-racing
          directory: apps/web/out
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

Add these secrets in GitHub → Settings → Secrets:

- `CLOUDFLARE_API_TOKEN` — from Cloudflare dashboard → Profile → API Tokens
- `CLOUDFLARE_ACCOUNT_ID` — from Cloudflare dashboard → Overview

Add these repository variables in GitHub → Settings → Variables → Actions:

- `NEXT_PUBLIC_APPWRITE_ENDPOINT` = `https://sgp.cloud.appwrite.io/v1`
- `NEXT_PUBLIC_APPWRITE_PROJECT_ID` = `<your_project_id>`
- `NEXT_PUBLIC_APPWRITE_DATABASE_ID` = `<your_database_id>`

---

## Step 8: Custom Domain

### Cloudflare Pages

1. In Cloudflare Pages → your project → Custom domains
2. Add your domain
3. Update your DNS to point to the Cloudflare Pages deployment

### Netlify

1. In Netlify → Site settings → Domain management → Add custom domain
2. Update DNS records as instructed
3. Netlify will automatically provision SSL

---

## Step 9: Update Appwrite Data (Manual or Cron)

To push ingested data to Appwrite for queryable access:

```bash
# Export a session to Appwrite
node pipeline/export/src/session-to-appwrite.mjs \
  --season 2025 \
  --grandPrix australian-grand-prix \
  --session qualifying
```

Or set up a nightly cron job on the OCI instance:

```bash
# On OCI instance
crontab -e

# Add: run ingestion every night at 2 AM
0 2 * * * cd /opt/f1-racing && npm run ingest:openf1:2025 >> /var/log/f1-ingest.log 2>&1
```

---

## Directory Reference

| Path | Purpose |
|------|---------|
| `apps/web/` | Next.js app |
| `apps/web/out/` | Built static output (deploy this) |
| `apps/web/public/data/` | Static data packs (served as `/data/`) |
| `apps/web/public/models/` | GLB 3D model files |
| `data/packs/` | Source data packs (before sync) |
| `pipeline/ingest/` | OpenF1 data ingestion scripts |
| `pipeline/export/` | Export scripts (Appwrite, replay packs) |
| `workers/metadata-api/` | Optional thin API for search/latest |
| `docs/archived/flow-2p5d/` | Archived 2.5D simulation work |

---

## Troubleshooting

### Build fails with module not found
```bash
npm install
npm run build
```

### GLB files not loading
GLBs should be in `apps/web/out/models/`. Verify your build output includes the `models/` directory.

### OpenF1 data ingestion fails
The OpenF1 API requires network access. If ingesting from OCI, ensure the instance has outbound internet access.

### Appwrite queries returning empty
Verify collection IDs in your environment variables match the actual collection IDs in the Appwrite dashboard.

### Netlify deploy fails
Run `netlify login` and ensure you have a valid auth token. Get a new token at `app.netlify.com/user/applications#personal-access-tokens`.

---

## What's Already Configured

- ✅ GitHub repo: `github.com/Kohnnn/f1-racing`
- ✅ Appwrite project at `sgp.cloud.appwrite.io/v1` — create collections and add IDs to env vars
- ✅ OCI instance at your IP — SSH key needed
- ✅ Static export pipeline: `npm run build` → `apps/web/out/`
- ✅ Data ingestion: `npm run ingest:openf1:2025`

## What You Need to Set Up

- [ ] Cloudflare Pages project (or use Netlify)
- [ ] GitHub Actions secrets for Cloudflare API token and account ID
- [ ] Appwrite collection IDs (create collections, then update env vars)
- [ ] Custom domain DNS (optional, do after first successful deploy)
