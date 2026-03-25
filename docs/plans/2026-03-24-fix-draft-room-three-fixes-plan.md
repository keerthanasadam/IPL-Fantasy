---
title: "fix: Draft Room — End Draft, Board Column Bug, Draft Order Reorder"
type: fix
status: active
date: 2026-03-24
---

# fix: Draft Room — End Draft, Board Column Bug, Draft Order Reorder

## Overview

Three targeted fixes to the snake draft room:

1. **End Draft** — Admin "End Draft" button + guarantee auto-complete triggers correctly when max rounds are exhausted, with redirect to season summary.
2. **Board rendering bug** — Even-round picks appear under the wrong team column; fix cell emission order. Also add "Up next" team display to the status bar.
3. **Draft order reorder** — Admin UI (on season settings page) to reorder teams' draft positions before the draft starts.

---

## Issue 1: End Draft (Manual + Auto-Complete)

### Problem Statement

- `make_pick()` already sets `season.status = COMPLETED` on the last pick, but `get_draft_state()` computes `is_complete` from pick count alone — not from `season.status`. If status is `COMPLETED` but picks were undone, these two sources diverge.
- No manual "End Draft" action exists for admin to end mid-draft.
- After completion, the frontend shows a banner but does **not** redirect. Users are stranded on the draft page.

### Proposed Solution

**Backend — fix `get_draft_state()`** (`backend/app/services/snake_draft_service.py`)

```python
# Current (line 109)
is_complete = next_pick_number > total_picks

# Fix — treat COMPLETED status as authoritative
is_complete = (
    season.status == SeasonStatus.COMPLETED
    or next_pick_number > total_picks
)
```

**Backend — new REST endpoint** (`backend/app/routers/seasons.py`)

Add after the existing `start_draft` endpoint (line ~230). Follows the same pattern:

```python
@router.post("/{season_id}/end-draft", response_model=SeasonResponse)
async def end_draft(
    season_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    season = await db.get(Season, season_id)
    if season is None:
        raise HTTPException(404, "Season not found")
    if season.status not in (SeasonStatus.DRAFTING, SeasonStatus.SETUP):
        raise HTTPException(400, f"Cannot end draft in status: {season.status}")
    season.status = SeasonStatus.COMPLETED
    await db.commit()
    await db.refresh(season)
    return season
```

**Backend — new WS message `admin_end_draft`** (`backend/app/ws/snake_ws.py`)

Add alongside `admin_pause_draft` handler (line ~248). This ensures all connected clients receive the completion state broadcast immediately — REST alone won't push to WebSocket clients.

```python
elif msg_type == "admin_end_draft":
    if not is_admin_user:
        await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
        continue
    season_stmt = await db.execute(select(Season).where(Season.id == season_id))
    season = season_stmt.scalar_one()
    if season.status not in (SeasonStatus.DRAFTING,):
        await manager.send_personal(websocket, {"type": "error", "message": "Draft not active"})
        continue
    season.status = SeasonStatus.COMPLETED
    await db.commit()
    _cancel_timer(room)
    state = await get_draft_state(db, season_id)
    await manager.broadcast_to_room(room, {
        "type": "draft_state",
        "data": _serialize_state(state, season.draft_config or {}),
    })
```

**Frontend — WS service** (`frontend/src/services/ws.ts`)

Add `adminEndDraft()` method alongside `adminPauseDraft()`:

```ts
adminEndDraft() {
  this.send({ type: 'admin_end_draft' });
}
```

**Frontend — draft page** (`frontend/src/pages/page-snake-draft.ts`)

- Add `endDraft()` method calling `this.ws?.adminEndDraft()`
- Add "End Draft" button to admin controls block (line ~638):

```ts
<button class="btn btn-danger btn-sm" ?disabled=${this.isDryRun} @click=${this.endDraft}>
  End Draft
</button>
```

- Auto-redirect on completion: in the `draft_state` WS handler, after `this.draftState = data`, if `data.is_complete` becomes true, schedule redirect:

