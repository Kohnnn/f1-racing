# OCI Deploy And Redeploy

This document explains how to deploy and redeploy the `f1-racing` backend on OCI without exposing your SSH key or secrets.

It assumes:

- Your local `.env` already contains `OCI_SSH_CONNECT`
- The OCI VM already has Docker and the shared Caddy proxy running
- The frontend lives on Netlify
- The backend public URL is currently `https://f1-api.129.150.58.64.sslip.io`

## Files used for OCI deploy

- `backend/` - FastAPI app
- `data/` - replay/session/team data served by the API
- `deploy/oci/docker-compose.f1-racing-api.yml` - OCI compose stack
- `deploy/oci/f1-racing-api.env.example` - backend env template
- `deploy/oci/f1-racing-api.service` - systemd wrapper for cleaner restart/log handling
- `deploy/oci/Caddyfile.f1-racing-api.snippet` - HTTPS reverse proxy host block

## Important paths on OCI

- App root: `/srv/f1-racing-api/current`
- Compose file: `/srv/f1-racing-api/current/deploy/oci/docker-compose.f1-racing-api.yml`
- Env file: `/srv/f1-racing-api/current/deploy/oci/f1-racing-api.env`
- Systemd unit: `/etc/systemd/system/f1-racing-api.service`
- Shared Caddy config: `/srv/vnibb/deployment/Caddyfile`

## Load the OCI SSH command locally

Do not paste your private key into docs or scripts.

PowerShell:

```powershell
$ociSsh = ((Get-Content ".env") | Where-Object { $_ -match '^OCI_SSH_CONNECT=' } | Select-Object -First 1).Split('=', 2)[1]
```

Then run remote commands with:

```powershell
Invoke-Expression "$ociSsh 'uname -a'"
```

## First deploy on OCI

### 1. Create the deploy archive locally

From repo root:

```powershell
tar.exe -czf "$env:TEMP\f1-racing-api-deploy.tgz" backend data\manifests data\packs data\teams deploy\oci
```

### 2. Prepare the target directory on OCI

```powershell
Invoke-Expression "$ociSsh 'sudo mkdir -p /srv/f1-racing-api/current && sudo chown -R ubuntu:ubuntu /srv/f1-racing-api'"
```

### 3. Upload the archive

```powershell
& scp $env:TEMP\f1-racing-api-deploy.tgz ($ociSsh -replace '^ssh ', '')":/srv/f1-racing-api/f1-racing-api-deploy.tgz"
```

If that `scp` form is awkward on your machine, use the same SSH key and host from `OCI_SSH_CONNECT` manually.

### 4. Extract the archive on OCI

```powershell
Invoke-Expression "$ociSsh 'rm -rf /srv/f1-racing-api/current/* && tar -xzf /srv/f1-racing-api/f1-racing-api-deploy.tgz -C /srv/f1-racing-api/current'"
```

### 5. Create the backend env file

Start from the example file:

```powershell
Invoke-Expression "$ociSsh 'cp /srv/f1-racing-api/current/deploy/oci/f1-racing-api.env.example /srv/f1-racing-api/current/deploy/oci/f1-racing-api.env'"
```

Current minimum value:

```text
F1_CORS_ALLOWED_ORIGINS=https://playful-peony-77899c.netlify.app,http://localhost:3000
```

Update this when your frontend domain changes.

### 6. Install the systemd unit

```powershell
Invoke-Expression "$ociSsh 'sudo cp /srv/f1-racing-api/current/deploy/oci/f1-racing-api.service /etc/systemd/system/f1-racing-api.service && sudo systemctl daemon-reload && sudo systemctl enable --now f1-racing-api'"
```

This unit wraps Docker Compose so you can restart the backend with `systemctl` and inspect logs cleanly.

### 7. Add the HTTPS proxy host in Caddy

Append the snippet once:

```powershell
Invoke-Expression "$ociSsh 'python3 - <<\"PY\"
from pathlib import Path
caddy = Path("/srv/vnibb/deployment/Caddyfile")
snippet = Path("/srv/f1-racing-api/current/deploy/oci/Caddyfile.f1-racing-api.snippet").read_text()
content = caddy.read_text()
if "f1-api.129.150.58.64.sslip.io" not in content:
    caddy.write_text(content.rstrip() + "\n\n" + snippet.rstrip() + "\n")
PY
docker restart vnibb-caddy'"
```

Because the existing Caddy container runs with `admin off`, a restart is the safe way to reload config.

