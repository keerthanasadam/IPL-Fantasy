---
title: Season Admin Rules & Management
type: feat
status: completed
date: 2026-03-14
origin: brainstorm/2026-03-11-season-admin-rules-brainstorm.md
---

# Season Admin Rules & Management

## Overview

Expand the season creation form with full snake-draft configuration fields, add a tabbed settings UI to `page-season.ts` for post-creation management (rename, delete, draft rules, players), add a `DELETE /api/seasons/:id` endpoint, add an admin guard to the existing `PATCH` endpoint, and add three admin WebSocket commands (pause/resume/reset timer) to the live draft room.

All draft configuration lives in the existing `draft_config` JSONB column on `Season` — no schema migration needed. (see brainstorm: brainstorm/2026-03-11-season-admin-rules-brainstorm.md)

---

## Problem Statement

Currently:
- The season creation form only captures `label`, `draft_format`, `max_teams`, and `rounds`. `pick_timer_seconds`, `scheduled_draft_time`, `on_timeout`, and `role_limits` are absent.
- After a season is created there is no UI to edit these settings, rename the season, delete it, or manage players (beyond navigating to separate pages).
- `PATCH /api/seasons/:id` has no admin/ownership guard — any authenticated user can rename or overwrite `draft_config`.
- `DELETE /api/seasons/:id` does not exist — seasons cannot be removed.
- Live draft admin controls (pause/resume) have no server-side auth check; any connected client can send `pause_draft`.
- Commissioner Controls in `page-snake-draft.ts` are visible to all users, not just admins.

---

## Proposed Solution

### Backend (3 changes)

1. **`DELETE /api/seasons/{season_id}`** — new endpoint in `seasons.py`. Guard: admin only, status must be `SETUP`. Cascade: delete all `Player` rows for the season, delete all `Team` rows, then delete the `Season`.

2. **Admin guard on `PATCH /api/seasons/{season_id}`** — change the dependency from `get_current_user` to `get_current_admin` at `seasons.py:146`.

3. **WebSocket admin commands** — add `admin_pause_draft`, `admin_resume_draft`, `admin_reset_timer` message handlers in `snake_ws.py`. These replace the existing unguarded `pause_draft`/`resume_draft` handlers (which stay as-is for backward compat but will stop being called from the updated frontend).

### Frontend (5 changes)

1. **`api.ts`** — add `updateSeason()`, `deleteSeason()`, `clearPlayers()` methods.

2. **`ws.ts`** — add `adminPauseDraft()`, `adminResumeDraft()`, `adminResetTimer()` send methods.

3. **`page-admin-create.ts`** — extend step-2 form with four new draft-config fields: `pick_timer_seconds`, `scheduled_draft_time`, `on_timeout`, `role_limits`.

4. **`page-season.ts`** — full refactor to 3-tab layout: Home / Draft Room / ⚙ Settings (Settings: admin-only).

5. **`page-snake-draft.ts`** — guard Commissioner Controls block with `isAdmin()`, add Reset Timer button, switch to `admin_*` WS methods.

---

## Technical Approach

### Architecture

No new files, no new tables. All changes are in-place edits to existing files.

```
backend/app/routers/seasons.py   ← new DELETE, guard PATCH
backend/app/ws/snake_ws.py       ← admin WS handlers + is_admin at connect
frontend/src/services/api.ts     ← 3 new methods
frontend/src/services/ws.ts      ← 3 new send methods
frontend/src/pages/page-admin-create.ts  ← extended creation form
frontend/src/pages/page-season.ts        ← tabbed layout + Settings tab
frontend/src/pages/page-snake-draft.ts  ← admin controls guard + reset timer
```

### `draft_config` Shape (Snake Draft)

```json
{
  "rounds": 15,
  "pick_timer_seconds": 60,
  "scheduled_draft_time": "2026-03-15T14:00:00Z",
  "on_timeout": "auto_pick",
  "role_limits": {
    "WK":   { "min": 1, "max": 2 },
    "BAT":  { "min": 3, "max": 6 },
    "BOWL": { "min": 3, "max": 6 },
    "AR":   { "min": 1, "max": 4 }
  }
}
```

