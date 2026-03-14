# IPL Fantasy League — Frontend UX Flow Brainstorm

> Captured: 2026-03-10
> Stack: Lit + Vaadin Router (TypeScript), FastAPI + SQLAlchemy (Python)
> Decisions locked in from review session

---

## Clarified Decisions

| Question | Decision |
|---|---|
| Admin detection | Add explicit `is_admin: bool` flag to `User` model |
| Multi-league | YES — future leagues (World Cup, etc.); keep `My Leagues` / multi-league flow |
| Leaderboard data | Excel/CSV import of scores → powers leaderboard (separate import flow, TBD) |
| Invite code | Generated on **Season** creation (not League). Admin shares season code. |
| Terminology | Users **join a Season** (not a league). "Join Season" is the correct action. |
| Team creation on join | `POST /seasons/join` auto-creates a Team owned by the joining user |

---

## Data Model (Hierarchy)

```
User
 └── is_admin: bool (NEW)

League  (e.g., "IPL", "World Cup")
 └── commissioner: User
 └── seasons: [Season]

Season  (e.g., "IPL 2026", "WC 2027")
 └── league: League
 └── invite_code: str (NEW — generated on creation, unique)
 └── teams: [Team]
 └── players: [Player]  ← CSV import

Team  (one per user per season)
 └── owner: User (nullable → claimed via join)
 └── name: str
 └── draft_position: int
 └── points: Decimal (NEW — updated via score import)
```

---

## Required Backend Changes

### 1. User model — add `is_admin`
```python
# app/models/user.py
is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
```
- Migration required
- Seed the first user or manually set via DB/admin script
- `GET /api/auth/me` response must include `is_admin`

### 2. Season model — add `invite_code`
```python
# app/models/season.py
invite_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=True, index=True)
```
- Generated on `POST /leagues/:id/seasons` — short alphanumeric, e.g. `IPL26-XKFM`
- Must be unique across all seasons
- Migration required

### 3. Team model — add `points`
```python
# app/models/team.py
points: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)
```
- Updated by future score import endpoint
- Migration required

### 4. Change `create_season` — do NOT auto-create teams
Currently, `POST /leagues/:id/seasons` creates N empty teams upfront. With the join-by-code flow, users create their own team when they join. Remove the auto-create loop. Only the admin's team (if they want to play) is created when they explicitly join.

### 5. New endpoint: `POST /api/seasons/join`
```
Body: { invite_code: str, team_name: str }
Auth: required
Response: { team, season, league }
Errors:
  - 404 if invite_code not found
  - 400 if season is not in SETUP status (joining closed once draft starts)
  - 400 if user already has a team in this season
  - 400 if season.teams.count >= season.team_count (season full)
```
Creates a new `Team` with `owner_id = current_user`, `draft_position = current_count + 1` (temporary; randomized before draft starts).

### 6. New endpoint: `GET /api/seasons/mine`
Returns all seasons where the current user owns a team (plus their team info).
```
Response: [{ season, league, team }]
```
Used by `My Leagues` page to list user's active seasons across all leagues.

### 7. New endpoint: `GET /api/leagues/mine`
Returns all leagues where the user is commissioner OR has a team in any season.
```
Response: [{ league, user_role: "commissioner" | "member", seasons: [...] }]
```

### 8. `GET /api/auth/me` — add `is_admin` to response
```json
{ "user_id": "...", "email": "...", "display_name": "...", "is_admin": true }
```

---

## Screen Flows

### Home Page — Not Logged In (`/`)

**Navbar:** `[IPL Fantasy]` · `[Home]` · `[Join Season]` · `[Login]` · `[Register]`

**Page:**
- Hero banner with IPL branding
- League cards fetched from `GET /api/leagues/public` (new, no auth) OR statically rendered
  - Each card: League name, active season name, player count, status
  - `[Play Now]` button → `/login?redirect=/`
- Since it's a known-league app, can statically show "IPL Fantasy Draft" with CTA

---

### Home Page — Logged In (`/`)

