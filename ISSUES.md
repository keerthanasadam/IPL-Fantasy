# Known Issues & Fixes

## Fixed

### API 503 / "Failed to fetch" on all proxy requests
**Date fixed:** 2026-03-23
**Symptom:** All `/api/*` calls from the frontend returned 503 or `Failed to fetch` network errors. Direct calls to `ipl-fantasy-backend.up.railway.app` worked fine.
**Root cause:** `BACKEND_URL` was set to `http://` but Railway's public domain requires HTTPS. nginx was trying to proxy over HTTP, the connection failed before any HTTP response was returned.
**Fix:**
1. `frontend/nginx.conf` — added `proxy_ssl_server_name on` (SNI for Railway's TLS routing) and changed `proxy_set_header Host` from `$host` to `$proxy_host` so the upstream sees its own hostname.
2. Railway Frontend Service variable `BACKEND_URL` changed from `http://ipl-fantasy-backend.up.railway.app` → `https://ipl-fantasy-backend.up.railway.app`.

---

## Open

_None currently tracked._