All fields are optional in the JSONB — existing seasons without these keys are unaffected.

> **Note:** Role limits are stored here but enforced at pick time — pick-time enforcement is **out of scope** for this phase. The fields are stored and displayed only. (see brainstorm)

### Implementation Phases

#### Phase 1 — Backend (no frontend dependency)

**1a. `DELETE /api/seasons/{season_id}`** — add after line ~197 in `seasons.py`:

```python
# seasons.py (after existing endpoints)
@router.delete("/{season_id}", status_code=204)
async def delete_season(
    season_id: str,
    current_user: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    season = await db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != SeasonStatus.setup:
        raise HTTPException(status_code=400, detail="Can only delete seasons in SETUP status")
    # Cascade: delete players, teams, then season
    await db.execute(delete(Player).where(Player.season_id == season_id))
    await db.execute(delete(Team).where(Team.season_id == season_id))
    await db.delete(season)
    await db.commit()
```

Import `delete` from `sqlalchemy` and add `Player`, `Team` imports if not already present.

**1b. Admin guard on PATCH** — `seasons.py:146`, change:

```python
# Before
current_user: dict = Depends(get_current_user),
# After
current_user: dict = Depends(get_current_admin),
```

**1c. WebSocket admin handlers** — `snake_ws.py`.

At connection time (after `decode_token` at line ~34), look up `is_admin` once:

```python
# After decode_token, before the while loop
user_row = await db.get(User, user["user_id"])
is_admin = user_row.is_admin if user_row else False
```

Then add three handlers after the existing `resume_draft` block (line ~135):

```python
elif msg_type == "admin_pause_draft":
    if not is_admin:
        await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
        continue
    draft_config = season.draft_config or {}
    draft_config["paused"] = True
    season.draft_config = draft_config
    await db.commit()
    await manager.broadcast_to_room(room, {"type": "draft_paused"})

elif msg_type == "admin_resume_draft":
    if not is_admin:
        await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
        continue
    draft_config = season.draft_config or {}
    draft_config.pop("paused", None)
    season.draft_config = draft_config
    await db.commit()
    await manager.broadcast_to_room(room, {"type": "draft_resumed"})

elif msg_type == "admin_reset_timer":
    if not is_admin:
        await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
        continue
    await manager.broadcast_to_room(room, {"type": "admin_timer_reset"})
    # No DB write needed — timer is client-side countdown
```

> **Note on `db` in WS:** Check whether the existing WS handler already has an `AsyncSession` in scope. If the WS endpoint uses `Depends(get_db)`, pass it through. If not, use `async_sessionmaker` (imported from `main.py` or `database.py`) to open a session in the handler.

#### Phase 2 — Frontend Services

**`api.ts`** — add to the `api` object (after existing `importPlayers` method):

```typescript
// api.ts
updateSeason(seasonId: string, data: { label?: string; draft_config?: object }) {
  return fetch(`${BASE}/seasons/${seasonId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data),
  }).then(handleResponse);
},