### 8. Verify the deployment

From your local machine:

```powershell
curl.exe https://f1-api.129.150.58.64.sslip.io/health
curl.exe https://f1-api.129.150.58.64.sslip.io/api/live/status
```

Optional WebSocket verification:

```powershell
python -c "exec('import asyncio\nimport json\nimport websockets\nasync def main():\n    async with websockets.connect(\'wss://f1-api.129.150.58.64.sslip.io/ws/replay/2025/abu-dhabi-grand-prix/race\') as ws:\n        first = json.loads(await ws.recv())\n        print(first.get(\'type\'))\nasyncio.run(main())')"
```

## Backend-only redeploy

Use this when you changed backend code or data and want to push a new OCI build.

### 1. Recreate and upload the archive

```powershell
tar.exe -czf "$env:TEMP\f1-racing-api-deploy.tgz" backend data\manifests data\packs data\teams deploy\oci
```

Upload and extract again:

```powershell
Invoke-Expression "$ociSsh 'rm -rf /srv/f1-racing-api/current/* && tar -xzf /srv/f1-racing-api/f1-racing-api-deploy.tgz -C /srv/f1-racing-api/current'"
```

### 2. Restart via systemd

```powershell
Invoke-Expression "$ociSsh 'sudo systemctl restart f1-racing-api'"
```

If the compose file changed significantly:

```powershell
Invoke-Expression "$ociSsh 'sudo systemctl daemon-reload && sudo systemctl restart f1-racing-api'"
```

### 3. Check status and logs

```powershell
Invoke-Expression "$ociSsh 'sudo systemctl status f1-racing-api --no-pager'"
Invoke-Expression "$ociSsh 'sudo journalctl -u f1-racing-api -n 200 --no-pager'"
Invoke-Expression "$ociSsh 'docker logs --tail 200 f1-racing-api'"
```

## Frontend redeploy after OCI backend changes

If the frontend bundle needs to point at the OCI API:

### 1. Ensure Netlify env is set

```powershell
npx netlify env:set NEXT_PUBLIC_F1_API_ORIGIN https://f1-api.129.150.58.64.sslip.io --site <your-site-id>
```

### 2. Build locally with the OCI API origin

```powershell
$env:NEXT_PUBLIC_F1_API_ORIGIN='https://f1-api.129.150.58.64.sslip.io'
npm run build
```

### 3. Deploy the static export

```powershell
npx netlify deploy --prod --no-build --dir=apps/web/out --site <your-site-id> --filter @f1-racing/web
```

## Useful OCI operations

### Service status

```powershell
Invoke-Expression "$ociSsh 'sudo systemctl status f1-racing-api --no-pager'"
```

### Restart backend

```powershell
Invoke-Expression "$ociSsh 'sudo systemctl restart f1-racing-api'"
```

### Follow service logs

```powershell
Invoke-Expression "$ociSsh 'sudo journalctl -u f1-racing-api -f'"
```

### Follow container logs

```powershell
Invoke-Expression "$ociSsh 'docker logs -f f1-racing-api'"
```

### Check compose state

```powershell
Invoke-Expression "$ociSsh 'cd /srv/f1-racing-api/current && docker compose -f deploy/oci/docker-compose.f1-racing-api.yml ps'"
```

### Restart Caddy after host changes

```powershell
Invoke-Expression "$ociSsh 'docker restart vnibb-caddy'"
```

## Troubleshooting

### Caddy host works locally inside OCI but not publicly

- Check Oracle ingress rules for ports `80` and `443`
- Confirm the host block exists in `/srv/vnibb/deployment/Caddyfile`
- Restart `vnibb-caddy`

### Backend container starts but API fails

- `docker logs f1-racing-api`
- confirm `/srv/f1-racing-api/current/data/...` exists
- confirm `F1_CORS_ALLOWED_ORIGINS` is valid

### Frontend still uses static fallback mode

- verify `NEXT_PUBLIC_F1_API_ORIGIN` is set in Netlify
- rebuild and redeploy the frontend after changing the env var
- inspect built bundle for `https://f1-api.129.150.58.64.sslip.io`

## Secrets and key safety

- Do not commit your private SSH key
- Do not commit `.env`
- Do not paste the full `OCI_SSH_CONNECT` value into docs, screenshots, or issues
- Keep the server-side env file on OCI only: `/srv/f1-racing-api/current/deploy/oci/f1-racing-api.env`
