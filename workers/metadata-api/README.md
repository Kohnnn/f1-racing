# metadata-api

Optional Cloudflare Worker for tiny metadata endpoints.

Free-tier intent:

- keep the main app static on Cloudflare Pages
- keep large telemetry packs on static/CDN paths
- use this Worker only for small manifest and search endpoints
- do not proxy full telemetry or large data blobs through the Worker

Routes:

- `/api/latest`
- `/api/search?q=...`
- `/api/health`

Required variable:

- `ASSET_ORIGIN` - public base URL for the deployed static site or asset host
