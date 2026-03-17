# IPL Fantasy League

Yahoo-style fantasy cricket platform for IPL 2026. Snake and auction drafts, real-time WebSocket draft room, invite-code join flow.

**Stack:** FastAPI + PostgreSQL + Redis (backend) · Lit + Vite + Vaadin Router (frontend)

---

## Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16 running natively on port 5432 (e.g. `brew services start postgresql@16`)
- Redis 7 running natively on port 6379 (e.g. `brew services start redis`)

> Docker is not used. Run Postgres and Redis directly via Homebrew or your system package manager.

---

## Setup

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET to something random
```

### Backend

```bash
cd backend
pip install -e ".[dev]"
alembic upgrade head
```

### Frontend

```bash
cd frontend
npm install
```

---

## Running

### Kill anything already on the ports

```bash
# Kill processes on backend (8000) and frontend (5173) ports
lsof -ti :8000 | xargs kill -9 2>/dev/null; lsof -ti :5173 | xargs kill -9 2>/dev/null
```

Or individually:

```bash
lsof -ti :8000 | xargs kill -9   # backend
lsof -ti :5173 | xargs kill -9   # frontend
```

### Start the backend

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

### Start the frontend

```bash
cd frontend
npm run dev
```

### Open the app

| URL                        | What                  |
|----------------------------|-----------------------|
| http://localhost:5173      | Frontend              |
| http://localhost:8000/docs | Backend API (Swagger) |
| http://localhost:8000/api/health | Health check   |

---

## Database

```bash
cd backend

# Apply all pending migrations
alembic upgrade head

# Generate a new migration after model changes
alembic revision --autogenerate -m "describe_change"

# Check current migration state
alembic current

# psql into the database
psql postgresql://ipl:ipl_secret@localhost:5432/ipl_fantasy
```

---

## Tests

```bash
cd backend
pytest -v
```

---

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── models/       # SQLAlchemy models (User, Season, Team, League…)
│   │   ├── routers/      # FastAPI route handlers
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic (auth, snake draft)
│   │   ├── ws/           # WebSocket handlers (draft room)
│   │   ├── deps.py       # Dependencies (get_current_user, get_current_admin)
│   │   └── main.py       # App entrypoint
│   └── migrations/       # Alembic migrations
├── frontend/
│   └── src/
│       ├── components/   # nav-bar (auth-aware)
│       ├── pages/        # page-home, page-league, page-join, page-my-leagues,
│       │                 # page-admin-create, page-season, page-snake-draft…
│       ├── services/     # api.ts, auth.ts (getMe/isAdmin/guardRoute), ws.ts
│       └── app-shell.ts  # Router + shell
├── seed-data/
│   └── ipl_2026_players.csv
├── .env.example
└── README.md
```

---

## Key User Flows

| Role   | Flow                                                                                   |
|--------|----------------------------------------------------------------------------------------|
| Admin  | Login → `/admin/create` → Create League → Create Season → Copy invite code            |
| Player | Register → `/join` → Enter invite code + team name → Wait for draft                   |
| Both   | `/league/:id` → Home tab (leaderboard) or Draft Room tab → Enter Draft Room           |

---

## Phase 2

See [brainstorm/2026-03-11-season-admin-rules-brainstorm.md](brainstorm/2026-03-11-season-admin-rules-brainstorm.md) for planned extended draft rules, season settings, and WebSocket admin controls.
