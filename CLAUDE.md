# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yahoo-style fantasy cricket platform for IPL 2026. Snake and auction drafts, real-time WebSocket draft room, invite-code join flow.

**Stack:** FastAPI + PostgreSQL + Redis (backend) · Lit + Vite + Vaadin Router (frontend)

---

## Development Commands

### Prerequisites

- Python 3.12+, Node.js 20+
- PostgreSQL 16 on port 5432 (`brew services start postgresql@16`)
- Redis 7 on port 6379 (`brew services start redis`)

### Setup

```bash
cp .env.example .env        # set JWT_SECRET to something random

# Backend
cd backend && pip install -e ".[dev]" && alembic upgrade head

# Frontend
cd frontend && npm install
```

### Running

```bash
# Kill conflicting processes first (if needed)
lsof -ti :8000 | xargs kill -9 2>/dev/null; lsof -ti :5173 | xargs kill -9 2>/dev/null

# Backend (port 8000)
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend (port 5173)
cd frontend && npm run dev
```

| URL | Purpose |
|-----|---------|
| http://localhost:5173 | Frontend SPA |
| http://localhost:8000/docs | Swagger API docs |
| http://localhost:8000/api/health | Health check |

### Tests & Migrations

```bash
cd backend
pytest -v                                              # Run all tests
pytest -v tests/test_foo.py::test_bar                 # Run single test

alembic upgrade head                                   # Apply migrations
alembic revision --autogenerate -m "describe_change"  # New migration
alembic current                                        # Check state

psql postgresql://ipl:ipl_secret@localhost:5432/ipl_fantasy  # DB shell
```

### Build

```bash
cd frontend && npm run build   # TypeScript + Vite → dist/
```

---

## Architecture

### Backend (`backend/app/`)

FastAPI with full async/await using SQLAlchemy 2.0 `AsyncSession`.

- **`main.py`** — App entrypoint, CORS middleware, lifespan (creates async engine + sessionmaker, closes on shutdown)
- **`deps.py`** — FastAPI `Depends` injectors: `get_db`, `get_current_user` (HTTPBearer → JWT decode), `get_current_admin`
- **`models/`** — SQLAlchemy ORM. `base.py` has `UUIDMixin` and `TimestampMixin` used by all models.
- **`schemas/`** — Pydantic request/response models (separate from ORM models)
- **`routers/`** — Route handlers, one file per domain
- **`services/auth_service.py`** — Password hashing (bcrypt), JWT creation, user registration
- **`services/snake_draft_service.py`** — Core draft engine: `get_draft_state()`, `make_pick()`, `undo_last_pick()`, `calculate_snake_turn()`
- **`ws/manager.py`** — WebSocket connection manager tracking connected clients per draft room (backed by Redis)
- **`ws/snake_ws.py`** — WebSocket endpoint handler; validates JWT from query param, routes typed JSON messages

### Frontend (`frontend/src/`)

Lit Web Components SPA with Vaadin Router.

- **`app-shell.ts`** — Router setup; all routes defined here
- **`services/api.ts`** — HTTP client (fetch-based); all API calls go through here
- **`services/auth.ts`** — `getMe()`, `isAdmin()`, `guardRoute()` (redirects to `/login?redirect=...` if unauthenticated); token in localStorage, user cached in sessionStorage
- **`services/ws.ts`** — `DraftWebSocket` class; auto-reconnects every 3 seconds
- **`pages/`** — One Lit element per page/route
- **`components/`** — Reusable elements (`nav-bar`, `csv-uploader`)

### Communication

- **REST**: Frontend calls `/api/*` → Vite dev proxy (dev) or Nginx (prod) → backend port 8000
- **WebSocket**: `/ws/draft/{season_id}?token={jwt}` — JWT auth via query param (not header, WS limitation)
- **Auth**: Bearer JWT (24hr expiry), HS256, payload `{ sub, email, exp }`

### Snake Draft Engine

Odd rounds (1, 3, 5…) pick in ascending `draft_position` order; even rounds reverse (snake back). Admin-only WebSocket actions: `force_pick`, `undo_last_pick`, `admin_pause_draft`, `admin_resume_draft`, `admin_reset_timer`.

### Database

PostgreSQL 16, Alembic migrations in `backend/migrations/versions/`. Key enums:
- `DraftFormat`: `snake` | `auction`
- `SeasonStatus`: `setup` | `drafting` | `active` | `completed` | `archived`

`draft_config` on `Season` is a JSONB column storing draft rules (timer, paused state, etc.).

### Deployment

Railway deployment: backend runs `alembic upgrade head && uvicorn ...`, frontend builds then serves via Nginx (proxies `/api` and `/ws` to backend). Config in `backend/railway.toml` and `frontend/railway.toml`. Docker Compose available for local containerized runs (`make up`).