After login, `page-home.ts` detects auth state and shows action cards:

**Regular user:**
```
┌──────────────────────────────────┐
│  🔑  Join a Season               │
│  Enter an invite code to join    │
│  a league season and draft       │
│                                  │
│     [Join with Code]             │
└──────────────────────────────────┘
```

**Admin user (`is_admin: true`):**
```
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│  🔑  Join a Season               │  │  ⚡  Create League / Season       │
│  Enter an invite code to join    │  │  Set up a new league and season  │
│  a league season and draft       │  │  then share the invite code      │
│                                  │  │                                  │
│     [Join with Code]             │  │     [Create League]              │
└──────────────────────────────────┘  └──────────────────────────────────┘
```

---

### Join Season (`/join` or modal on home page)

**Trigger:** Navbar `[Join Season]` or home page card `[Join with Code]`
**Auth:** Required — redirect to login if not authenticated

**Form:**
```
┌────────────────────────────────────────┐
│  ← Back                                │
│                                        │
│  Join a Season                         │
│  ─────────────────────────────────     │
│                                        │
│  Invite Code *                         │
│  [________________________]            │
│                                        │
│  Team Name *                           │
│  [________________________]            │
│                                        │
│  [   Join Season   ]                   │
│                                        │
│  On success → redirect to /league/:id  │
└────────────────────────────────────────┘
```

**API call:** `POST /api/seasons/join` `{ invite_code, team_name }`
**On success:** Navigate to league home `/league/:leagueId`

---

### Admin: Create League Flow

**Trigger:** Admin clicks "Create League" card
**Options:**
- Option A: Full page `/admin/create-league`
- Option B: Multi-step modal

**Step 1 — Create League:**
```
League Name: [IPL Fantasy 2026]
[Create League]
```
API: `POST /api/leagues` `{ name }`

**Step 2 — Create Season (within that league):**
```
Season Label:    [IPL 2026]
Draft Format:    [Snake ▾]
Max Teams:       [8]
Draft Rounds:    [15]
[Create Season]
```
API: `POST /api/leagues/:id/seasons`
**On success:** Show the generated invite code prominently:
```
┌─────────────────────────────────────────┐
│  ✅ Season Created!                     │
│                                         │
│  Invite Code:  IPL26-XKFM              │
│  Share this with participants           │
│                                         │
│  [Copy Code]   [Go to Season]           │
└─────────────────────────────────────────┘
```

---

### My Leagues (`/my-leagues`)

**Nav:** `[My Leagues]` visible to all logged-in users
**API:** `GET /api/leagues/mine`

```
My Leagues
────────────────────────────────────────────────

┌─────────────────────────────────────────────┐
│  IPL Fantasy                    [League]    │
│  ───────────────────────────────────────    │
│  📅 IPL 2026          Status: SETUP         │
│  👤 My Team: Warriors  Position: #3         │
│  👥 6/8 teams joined                        │
│                         [Go to Season →]    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  World Cup (coming soon)                    │
│  No active season yet                       │
└─────────────────────────────────────────────┘
```

---

### League / Season Home (`/league/:leagueId`)

**Simplified layout — 2 sections only:**

```
┌─────────────────────────────────────────────────────┐
│  IPL Fantasy  >  IPL 2026            SETUP badge    │
│  ─────────────────────────────────────────────────  │
│  Sub-nav: [🏠 Home]  [⚡ Draft Room]               │
│           (+ [⚙ Settings] for admin only)           │
└─────────────────────────────────────────────────────┘

HOME TAB (Leaderboard):
┌──────────────────────────────────────────────────────┐
│  Rank  Team          Manager     Pts    Status        │
│  ────  ────────────  ──────────  ─────  ──────────    │
│  1     Warriors      VINOD       215    Unlimited      │
│  2     Kleen         Kaarti...   180    Unlimited      │
│  3     Fighters      user3       150    —              │
└──────────────────────────────────────────────────────┘

DRAFT ROOM TAB:
┌──────────────────────────────────────────────────────┐
│  Season: IPL 2026  |  Format: Snake  |  Status: SETUP │
│  8 rounds / 8 teams / 6 joined                        │
│                                                        │
│  [Enter Draft Room]  (if status = drafting/completed)  │
│  [Start Draft]  (admin only, status = setup)           │
└──────────────────────────────────────────────────────┘
```

