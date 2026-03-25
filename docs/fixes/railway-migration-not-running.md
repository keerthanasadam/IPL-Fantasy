---
title: "Railway Deployment: Migrations Not Running (DATABASE_URL_SYNC defaults to localhost)"
type: fix
status: active
date: 2026-03-25
---

# Railway Deployment: Migrations Not Running

## Symptom

After deploying a new migration to Railway, the app crashes or returns 503 on endpoints that use the new column/table. In this case: `GET /api/seasons/{id}/rosters` → 503, because the `points` column added in migration `b3c5d7e9f1a2` was never applied to the Railway database.

The deployment log shows:
```
Alembic timed out or failed, skipping
```

---

## Root Cause

There are **two separate bugs** compounding each other.

### Bug 1 — `DATABASE_URL_SYNC` is never set on Railway

Railway injects a single env var: `DATABASE_URL`. The app has **two** database URL settings:

| Setting | Default in `config.py` | Set by Railway? |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://localhost/...` | ✅ Yes |
| `DATABASE_URL_SYNC` | `postgresql://ipl:ipl_secret@localhost:5432/ipl_fantasy` | ❌ No |

`DATABASE_URL_SYNC` is never set in Railway's environment, so it keeps its **localhost default**.

Alembic's `env.py` uses it on line 12:
```python
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC)
```

And `run_migrations_online()` reads from that config option — so **every migration run on Railway connects to localhost, not Railway's Postgres**.

### Bug 2 — `start.sh` silently swallows migration failure

```sh
timeout 60 alembic upgrade head || echo 'Alembic timed out or failed, skipping'
exec uvicorn app.main:app ...
```

When the connection to localhost times out after 60 seconds, the shell prints a warning and **starts the app anyway** — against the correct Railway DB that still has the old schema. The app then crashes when it hits a column that doesn't exist.

---

## The Fix

### Fix `config.py` — always derive `DATABASE_URL_SYNC` from `DATABASE_URL`

Remove `DATABASE_URL_SYNC` as an independent configurable field. Instead, always derive it from `DATABASE_URL` in the validator. This way Railway only needs to set `DATABASE_URL` and both URLs are correct automatically.

**`backend/app/config.py`** — change:

```python
# BEFORE
class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://ipl:ipl_secret@localhost:5432/ipl_fantasy"
    DATABASE_URL_SYNC: str = "postgresql://ipl:ipl_secret@localhost:5432/ipl_fantasy"
    ...

    @model_validator(mode="after")
    def fix_database_urls(self) -> "Settings":
        if self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        if self.DATABASE_URL_SYNC.startswith("postgresql+asyncpg://"):
            self.DATABASE_URL_SYNC = self.DATABASE_URL_SYNC.replace(
                "postgresql+asyncpg://", "postgresql://", 1
            )
        return self
```

```python
# AFTER
class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://ipl:ipl_secret@localhost:5432/ipl_fantasy"
    DATABASE_URL_SYNC: str = ""   # always derived below; Railway must NOT set this
    ...

    @model_validator(mode="after")
    def fix_database_urls(self) -> "Settings":
        # Ensure async URL uses asyncpg driver
        if self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        # Always derive sync URL from the (now-fixed) async URL
        self.DATABASE_URL_SYNC = self.DATABASE_URL.replace(
            "postgresql+asyncpg://", "postgresql://", 1
        )
        return self
```

### Fix `start.sh` — exit on migration failure instead of silently skipping

```sh
# BEFORE
timeout 60 alembic upgrade head || echo 'Alembic timed out or failed, skipping'
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}

# AFTER
set -e
timeout 60 alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

With `set -e` the container will fail to start (crash loop) rather than boot with a broken schema. Railway will surface the error in the deploy logs instead of silently serving 503s.

---

## Why This Wasn't Caught Earlier

- Migrations that ran before the `points` column was added had already succeeded (possibly when `DATABASE_URL_SYNC` was set correctly, or before Railway was in use).
- The silent `|| echo` skip made it look like startup succeeded.
- The 503 only appeared on routes that actually query the `points` column, not on all routes — so the app appeared partially healthy.

---

## Applying the Pending Migration on Railway

After deploying the fix, the `b3c5d7e9f1a2` migration (`add_points_to_players`) will run automatically on the next deploy. No manual intervention needed — Alembic tracks the current head in the `alembic_version` table and will apply only the missing revision.

---

## Files to Change

| File | Change |
|---|---|
| `backend/app/config.py` | Derive `DATABASE_URL_SYNC` from `DATABASE_URL` in validator |
| `backend/start.sh` | Add `set -e`; remove `\|\| echo` fallback |
