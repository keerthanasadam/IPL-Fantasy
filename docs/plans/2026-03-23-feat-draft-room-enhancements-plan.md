---
title: "feat: Draft Room Enhancements"
type: feat
status: completed
date: 2026-03-23
origin: docs/brainstorms/2026-03-23-draft-room-features-brainstorm.md
---

# Draft Room Enhancements

## Overview

Five improvements to the snake draft room: a bug fix for odd-round picks failing silently, a team viewer dropdown replacing the static "My Team" panel, player rankings with auto-pick on timer expiry, a draft completion banner with navigation, and a read-only viewer mode for authenticated non-participants.

---

## 1. Bug Fix: Odd Round Pick Not Working

### Problem Statement

On odd rounds (1, 3, 5…), the draft room shows "Your Turn" correctly, but clicking Pick does nothing — no error, no visual feedback. Admin `force_pick` works. Even rounds pick correctly.

(see brainstorm: docs/brainstorms/2026-03-23-draft-room-features-brainstorm.md)

### Root Cause Investigation

Research shows `calculate_snake_turn()` logic is mathematically correct. The likely culprits:

1. **`myTeamId` mapping mismatch** — `auth.ts` maps `user.id → user_id` on cache. The draft state `teams[]` uses `owner_id`. If `owner_id` doesn't match `user_id` on odd-round teams specifically, the `Pick` button would be in a disabled/enabled state that doesn't match reality. Check: `draftState.teams.find(t => t.owner_id === this.me.user_id)` — verify `owner_id` field name returned by backend.

2. **Click handler guard** — The click handler at `page-snake-draft.ts:568` disables the button via `state.current_team_id !== this.myTeamId && !isAdmin()`. If `myTeamId` is `null` due to the mapping issue above, all picks would fail silently even if the status indicator shows "Your Turn."

3. **Missing backend ownership validation** — `make_pick()` in `snake_draft_service.py` has no check that the requesting user owns the team on the clock. Any authenticated user can pick for any team. Add server-side validation as a safety net.

### Proposed Solution

**Backend** (`backend/app/services/snake_draft_service.py`):
- In `make_pick()`, after fetching `state`, validate that the `requesting_team_id` matches `state.current_team_id`. Raise `ValueError("Not your turn")` otherwise.
- The `force_pick` WS handler (admin-only) bypasses this check.

**Backend** (`backend/app/ws/snake_ws.py`):
- In the `pick` message handler, pass `user.id` → look up their team in the season, pass `team_id` to `make_pick()`.

**Frontend** (`frontend/src/pages/page-snake-draft.ts`):
- Log the WS `error` message response in the browser console for debugging.
- Verify `myTeamId` getter uses correct field names from `DraftState.teams[]`.

### Acceptance Criteria

- [x] User can successfully pick a player on all odd rounds when it is their turn
- [x] Backend rejects pick attempts by users who are not the current team's owner
- [x] Admin `force_pick` is unaffected
- [x] No regression on even rounds

---

## 2. Team Viewer Dropdown

### Problem Statement

The "My Team" sidebar panel shows only the current user's picks. With up to 10 participants, there is no way to see what other teams have drafted.

(see brainstorm: docs/brainstorms/2026-03-23-draft-room-features-brainstorm.md)

### Proposed Solution

Replace the static "My Team" heading with a `<select>` dropdown listing all teams in the season. The player list below updates to show the selected team's picks. Default selection is the current user's team (or first team for viewers).

**File:** `frontend/src/pages/page-snake-draft.ts`

#### State + Computed Properties

```typescript
// Add reactive property
@state() private viewingTeamId: string = '';

// Runs once draftState is available; default to my team
private initViewingTeam() {
  if (!this.viewingTeamId && this.draftState?.teams.length) {
    this.viewingTeamId = this.myTeamId ?? this.draftState.teams[0].id;
  }
}

// Replace myPicks getter
private get viewingTeamPicks() {
  return (this.draftState?.picks ?? [])
    .filter(p => p.team_id === this.viewingTeamId)
    .sort((a, b) => a.pick_number - b.pick_number);
}

private get viewingTeam() {
  return this.draftState?.teams.find(t => t.id === this.viewingTeamId);
}
```