**Data source:** `GET /api/leagues/:id` → season → teams (+ points field once scoring is added)

---

## Navigation Architecture

### Navbar — Not Logged In
```
[IPL Fantasy]         [Home]  [Join Season]  [Login]  [Register]
```

### Navbar — Logged In (regular user)
```
[IPL Fantasy]         [Home]  [My Leagues]  [Join Season]  [VINOD ▾]
                                                             └─ Logout
```

### Navbar — Logged In (admin)
```
[IPL Fantasy]         [Home]  [My Leagues]  [Create League]  [VINOD ▾]
                                                               └─ Logout
```

**Note:** Admin doesn't need `Join Season` in navbar — they create seasons. They can join via the season's invite code if they want to play.

---

## Frontend Routes

| Path | Component | Auth | Notes |
|---|---|---|---|
| `/` | `page-home` | No | Different content logged-in vs out |
| `/login` | `page-login` | No | Add redirect param support |
| `/join` | `page-join` (NEW) | Yes | Join season with code |
| `/my-leagues` | `page-my-leagues` (NEW) | Yes | List of user's leagues/seasons |
| `/league/:leagueId` | `page-league` | Yes | Refactored: leaderboard + draft tabs |
| `/season/:seasonId` | `page-season` | Yes (admin) | Season admin/setup page |
| `/season/:seasonId/players` | `page-players` | Yes (admin) | Player pool |
| `/season/:seasonId/draft/snake` | `page-snake-draft` | Yes | Draft room |
| `/admin/create` | `page-admin-create` (NEW) | Yes (admin) | Create league + season |

---

## Auth & Role Guard Plan

**Auth service** (`services/auth.ts`) needs:
- `getMe()` — cached, returns `{ user_id, email, display_name, is_admin }`
- `isAdmin()` — returns `is_admin` from cached user
- Auth guard helper for pages that require login

**NavBar** needs to:
- Call `getMe()` on mount (or read from localStorage-cached user)
- Show different links based on `isLoggedIn()` and `isAdmin()`
- Show user's display name in top-right with logout dropdown

---

## Implementation Phases

### Phase 1 — Backend: Schema + API changes
1. Migration: add `is_admin` to `users`, `invite_code` to `seasons`, `points` to `teams`
2. Update `create_season` — generate invite_code, remove auto-team-creation
3. Add `POST /api/seasons/join`
4. Add `GET /api/leagues/mine`
5. Update `GET /api/auth/me` to include `is_admin`

### Phase 2 — Frontend: Auth + Nav
1. Update `services/auth.ts` — add `getMe()`, `isAdmin()`, cache user info
2. Update `services/api.ts` — add `joinSeason()`, `getMyLeagues()`, `createLeague()`
3. Refactor `nav-bar.ts` — auth-aware, role-aware, user menu

### Phase 3 — Frontend: Pages
1. Refactor `page-home.ts` — hero for logged-out, action cards for logged-in
2. Add `page-join.ts` — join season form
3. Add `page-my-leagues.ts` — list of seasons user belongs to
4. Refactor `page-league.ts` — leaderboard + draft room tabs, remove admin season form
5. Add `page-admin-create.ts` — create league + season flow with invite code display

### Phase 4 — Polish
1. Auth guards on protected routes
2. Admin guards on admin-only actions/pages
3. Loading states, error handling
4. Invite code copy-to-clipboard
5. Responsive design

---

## Open Items (Future, Not Now)

- Score import via Excel/CSV → `POST /seasons/:id/scores/import` → updates `team.points`
- Leaderboard shows points as `0` until scores are imported
- Season status `ACTIVE` = post-draft, scores importable
- `page-season.ts` (admin setup page) may need `invite_code` displayed prominently once season is created