```ts
if (data.is_complete && !this._redirectScheduled) {
  this._redirectScheduled = true;
  setTimeout(() => {
    window.location.href = `/season/${this.seasonId}`;
  }, 3000);
}
```

Add `@state() private _redirectScheduled = false;` to state properties.

**Frontend — api.ts** (`frontend/src/services/api.ts`)

Add `endDraft()` following `startDraft()` pattern:

```ts
endDraft(seasonId: string) {
  return this.post(`/seasons/${seasonId}/end-draft`);
}
```

*(REST call is secondary to the WS action but useful for resilience.)*

---

## Issue 2: Board Column Bug + "Up Next" in Status Bar

### Bug 1 — Wrong team column in even rounds

**Root cause** (`frontend/src/pages/page-snake-draft.ts`, lines 497-502):

```ts
// Current — BUG
const isEvenRound = r % 2 === 0;
const orderedTeams = isEvenRound ? [...teams].reverse() : teams;
for (const team of orderedTeams) {  // cells emitted in reverse for even rounds
```

The CSS grid header always emits teams in `draft_position` order. Cells in even rounds are emitted reversed, so they land under the wrong headers.

**Fix:** Always iterate `teams` (header order) for cell placement. The pick lookup `pickMap.get(`${r}-${team.id}`)` already encodes who picked what — no data change needed.

```ts
// Fixed — remove isEvenRound / orderedTeams entirely
rows.push(html`<div class="board-round">R${r}</div>`);
for (const team of teams) {          // always header order
  const pick = pickMap.get(`${r}-${team.id}`);
  const isCurrent = !state.is_complete
    && state.current_round === r
    && state.current_team_id === team.id;
  rows.push(html`...`);
}
```

### Bug 2 — "Up next" team in status bar

**Approach:** Add `next_team_name` and `next_team_id` to `_serialize_state()` in `snake_ws.py`. Reuse the existing `calculate_snake_turn()` function — no new logic needed.

**Backend** (`backend/app/ws/snake_ws.py`, `_serialize_state()` at line 307):

```python
def _serialize_state(state, draft_config: dict | None = None) -> dict:
    config = draft_config or {}
    total_picks = state.total_rounds * state.team_count

    # Compute next team
    next_team_id = None
    next_team_name = None
    if not state.is_complete and state.teams:
        next_pick = state.current_pick_number + 1
        if next_pick <= total_picks:
            from app.services.snake_draft_service import calculate_snake_turn
            _, next_team = calculate_snake_turn(next_pick, len(state.teams), state.teams)
            next_team_id = next_team["id"]
            next_team_name = next_team["name"]

    return {
        # ...existing fields...
        "next_team_id": next_team_id,
        "next_team_name": next_team_name,
    }
```

**Frontend — DraftState interface** (`page-snake-draft.ts`):

```ts
interface DraftState {
  // ...existing fields...
  next_team_id: string | null;
  next_team_name: string | null;
}
```

**Frontend — status bar** (lines 571-585):

```ts
${state.next_team_name && !state.is_complete ? html`
  <div style="margin-top: 0.4rem; font-size: 0.8rem; color: #64748b;">
    Up next: <span style="color: #e2e8f0; font-weight: 600;">${state.next_team_name}</span>
  </div>
` : ''}
```

---

## Issue 3: Configure Snake Draft Order

### Problem Statement

`Team.draft_position` is set at team creation and drives all snake ordering. No UI exists to change it. Admins must do it via raw DB edits.

### Proposed Solution

**Backend — new schemas** (`backend/app/schemas/season.py`):

```python
class TeamReorderItem(BaseModel):
    team_id: uuid.UUID
    draft_position: int

class TeamsReorderRequest(BaseModel):
    teams: list[TeamReorderItem]
```

**Backend — new endpoint** (`backend/app/routers/seasons.py`):

