# F1 Racing Backend

FastAPI service for replay/session/team data, built for OCI or any small VM/container host.

## Run locally

```bash
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8080
```

Or from the repo root:

```bash
npm run api:dev
```

## Frontend wiring

Set this at frontend build time so the static web app calls the backend instead of fetching static JSON directly:

```bash
NEXT_PUBLIC_F1_API_ORIGIN=https://your-oci-api.example.com
```

## CORS

The backend reads either:

```bash
F1_CORS_ALLOWED_ORIGINS=https://your-netlify-site.netlify.app,http://localhost:3000
```

or the existing fallback variable already present in the repo:

```bash
VLEGAL_CORS_ALLOWED_ORIGINS=https://your-netlify-site.netlify.app,http://localhost:3000
```

## Implemented endpoints

- `GET /health`
- `GET /api/latest`
- `GET /api/search?q=...`
- `GET /api/teams/{team_id}`
- `GET /api/sessions/{season}/{grand_prix}/{session}/manifest`
- `GET /api/sessions/{season}/{grand_prix}/{session}/summary`
- `GET /api/sessions/{season}/{grand_prix}/{session}/drivers`
- `GET /api/sessions/{season}/{grand_prix}/{session}/laps`
- `GET /api/sessions/{season}/{grand_prix}/{session}/strategy`
- `GET /api/sessions/{season}/{grand_prix}/{session}/stints`
- `GET /api/sessions/{season}/{grand_prix}/{session}/compare/{compare_key}`
- `GET /api/replay/{season}/{grand_prix}/{session}/meta`
- `GET /api/replay/{season}/{grand_prix}/{session}/full`
- `GET /api/replay/{season}/{grand_prix}/{session}/chunk/{chunk_index}`
- `GET /api/live/status`
- `WS /ws/replay/{season}/{grand_prix}/{session}`
- `WS /ws/live/{season}/{grand_prix}/{session}`

## WebSocket messages

Supported client messages:

```json
{ "type": "ping" }
{ "type": "meta" }
{ "type": "chunk", "index": 0 }
{ "type": "seek", "time": 600 }
```

The live socket is server-driven and streams replay frames as a simulated live feed. Use the optional query param:

```bash
ws://host/ws/live/2025/abu-dhabi-grand-prix/race?speed=8
```