deleteSeason(seasonId: string) {
  return fetch(`${BASE}/seasons/${seasonId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  }).then(handleResponse);
},

clearPlayers(seasonId: string) {
  return fetch(`${BASE}/seasons/${seasonId}/players`, {
    method: 'DELETE',
    headers: getHeaders(),
  }).then(handleResponse);
},
```

**`ws.ts`** — add to `DraftWebSocket` class (after existing `resumeDraft`):

```typescript
// ws.ts
adminPauseDraft()  { this.send({ type: 'admin_pause_draft' }); }
adminResumeDraft() { this.send({ type: 'admin_resume_draft' }); }
adminResetTimer()  { this.send({ type: 'admin_reset_timer' }); }
```

#### Phase 3 — Extended Creation Form

**`page-admin-create.ts`** — in step 2 of the create form, add four new fields that merge into `draft_config` on submit:

```typescript
// Additional @state() fields:
@state() private pickTimer = 60;
@state() private scheduledTime = '';
@state() private onTimeout: 'auto_pick' | 'skip_turn' = 'auto_pick';
@state() private roleLimits = {
  WK:   { min: 1, max: 2 },
  BAT:  { min: 3, max: 6 },
  BOWL: { min: 3, max: 6 },
  AR:   { min: 1, max: 4 },
};

// In submit handler, merge into draft_config:
draft_config: {
  rounds: this.rounds,
  pick_timer_seconds: this.pickTimer,
  scheduled_draft_time: this.scheduledTime || undefined,
  on_timeout: this.onTimeout,
  role_limits: this.roleLimits,
}
```

Role limits rendered as an inline table: one row per role (WK / BAT / BOWL / AR), two `<input type="number">` columns (min / max). Use `.grid-2` from shared styles.

#### Phase 4 — Tabbed Season Page

**`page-season.ts`** — full refactor following the `page-league.ts` tab pattern:

```typescript
@state() private activeTab: 'home' | 'draft' | 'settings' = 'home';
```

Tab bar:
```typescript
<div class="tabs">
  <div class="tab ${this.activeTab === 'home' ? 'active' : ''}"
       @click=${() => this.activeTab = 'home'}>🏠 Home</div>
  <div class="tab ${this.activeTab === 'draft' ? 'active' : ''}"
       @click=${() => this.activeTab = 'draft'}>⚡ Draft Room</div>
  ${isAdmin() ? html`
    <div class="tab ${this.activeTab === 'settings' ? 'active' : ''}"
         @click=${() => this.activeTab = 'settings'}>⚙ Settings</div>
  ` : ''}
</div>
```

`renderSettings()` method with three sections:

**General section:**
- Rename: `<input>` pre-filled with `season.label`, Save button → `api.updateSeason(id, { label })`, success flash
- Delete: red button, disabled unless `season.status === 'setup'`; on click: `this.showDeleteConfirm = true`; confirmation dialog: "This will delete all teams and players. Cannot be undone." with Confirm/Cancel buttons

**Draft Rules section:**
- Same four fields as creation form (pick_timer, scheduled_time, on_timeout, role_limits)
- Pre-populated from `season.draft_config`
- Entire section disabled (grayed) if `season.status !== 'setup'` — add a notice: "Draft rules are locked after setup."
- Save → `api.updateSeason(id, { draft_config: { ...existingConfig, ...changes } })`

**Players section:**
- "Current players: N" count
- "Clear All Players" button (`.btn-danger`) → `api.clearPlayers(id)` with confirmation
- `<csv-uploader>` component for re-import
- Inline note: "Clear first, then re-upload to avoid duplicates."

#### Phase 5 — Draft Room Admin Controls

**`page-snake-draft.ts`**:

1. Guard Commissioner Controls block:
```typescript
${isAdmin() ? html`
  <div class="commissioner-controls card">
    ...buttons...
  </div>
` : ''}
```

2. Replace `pauseDraft()`/`resumeDraft()` calls with `adminPauseDraft()`/`adminResumeDraft()`.

3. Add Reset Timer button:
```typescript
<button class="btn btn-secondary btn-sm" @click=${this.adminResetTimer}>Reset Timer</button>
```

4. Handle `admin_timer_reset` WS event:
```typescript
this.ws.on('admin_timer_reset', () => {
  // Reset the client-side countdown to the configured timer value
  this.timerSecondsLeft = this.draftState?.pick_timer_seconds ?? 60;
});
```

---

## Alternative Approaches Considered

### Commissioner ownership vs. admin flag
Could guard PATCH/DELETE by checking if the current user created the league (commissioner ownership). The brainstorm chose to reuse the existing `is_admin` flag since commissioners are always admins in this app. (see brainstorm)

### Auction rules
Deferred to a separate brainstorm/plan. The creation form only shows snake-draft config when `draft_format === 'snake'`. (see brainstorm)

### `scheduled_draft_time` auto-triggering draft start
Rejected — informational only. Admin manually clicks Start Draft. (see brainstorm)

### Role limit enforcement
Decided: at pick time (safer), not at draft-start. Pick-time enforcement is out of scope for this phase. (see brainstorm)

---

## System-Wide Impact

### Interaction Graph

`DELETE /api/seasons/:id`:
1. Admin hits DELETE → `get_current_admin` validates JWT + DB lookup
2. Status guard (400 if not SETUP)
3. Cascades: `DELETE FROM players WHERE season_id = ?` → `DELETE FROM teams WHERE season_id = ?` → `DELETE FROM seasons WHERE id = ?`
4. Any active WebSocket connections to this season's draft room will receive no further broadcasts and eventually disconnect on next send/receive

`admin_pause_draft` WS message:
1. Client sends `{ type: "admin_pause_draft" }`
2. Server checks `is_admin` (resolved at connect time)
3. Writes `draft_config["paused"] = True` to DB + commits
4. `manager.broadcast_to_room` → Redis pub/sub → all connected clients receive `{ type: "draft_paused" }`
5. Clients set `this.paused = true` — pick UI disables

### Error & Failure Propagation

- **DB failure on delete:** SQLAlchemy rollback, 500 returned — no partial state (all in one transaction)
- **WS admin unauthorized:** `send_personal` error message to sender; other clients unaffected; loop continues
- **PATCH draft_config on non-SETUP season:** existing 400 guard in `seasons.py:155` — still applies after admin guard is added
- **deleteSeason frontend error:** catch → `this.error = err.message` display, no navigation

### State Lifecycle Risks

- **Settings tab renders while delete is in progress:** no optimistic UI — await the API call, then navigate away on success. The confirmation dialog prevents accidental triggers.
- **draft_config partial overwrites:** the PATCH endpoint at `seasons.py:155–162` merges `draft_config` keys — read the current config from DB and merge. Verify the existing merge logic doesn't clobber new fields like `role_limits`.
- **is_admin resolved once at WS connect:** if an admin's role is revoked mid-session, they retain admin WS privileges until reconnect. Acceptable risk for this app.

### API Surface Parity

The new `clearPlayers()` frontend method maps to `DELETE /api/seasons/:id/players` which already exists in `players.py:110` — no backend change needed, only the frontend method was missing.

The new `updateSeason()` frontend method maps to the existing `PATCH /api/seasons/:id` — same. After Phase 1b, this endpoint requires admin auth.

### Integration Test Scenarios

1. **Non-admin attempts PATCH draft_config** → should receive 403, season unmodified
2. **Admin deletes SETUP season** → season + all teams + all players removed; subsequent GET returns 404
3. **Admin attempts delete on DRAFTING season** → 400 error returned, season intact
4. **Non-admin sends `admin_pause_draft` over WS** → receives personal error message; other clients see no state change
5. **Admin clears players then re-imports CSV** → player count reflects new CSV only; no duplicates from previous import

---

## Acceptance Criteria

### Functional

**Season Creation Form:**
- [x] Step-2 form includes: Pick Timer (seconds), Scheduled Draft Time (datetime), On Timeout (select: Auto-pick/Skip turn), Role Limits (table with WK/BAT/BOWL/AR rows, min + max columns)
- [x] Submitted `draft_config` includes all new fields alongside existing `rounds`
- [x] Scheduled draft time displayed as informational (no auto-trigger)

**DELETE /api/seasons/:id:**
- [x] Returns 204 on success; season, all its teams, and all its players are removed
- [x] Returns 400 if season status is not SETUP
- [x] Returns 403 if caller is not admin
- [x] Returns 404 if season not found

**PATCH /api/seasons/:id guard:**
- [x] Returns 403 for non-admin callers (was previously 200)

**WebSocket admin commands:**
- [x] `admin_pause_draft` from admin → broadcasts `draft_paused` to all room clients
- [x] `admin_pause_draft` from non-admin → personal error, no broadcast
- [x] `admin_resume_draft` from admin → broadcasts `draft_resumed`
- [x] `admin_reset_timer` from admin → broadcasts `admin_timer_reset`; all clients reset their countdown display

**Season Settings Tab:**
- [x] Tab only appears for admin users
- [x] Rename saves new label via PATCH
- [x] Delete button disabled when status ≠ SETUP
- [x] Delete button shows confirmation dialog before calling DELETE
- [x] On successful delete, navigates away (e.g., back to league page)
- [x] Draft Rules fields pre-populated from current `draft_config`
- [x] Draft Rules form disabled (locked) when status ≠ SETUP
- [x] Clear All Players calls DELETE with confirmation
- [x] CSV re-upload works from Settings tab

**Draft Room Admin Controls:**
- [x] Commissioner Controls panel only visible to admins
- [x] Pause/Resume use `admin_*` WS message types
- [x] Reset Timer button present; clicking resets countdown on all connected clients

### Non-Functional
- [x] No N+1 queries — delete endpoint uses bulk DELETE not per-row
- [x] All new buttons have loading/disabled state during async operations
- [x] Error messages displayed inline (consistent with existing `this.error` pattern)

---

## SpecFlow Gaps (Resolved Before Implementation)

### 🔴 CRITICAL — Must resolve before writing code

**C1: Authorization model conflict — global `is_admin` vs. league commissioner**

`get_current_admin` in `deps.py` checks the global `user.is_admin` flag. The season creation endpoint (`seasons.py:37`) checks `league.commissioner_id == current_user.id`. These are currently different guards. Adding `get_current_admin` to `PATCH /api/seasons/:id` will **break the commissioner's ability to rename their own season** unless they also happen to be a global admin.

**Resolution needed before implementation:** Choose one of:
- Option A: Keep `get_current_admin` (global admin only) — acceptable if all commissioners are always global admins in this app
- Option B: Replace with a commissioner-ownership check — check `season.league.commissioner_id == current_user.id`
- Option C: Accept either — admin OR commissioner can PATCH

The brainstorm uses `is_admin` throughout. Confirm with the team which model applies.

**C2: Old unguarded `pause_draft`/`resume_draft` WS handlers must be guarded or removed**

The existing `pause_draft` and `resume_draft` message types at `snake_ws.py:118–135` have **no auth check** — any connected user can pause the draft. Adding `admin_*` variants alongside them doesn't fix this.

**Resolution:** Add the same `is_admin` check to the existing `pause_draft`/`resume_draft` handlers, OR remove them once the frontend switches to `admin_*` types. Don't leave unguarded handlers in place.

**C3: `DELETE /api/seasons/:id` cascade must include `snake_picks`**

The brainstorm specifies "cascade teams + players" but the `Season` model also has `snake_picks` (draft picks) and potentially `auction_events`. Deleting teams/players without deleting picks first will cause FK constraint violations.

**Resolution:** Add `DELETE FROM snake_picks WHERE season_id = ?` before deleting teams. Check if `auction_events` also need deletion.

**C4: `DELETE /api/seasons/:id/players` has no admin guard**

`players.py:110` uses only `get_current_user` — any authenticated user can clear all players from any season. The spec exposes this in an admin-only UI but doesn't add a backend guard.

**Resolution:** Add `get_current_admin` (or commissioner check, per C1 resolution) to `clear_players` and `import_players` in `players.py` as part of this phase.

### 🟡 IMPORTANT — Address before shipping

**I1: `admin_reset_timer` requires defining timer state in WS**

The WS `draft_state` currently serializes `timer_seconds` as a static config value, not a countdown. Broadcasting `admin_timer_reset` tells clients to reset their countdown, but clients need to know _to what value_. The broadcast payload should include `pick_timer_seconds` from `draft_config` so clients can reset to the correct value regardless of local state.

**Resolution:** `admin_timer_reset` broadcast payload: `{ type: "admin_timer_reset", pick_timer_seconds: N }`. Frontend `admin_timer_reset` handler uses this value.

**I2a: `draft_state` WS payload missing `paused` field**

`_serialize_state` in `snake_ws.py` does not include `paused`. A client connecting mid-draft after a pause will receive `draft_state` with no paused indicator and incorrectly show the draft as active.

**Resolution:** Include `"paused": draft_config.get("paused", False)` in `_serialize_state` output.

**I2b: No typed Pydantic model for `draft_config`**

The JSONB column accepts arbitrary dicts. Storing `role_limits`, `on_timeout`, etc. with no validation means the draft engine can receive malformed config at runtime.

**Resolution:** Add a `DraftConfig` Pydantic model (even with `extra = "allow"`) that validates `pick_timer_seconds >= 0`, `on_timeout` is one of `["auto_pick", "skip_turn"]`, and `role_limits` values are non-negative ints. Use it in `SeasonCreate` and `SeasonUpdate` schemas.

**I3: Post-delete navigation target**

After `DELETE /api/seasons/:id` succeeds, the current URL is invalid. Must navigate away.

**Resolution:** After successful delete, navigate to the parent league page: `window.location.href = '/league/' + this.leagueId`. The season page must load `season.league_id` (already in `SeasonResponse`) to construct this URL.

---

## Dependencies & Prerequisites

- Phase 1 (backend) is independent; can ship without frontend
- Phase 2–5 (frontend) depend on Phase 1b (admin guard on PATCH) being deployed first, otherwise `updateSeason()` calls will 403 for non-admins
- **Resolve C1 (authorization model) before Phase 1** — it affects which dependency to use on PATCH, DELETE, and player endpoints
- `is_admin` must be resolved at WS connect time — requires verifying the WS endpoint has `AsyncSession` access (check `snake_ws.py` for existing `Depends(get_db)` or equivalent)

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WS handler doesn't have `db` session | Medium | High | Check `snake_ws.py` top of handler for `AsyncSession`; if absent, import `async_sessionmaker` from `main.py` and open inline |
| PATCH `draft_config` merge clobbers `role_limits` | Low | Medium | Verify existing merge at `seasons.py:155–162` does deep merge or full replace (full replace is fine — frontend sends complete `draft_config`) |
| Admin guard on PATCH breaks existing non-admin use | Low | Low | Only league creator (admin) should be managing seasons anyway |
| `delete(Player)` import conflict with existing `Player` model | Low | Low | Use `from sqlalchemy import delete as sa_delete` alias if needed |

---

## Sources & References

### Origin

- **Brainstorm document:** [brainstorm/2026-03-11-season-admin-rules-brainstorm.md](brainstorm/2026-03-11-season-admin-rules-brainstorm.md)
  Key decisions carried forward: (1) all rules in `draft_config` JSONB, no new columns; (2) `scheduled_draft_time` informational only; (3) role limits stored now, enforced at pick time in a future phase

### Internal References

- Admin guard dependency: [backend/app/deps.py](backend/app/deps.py) — `get_current_admin` at line 39
- Tabbed UI pattern: [frontend/src/pages/page-league.ts](frontend/src/pages/page-league.ts) — tabs at lines 12–82
- Existing season PATCH: [backend/app/routers/seasons.py](backend/app/routers/seasons.py) — line 143
- Existing player endpoints: [backend/app/routers/players.py](backend/app/routers/players.py) — lines 49, 110
- WS pause/resume (existing, unguarded): [backend/app/ws/snake_ws.py](backend/app/ws/snake_ws.py) — lines 118–135
- Admin controls (current, unguarded): [frontend/src/pages/page-snake-draft.ts](frontend/src/pages/page-snake-draft.ts) — lines 386–392
- WS send methods: [frontend/src/services/ws.ts](frontend/src/services/ws.ts) — lines 68–86
- `isAdmin()` helper: [frontend/src/services/auth.ts](frontend/src/services/auth.ts) — line 56
- Shared styles (btn-danger, grid-2, etc.): [frontend/src/styles/shared-styles.ts](frontend/src/styles/shared-styles.ts)