```python
@router.patch("/{season_id}/teams/reorder", response_model=list[TeamResponse])
async def reorder_teams(
    season_id: uuid.UUID,
    body: TeamsReorderRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    season = await db.get(Season, season_id)
    if season is None:
        raise HTTPException(404, "Season not found")
    if season.status != SeasonStatus.SETUP:
        raise HTTPException(400, "Draft order can only be changed before the draft starts")

    # Validate no duplicate positions
    positions = [item.draft_position for item in body.teams]
    if len(positions) != len(set(positions)):
        raise HTTPException(422, "Duplicate draft positions")

    for item in body.teams:
        team = await db.get(Team, item.team_id)
        if not team or team.season_id != season_id:
            raise HTTPException(404, f"Team {item.team_id} not found in this season")
        team.draft_position = item.draft_position

    await db.commit()

    teams_stmt = await db.execute(
        select(Team).where(Team.season_id == season_id).order_by(Team.draft_position)
    )
    return teams_stmt.scalars().all()
```

**Frontend — api.ts** (`frontend/src/services/api.ts`)

Update the existing `updateDraftOrder()` stub (line 107) — currently calls `/seasons/${seasonId}/draft-order`, update URL to match:

```ts
updateDraftOrder(seasonId: string, teams: Array<{ team_id: string; draft_position: number }>) {
  return this.patch(`/seasons/${seasonId}/teams/reorder`, { teams });
}
```

**Frontend — page-season.ts settings tab**

Add a new `"Draft Order"` settings section (admin-only, only visible when `isSetup`):

```ts
@state() private draftOrderTeams: any[] = [];
@state() private draftOrderSaving = false;
@state() private draftOrderSuccess = false;

// In connectedCallback or after season loads:
this.draftOrderTeams = [...this.season.teams].sort(
  (a, b) => a.draft_position - b.draft_position
);

private moveTeam(index: number, direction: -1 | 1) {
  const arr = [...this.draftOrderTeams];
  const swapIdx = index + direction;
  if (swapIdx < 0 || swapIdx >= arr.length) return;
  [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
  this.draftOrderTeams = arr;
}

private async saveDraftOrder() {
  this.draftOrderSaving = true;
  const payload = this.draftOrderTeams.map((t, i) => ({
    team_id: t.id,
    draft_position: i + 1,
  }));
  await api.updateDraftOrder(this.seasonId, payload);
  this.draftOrderSaving = false;
  this.draftOrderSuccess = true;
  setTimeout(() => { this.draftOrderSuccess = false; }, 2000);
}

// Template
html`
<div class="settings-section">
  <h3>Draft Order</h3>
  ${this.draftOrderTeams.map((t, i) => html`
    <div style="display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0;
                border-bottom:1px solid #1e293b;">
      <span style="width:1.5rem; color:#64748b; font-size:0.8rem;">${i + 1}</span>
      <span style="flex:1;">${t.name}</span>
      <button class="btn btn-secondary btn-sm"
              ?disabled=${i === 0}
              @click=${() => this.moveTeam(i, -1)}>↑</button>
      <button class="btn btn-secondary btn-sm"
              ?disabled=${i === this.draftOrderTeams.length - 1}
              @click=${() => this.moveTeam(i, 1)}>↓</button>
    </div>
  `)}
  <button class="btn btn-primary btn-sm" style="margin-top:0.75rem;"
          ?disabled=${this.draftOrderSaving}
          @click=${this.saveDraftOrder}>
    ${this.draftOrderSaving ? 'Saving...' : 'Save Order'}
  </button>
  ${this.draftOrderSuccess ? html`<span class="text-green" style="margin-left:0.5rem;">Saved!</span>` : ''}
</div>
`
```

---

## Acceptance Criteria