#### Template Change (sidebar "My Team" section)

```html
<!-- Replace static "My Team" heading -->
<div class="section-header">
  <select @change=${(e) => this.viewingTeamId = e.target.value}>
    ${this.draftState?.teams.map(t => html`
      <option value=${t.id} ?selected=${t.id === this.viewingTeamId}>
        ${t.name}${t.id === this.myTeamId ? ' (You)' : ''}
      </option>
    `)}
  </select>
</div>

<!-- Render viewingTeamPicks instead of myPicks -->
${this.viewingTeamPicks.map(pick => html`...`)}
```

#### Scrollable Height

Wrap the picks list in a container with `max-height: 300px; overflow-y: auto` matching the existing sidebar card style.

### Acceptance Criteria

- [x] Dropdown lists all teams in the season with "(You)" label on current user's team
- [x] Selecting a team updates the picks list immediately
- [x] Default selection is current user's team on load
- [x] For viewers (no team in season), default is first team
- [x] Picks update in real-time as new picks are made (existing WS flow handles this)
- [x] Scrollable when picks exceed the allocated height

---

## 3. Player Rankings + Auto-Pick on Timer Expiry

### Problem Statement

Players have no ranking data. The available players list has no default ordering by quality. When the timer expires, turns are skipped rather than auto-picked.

(see brainstorm: docs/brainstorms/2026-03-23-draft-room-features-brainstorm.md)

### Proposed Solution

#### 3a. Database: Add `ranking` Column

**File:** `backend/app/models/player.py`

```python
ranking: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
```

**Migration:**
```bash
alembic revision --autogenerate -m "add_ranking_to_players"
alembic upgrade head
```

#### 3b. Schema: Expose `ranking` in API

**File:** `backend/app/schemas/player.py`

```python
class PlayerResponse(BaseModel):
    id: UUID
    season_id: UUID
    name: str
    ipl_team: str
    designation: str
    ranking: int | None = None
    model_config = {"from_attributes": True}
```

#### 3c. CSV Importer: Accept Optional `Ranking` Column

**File:** `backend/app/routers/players.py`

In the CSV row processing loop, read `Ranking` column if present:

```python
ranking_raw = row.get("Ranking", "").strip()
ranking = int(ranking_raw) if ranking_raw.isdigit() else None
```

The `Ranking` column is **optional** — existing CSVs without it import as `None`.

#### 3d. Default Sort by Ranking

**File:** `backend/app/routers/players.py` — `list_players` endpoint

Change default ordering:

```python
# Current: .order_by(Player.name)
# New:
.order_by(Player.ranking.asc().nulls_last(), Player.name.asc())
```

Players with `ranking = None` sort to the bottom, then alphabetically.

#### 3e. Frontend: Show Rank on Each Player Row

**File:** `frontend/src/pages/page-snake-draft.ts`

In the available players list template, prepend rank badge to each row:

```html
<span class="player-rank">${player.ranking ?? '—'}</span>
```

Style: small muted number badge, consistent with existing `player-role` styling.

#### 3f. Auto-Pick on Timer Expiry

The backend does not currently have a timer expiry handler. Implement as an asyncio background task per draft room.

**File:** `backend/app/ws/snake_ws.py`

```python
# Track per-draft timer tasks
_timer_tasks: dict[str, asyncio.Task] = {}

async def _auto_pick_after_timeout(season_id: str, pick_number: int, db_factory, redis):
    """Sleep for timer duration; if pick hasn't advanced, auto-pick highest ranked available player."""
    await asyncio.sleep(timer_seconds)
    async with db_factory() as db:
        state = await get_draft_state(season_id, db)
        if state.current_pick_number != pick_number or state.is_complete:
            return  # pick already made or draft ended
        # Find highest-ranked available player
        available = [p for p in state.available_players if p.ranking is not None]
        available.sort(key=lambda p: p.ranking)
        if not available:
            available = state.available_players  # fallback: any player
        if not available:
            return
        player_id = available[0].id
        team_id = state.current_team_id
        await make_pick(season_id=season_id, team_id=team_id, player_id=player_id, db=db)
        updated_state = await get_draft_state(season_id, db)
        await manager.broadcast(season_id, {"type": "draft_state", "data": updated_state.dict()})
```

