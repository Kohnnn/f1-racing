# Vercel Deploy Attempt - 2026-04-29

## Status

The app is Vercel-ready, but deployment from this machine is blocked by Vercel authentication.

## Completed

- Added root `vercel.json`.
- Configured Vercel to build the monorepo static export:
  - build command: `npm run build`
  - output directory: `apps/web/out`
  - install command: `npm install`
  - public API origin: `https://f1-api.129.150.58.64.sslip.io`
- Updated `docs/deploy-guide.md` with Vercel deployment instructions.
- Ran `npm run build` successfully from repo root.

## Deploy Blocker

`vercel deploy --prebuilt -y` failed with:

```text
Error: The specified token is not valid. Use `vercel login` to generate a new token.
```

No `VERCEL_TOKEN` environment variable was present.

## Finish Deploy

Run from `f1-racing/` after authenticating:

```powershell
vercel login
npm run build
vercel deploy --prebuilt -y
```

For production, after confirming the preview:

```powershell
vercel deploy --prod --prebuilt -y
```

If using a dashboard/import deployment, use these settings:

```text
Framework: Next.js
Build command: npm run build
Output directory: apps/web/out
Install command: npm install
Environment variable: NEXT_PUBLIC_F1_API_ORIGIN=https://f1-api.129.150.58.64.sslip.io
```

Do not add private values from `.env` such as Appwrite API keys, Netlify tokens, or OCI SSH commands as public frontend variables.