### Issue 1 — End Draft
- [ ] When the last pick is made (all rounds complete), `draft_state` broadcast has `is_complete: true`
- [ ] After `is_complete` becomes true, the complete banner shows and the page redirects to `/season/{id}` after 3 seconds
- [ ] Admin sees "End Draft" button in controls (only when draft is active / not in dry-run mode)
- [ ] Clicking "End Draft" sends `admin_end_draft` WS message, which sets status to COMPLETED and broadcasts to all clients
- [ ] All connected clients (not just admin) receive the completion broadcast and redirect
- [ ] `get_draft_state()` returns `is_complete: true` whenever `season.status == COMPLETED`, regardless of pick count

### Issue 2 — Board + Status Bar
- [ ] In round 2 (and all even rounds), each player appears under their correct team's column header
- [ ] In round 1 (and all odd rounds), columns are unaffected
- [ ] "Up next: [team name]" appears below the timer in the status bar
- [ ] When the last pick of a round is on the clock, "Up next" shows the first team of the next round
- [ ] When the draft is complete, "Up next" is not shown

### Issue 3 — Draft Order Reorder
- [ ] Admin settings tab shows "Draft Order" section when season is in `setup` status
- [ ] Teams listed in current `draft_position` order with up/down buttons
- [ ] Up/down buttons move teams in the list; saving calls `PATCH /api/seasons/{id}/teams/reorder`
- [ ] After save, `draft_position` values on teams are updated (1-indexed, sequential)
- [ ] Endpoint returns 400 if called after draft has started (status != `setup`)
- [ ] Endpoint returns 422 if duplicate `draft_position` values are submitted
- [ ] Section is hidden (or shows locked notice) when season is not in `setup` status

---

## Files to Change

| File | Change |
|---|---|
| `backend/app/services/snake_draft_service.py` | Fix `is_complete` logic (line 109) |
| `backend/app/ws/snake_ws.py` | Add `admin_end_draft` handler; add `next_team_name`/`next_team_id` to `_serialize_state()` |
| `backend/app/routers/seasons.py` | Add `end-draft` POST endpoint; add `teams/reorder` PATCH endpoint |
| `backend/app/schemas/season.py` | Add `TeamReorderItem`, `TeamsReorderRequest` Pydantic models |
| `frontend/src/services/ws.ts` | Add `adminEndDraft()` method |
| `frontend/src/services/api.ts` | Add `endDraft()`; update `updateDraftOrder()` URL |
| `frontend/src/pages/page-snake-draft.ts` | Fix `renderBoard()` cell order; add End Draft button; add `_redirectScheduled` + redirect logic; add `next_team_name` to interface + status bar |
| `frontend/src/pages/page-season.ts` | Add "Draft Order" settings section with reorder UI |

---

## Dependencies & Risks

- **No DB migration needed** — `Team.draft_position` already exists as a plain `Integer`. No schema change.
- **WS broadcast on REST end-draft:** The REST `end-draft` endpoint does NOT broadcast to WS clients. Only the WS `admin_end_draft` message does. The admin must be on the draft room page for the broadcast to go out. This is acceptable — if admin ends via REST (unlikely), a page refresh shows the banner.
- **Timer cancellation on manual end:** `_cancel_timer(room)` must be called in the `admin_end_draft` WS handler to prevent stale auto-picks after the draft is ended. Already shown in the handler pseudocode above.
- **Draft order UI syncing:** After saving draft order, `this.season.teams` on the page is not automatically refreshed. Either re-fetch the season after save or update the local array in-place with the returned data.

## Sources & References

- `backend/app/services/snake_draft_service.py:41` — `calculate_snake_turn()` reused for next-team computation
- `backend/app/ws/snake_ws.py:248` — `admin_pause_draft` pattern followed for `admin_end_draft`
- `backend/app/routers/seasons.py:201` — `start_draft` endpoint pattern followed for `end_draft`
- `frontend/src/pages/page-snake-draft.ts:497` — rendering bug location
- `frontend/src/pages/page-season.ts:456` — settings tab where reorder UI goes
- `frontend/src/services/api.ts:107` — existing `updateDraftOrder()` stub to update