**Timer management:**
- Start task after every successful pick and on draft start
- Cancel and restart task when admin resets timer
- Cancel task when draft is paused; restart on resume
- Cancel task when draft completes
- Use `season_id + pick_number` as task key to avoid stale wakeups

**`draft_config` already has `on_timeout` field** — only auto-pick if `draft_config.on_timeout == "auto_pick"` (existing enum value).

### Acceptance Criteria

- [x] `ranking` column exists on `Player` model; migration applied
- [x] CSV importer accepts optional `Ranking` column; rows without it import with `ranking = None`
- [x] Available players list defaults to rank-ascending order; unranked players appear last
- [x] Rank number shown on each player row in the draft room
- [x] When timer expires and `on_timeout = "auto_pick"`, highest-ranked available player is auto-picked for the current team
- [x] Auto-pick broadcasts `draft_state` to all connected clients
- [x] Timer task is properly cancelled on manual pick, pause, undo, and draft completion
- [x] `on_timeout = "skip_turn"` behavior is unaffected

---

## 4. Draft Completion State

### Problem Statement

When all rounds complete, the draft room shows a "Draft Complete!" banner but provides no navigation back to the league/season page.

(see brainstorm: docs/brainstorms/2026-03-23-draft-room-features-brainstorm.md)

### Proposed Solution

**File:** `frontend/src/pages/page-snake-draft.ts`

The existing banner at line ~457 already renders when `state.is_complete`. Extend it with a navigation button:

```html
${this.draftState?.is_complete ? html`
  <div class="complete-banner">
    <h2>🏏 Draft Complete!</h2>
    <p>All rounds finished. Your squad is locked in.</p>
    <a class="btn-primary" href="/season/${this.seasonId}">
      Go to League →
    </a>
  </div>
` : ''}
```

The `/season/${seasonId}` route already exists (`page-season.ts`).

### Acceptance Criteria

- [x] "Draft Complete!" banner appears when `is_complete` is true
- [x] Banner includes a "Go to League" button linking to `/season/{seasonId}`
- [x] Button is styled consistently with existing primary button style
- [x] After undo (reverts to `drafting`), banner disappears and draft resumes normally

---

## 5. Viewer Mode

### Problem Statement

Authenticated users who are not season participants have no official way to watch a live draft. The current page silently handles this (pick buttons disabled for non-participants), but there is no intentional viewer experience.

(see brainstorm: docs/brainstorms/2026-03-23-draft-room-features-brainstorm.md)

### Proposed Solution

**Decision (resolved from open question in brainstorm):** No special link needed. Any authenticated user who navigates to `/season/{id}/draft/snake` and is not a participant gets the viewer layout automatically. The viewer link to share is simply the draft room URL.

#### 5a. Require Authentication

**File:** `frontend/src/pages/page-snake-draft.ts` — `onBeforeEnter` hook

```typescript
onBeforeEnter(location: any) {
  this.seasonId = location.params.seasonId;
  if (!guardRoute(`/season/${this.seasonId}/draft/snake`)) return;
}
```

This redirects unauthenticated users to `/login?redirect=...`.

#### 5b. Viewer Layout

A user is a **viewer** when `this.myTeamId === null` (authenticated but not a season participant).

**File:** `frontend/src/pages/page-snake-draft.ts`

Add a computed property:
```typescript
private get isViewer(): boolean {
  return !!this.me && !this.myTeamId;
}
```

In the main template, conditionally render the sidebar:
```html
${!this.isViewer ? html`
  <!-- Full sidebar: team viewer dropdown + available players -->
  ...
` : html`
  <!-- Viewer: only show current turn + timer -->
  <div class="viewer-info">
    <p class="viewer-label">👁 Viewing Draft</p>
    ${this.draftState ? html`
      <p>Round ${this.draftState.current_round} · Pick ${this.draftState.current_pick_number}</p>
      <p>${currentTeamName} is on the clock</p>
    ` : ''}
  </div>
`}
```

The draft board (left panel, pick grid by round/team) is **always visible** — it is not conditionally rendered.

#### 5c. WebSocket Authentication Hardening

**File:** `backend/app/ws/snake_ws.py`

Currently, unauthenticated users can connect (token is optional). Per the brainstorm decision, require auth:

```python
user = decode_token(token) if token else None
if user is None:
    await websocket.send_json({"type": "error", "message": "Authentication required"})
    await websocket.close(code=4001)
    return
```

### Acceptance Criteria

- [x] Unauthenticated users visiting the draft URL are redirected to `/login`
- [x] Authenticated non-participants see the draft board and current turn/timer
- [x] Authenticated non-participants do not see the Available Players panel or team viewer dropdown
- [x] A "👁 Viewing Draft" label is shown so viewers understand their role
- [x] Season participants are unaffected — they see the full sidebar
- [x] WebSocket connection is rejected with code 4001 for unauthenticated WS connections

---

## Technical Considerations

- **Auto-pick task state:** asyncio tasks are in-process only. If the backend restarts mid-timer, the task is lost. This is acceptable for MVP; a Redis-backed scheduler would be needed for production reliability.
- **Timer task race condition:** Use `pick_number` as part of the task key — if a pick is made before the task fires, the task checks `state.current_pick_number != pick_number` and exits without acting.
- **`designation` normalization:** The existing CSV importer stores raw values like "Middle order Batter" rather than normalized role codes. Rankings don't depend on this, but role limits may be affected separately.
- **Viewer URL sharing:** The draft room URL is the viewer link. No separate route or token needed.

## System-Wide Impact

- **Ranking sort change is a breaking default** — existing seasons without ranking data will show all players unranked (sorted alphabetically as fallback). This is acceptable and communicates to the admin to import rankings.
- **WS auth hardening** — requiring auth on the WS endpoint aligns with the decision to require login for viewers. Clients without a token (currently possible) will be disconnected. The frontend always sends `?token=` when logged in, so this only affects unauthenticated browser connections.
- **Auto-pick broadcasts `draft_state`** — same as a manual pick. All existing WS clients handle this correctly.

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Auto-pick asyncio task leak | Cancel task in all exit paths (pick made, pause, complete, WS disconnect) |
| Ranking CSV column name mismatch | Column name `Ranking` is optional — if absent, all players import with `ranking = None` |
| `make_pick()` ownership validation breaks admin force_pick | Admin `force_pick` passes explicit `team_id` and bypasses ownership check |
| WS auth hardening breaks existing clients | Frontend already sends token — only affects unauthenticated connections |

## Acceptance Criteria (Full Suite)

- [x] Odd-round picks work for all users
- [x] Backend validates pick ownership; admin force_pick unaffected
- [x] Team viewer dropdown shows all season teams; defaults to current user's team
- [x] Player `ranking` column added; migration applied
- [x] CSV importer accepts optional `Ranking` column
- [x] Available players sorted by rank by default; rank shown on each row
- [x] Auto-pick fires on timer expiry when `on_timeout = "auto_pick"`
- [x] "Draft Complete!" banner shows with "Go to League" button
- [x] Unauthenticated users redirected to login from draft room
- [x] Authenticated viewers see draft board + timer only (no sidebar)

## Implementation Order

1. **Bug fix** (unblocks testing everything else)
2. **Draft completion banner** (trivial, high value)
3. **Team viewer dropdown** (frontend-only)
4. **Rankings: DB + CSV + display** (migration → importer → frontend)
5. **Auto-pick timer** (most complex, depends on rankings)
6. **Viewer mode** (frontend guard + layout + WS hardening)

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-03-23-draft-room-features-brainstorm.md](docs/brainstorms/2026-03-23-draft-room-features-brainstorm.md)
  - Key decisions carried forward: pure-rank auto-pick (no role balancing), team viewer as dropdown (not tiles+modal), viewer mode requires auth
- `backend/app/services/snake_draft_service.py` — `calculate_snake_turn()`, `make_pick()`
- `backend/app/ws/snake_ws.py` — WebSocket handler
- `frontend/src/pages/page-snake-draft.ts` — draft room page
- `backend/app/models/player.py` — Player model
- `backend/app/routers/players.py` — CSV import endpoint
