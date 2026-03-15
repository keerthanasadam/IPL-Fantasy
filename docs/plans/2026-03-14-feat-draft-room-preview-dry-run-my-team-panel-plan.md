---
title: Draft Room Preview, Dry-Run Mode & My Team Panel
type: feat
status: completed
date: 2026-03-14
---

# Draft Room Preview, Dry-Run Mode & My Team Panel

## Overview

Three connected improvements to the snake draft room, plus one backend bug fix already shipped:

1. **Draft room accessible to all users before draft starts** — "Preview Draft Room" button on the season page for all users when `status = setup`; draft room detects setup state and enters dry-run mode (no picks, no DB writes)
2. **Dry-run simulation** — all users can interactively simulate picks in-browser before the real draft; admin sees "Start Draft" in the preview banner to transition live
3. **Board column highlighting** — current user's team column visually distinct in the draft board grid
4. **"My Team" roster panel** — sidebar section showing the current user's picks so far; admin sees their own team (or nothing if unassigned)

**Already merged:** backend bug fix — `calculate_snake_turn` now uses `len(teams)` instead of `season.team_count`, preventing `IndexError: list index out of range` when entering the draft room for SETUP seasons ([backend/app/services/snake_draft_service.py:110](backend/app/services/snake_draft_service.py#L110)).

---

## Problem Statement

- Entering `/season/:id/draft/snake` for a SETUP season previously threw `list index out of range` and showed "Loading board..." indefinitely *(fixed)*
- No entry point exists for non-admin users to visit the draft room before the draft starts — they cannot preview the player pool, team layout, or round structure
- The draft board renders all teams correctly but gives no visual signal of which column belongs to the current user
- No panel shows what players the current user's team has picked so far
- Pick buttons are shown to all users regardless of whose turn it is, leading to confusing UX

---

## Proposed Solution

### Backend (5 changes)

**1a. Add `owner_id` to serialized teams in `get_draft_state`**
Single-line change at `snake_draft_service.py:68`. No migration — `owner_id` is already a mapped FK column on the `Team` model, always loaded by SQLAlchemy without an extra query.

**1b. Fix `timer_seconds` key mismatch (latent bug)**
`get_draft_state` reads `draft_config.get("timer_seconds", 0)` but the config key is `"pick_timer_seconds"` everywhere else. This causes the `admin_timer_reset` handler to always reset to 0. One-line fix.

**1c. Admin guard on `start-draft` endpoint** *(security gap found in SpecFlow)*
`POST /api/seasons/:id/start-draft` uses `get_current_user` — any authenticated user can start the draft. Change to `get_current_admin`.

**1d. Admin guard on `force_pick` WS handler** *(security gap found in SpecFlow)*
`force_pick` (pick for any arbitrary `team_id`, bypassing turn order) has no `is_admin_user` check. Any connected user can currently force-pick for any team on any turn.

**1e. Admin guard on `undo_last_pick` WS handler** *(security gap found in SpecFlow)*
`undo_last_pick` has no `is_admin_user` check. Any authenticated user can undo any pick.

### Frontend (4 changes)

**2. `page-season.ts`** — Add "Preview Draft Room" button for all users in the `setup` status block; guard "Start Draft" button with `isAdmin()` (backend already guards it, but frontend should too)

**3. `page-snake-draft.ts` — Dry-run mode** — Detect `status === 'setup'` from WS `draft_state`; set `isDryRun` flag; suppress all WS sends; show preview banner; admin sees "Start Draft" in banner

**4. `page-snake-draft.ts` — Board column highlight** — Use `owner_id` from teams payload to identify current user's team column; apply distinct CSS class to that column's header and cells

**5. `page-snake-draft.ts` — My Team panel** — Sidebar card showing current user's picks; "You're on the clock!" when it's their turn; Pick button disabled when it's not the user's turn (admin exempt)

---

## Technical Approach

### Architecture

No new files. No DB migration. All changes are in-place edits.

```
backend/app/services/snake_draft_service.py  ← owner_id in teams, fix timer key
backend/app/routers/seasons.py               ← admin guard on start-draft endpoint
backend/app/ws/snake_ws.py                   ← admin guards on force_pick + undo_last_pick
frontend/src/pages/page-season.ts            ← preview entry point + isAdmin guard on Start Draft
frontend/src/pages/page-snake-draft.ts       ← dry-run mode, my team panel, column highlight
```

### Draft State Shape After Changes

```json
{
  "teams": [
    { "id": "uuid", "name": "Stunners", "draft_position": 1, "owner_id": "user-uuid-or-null" }
  ],
  "status": "setup",
  "timer_seconds": 60
}
```

### Dry-Run Detection Flow

1. User clicks "Preview Draft Room" on `page-season.ts` → navigates to `/season/:id/draft/snake`
2. `page-snake-draft.ts` connects WS as normal
3. Server sends `draft_state` with `status: "setup"`
4. `draft_state` handler sets `this.isDryRun = (data.status === 'setup')`
5. `isDryRun = true` → preview banner shown, all WS sends suppressed
6. Admin sees "Start Draft" button in the banner
7. Admin clicks → `api.startDraft()` → backend transitions status to `"drafting"` → WS broadcasts new `draft_state` with `status: "drafting"` → `isDryRun` flips `false` → banner disappears, picks activate

No `?preview=1` query param needed — the WS `draft_state.status` field is the source of truth.

---

## Implementation Phases

### Phase 1 — Backend: `owner_id`, timer fix, security guards

**1a. `backend/app/services/snake_draft_service.py`**

Lines 66–70, change the teams list comprehension:

```python
# Before
{"id": str(t.id), "name": t.name, "draft_position": t.draft_position}

# After
{
    "id": str(t.id),
    "name": t.name,
    "draft_position": t.draft_position,
    "owner_id": str(t.owner_id) if t.owner_id else None,
}
```

Line 100, fix timer key:

```python
# Before
timer_seconds = (season.draft_config or {}).get("timer_seconds", 0)

# After
timer_seconds = (season.draft_config or {}).get("pick_timer_seconds", 0)
```

No other backend files need changing for owner_id — `_serialize_state` passes `state.teams` through verbatim.

**1b. `backend/app/routers/seasons.py` — admin guard on `start_draft`**

Line 195, change the dependency:

```python
# Before
current_user: dict = Depends(get_current_user),

# After
current_user: dict = Depends(get_current_admin),
```

**1c. `backend/app/ws/snake_ws.py` — admin guards on `force_pick` and `undo_last_pick`**

Add `is_admin_user` check at the top of each handler, matching the pattern already used for pause/resume:

```python
elif msg_type == "force_pick":
    if not is_admin_user:
        await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
        continue
    # ...existing logic

elif msg_type == "undo_last_pick":
    if not is_admin_user:
        await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
        continue
    # ...existing logic
```

---

### Phase 2 — Frontend: Preview entry point + isAdmin guard

**`frontend/src/pages/page-season.ts`** — `renderDraftRoom()` (lines 263–295):

```typescript
// In the status === 'setup' block, replace current content with:
${s.status === 'setup' ? html`
  <div class="actions">
    ${isAdmin() ? html`
      <button class="btn btn-primary" @click=${this.startDraft}
              ?disabled=${this.playerCount === 0}>
        Start Draft
      </button>
      ${this.playerCount === 0 ? html`
        <p class="text-muted" style="margin:0;align-self:center;">
          Import players first (Settings → Players)
        </p>
      ` : ''}
    ` : ''}
    <button class="btn btn-secondary"
            @click=${() => window.location.href = `/season/${this.seasonId}/draft/snake`}>
      Preview Draft Room
    </button>
  </div>
` : ''}
```

---

### Phase 3 — Frontend: Dry-run mode in `page-snake-draft.ts`

**New state + auth fields:**

```typescript
@state() private isDryRun = false;
private me: any = null;  // not @state — doesn't change after load
```

**Import `getCachedUser`** from `auth.ts` (add to existing import at line 4):

```typescript
import { getMe, getToken, isAdmin, getCachedUser } from '../services/auth.js';
```

**In `connectedCallback`** (after `await getMe()` at line 205):

```typescript
this.me = getCachedUser();
```

**Update `DraftState` interface** (lines 8–20) — add `owner_id` to teams array element shape:

```typescript
interface DraftState {
  status: string;
  total_rounds: number;
  team_count: number;
  current_pick_number: number;
  current_round: number;
  current_team_id: string | null;
  current_team_name: string | null;
  is_complete: boolean;
  picks: any[];
  teams: Array<{ id: string; name: string; draft_position: number; owner_id: string | null }>;
  timer_seconds: number;
}
```

**In `draft_state` WS handler** (line 218):

```typescript
this.ws.on('draft_state', (data: DraftState) => {
  this.draftState = data;
  this.paused = (data as any).paused || false;
  this.isDryRun = data.status === 'setup';  // ← add
});
```

**Suppress WS sends in dry-run:**

```typescript
private pickPlayer(playerId: string) {
  if (this.isDryRun) return;
  this.ws?.pick(playerId);
}

private undoLastPick() {
  if (this.isDryRun) return;
  this.ws?.undoLastPick();
}

private togglePause() {
  if (this.isDryRun) return;
  // ...existing logic
}
```

**`startDraft` method** (new — called from preview banner):

```typescript
private async startDraft() {
  await api.startDraft(this.seasonId);
  // isDryRun will flip false automatically when WS broadcasts the new draft_state
}
```

**Preview banner CSS** (add to `static styles`):

```css
.preview-banner {
  background: #1e293b;
  border: 1px solid #475569;
  color: #e2e8f0;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.preview-banner span { font-weight: 600; }
```

**Preview banner in `render()`** (add after existing `complete-banner`, before layout div):

```typescript
${this.isDryRun ? html`
  <div class="preview-banner">
    <span>Preview Mode — Draft has not started yet</span>
    ${isAdmin() ? html`
      <button class="btn btn-primary btn-sm" @click=${this.startDraft}>
        Start Draft
      </button>
    ` : ''}
  </div>
` : ''}
```

---

### Phase 4 — Frontend: Board highlight + My Team panel

**Computed getters** (add after `uniqueDesignations` getter):

```typescript
private get myTeamId(): string | null {
  if (!this.me || !this.draftState) return null;
  const mine = this.draftState.teams.find((t) => t.owner_id === this.me.user_id);
  return mine?.id ?? null;
}

private get myPicks(): any[] {
  if (!this.draftState || !this.myTeamId) return [];
  return this.draftState.picks.filter((p: any) => p.team_id === this.myTeamId);
}
```

**Board column highlight — `renderBoard()` changes:**

Team header (line 357):
```typescript
${teams.map((t: any) => html`
  <div class="board-header ${t.id === this.myTeamId ? 'my-team-header' : ''}">
    ${t.name}
  </div>
`)}
```

Board cell (line 338):
```typescript
<div class="board-cell
    ${pick ? 'picked' : ''}
    ${isCurrent ? 'current' : ''}
    ${team.id === this.myTeamId ? 'my-team-cell' : ''}">
```

**New CSS for column highlight:**

```css
.board-header.my-team-header {
  background: #92400e;
  outline: 2px solid #f5a623;
  outline-offset: -2px;
}

.board-cell.my-team-cell {
  background: rgba(245, 166, 35, 0.07);
}
```

**"My Team" panel** — add in `render()` sidebar, after the status bar and before the player pool card:

```typescript
${this.myTeamId ? html`
  <div class="card" style="padding: 0.75rem;">
    <h3 style="margin: 0 0 0.5rem;">My Team</h3>
    ${this.draftState?.current_team_id === this.myTeamId ? html`
      <p style="color:#f5a623;font-weight:600;font-size:0.85rem;margin:0 0 0.5rem;">
        You're on the clock!
      </p>
    ` : ''}
    ${this.myPicks.length === 0
      ? html`<p style="color:#64748b;font-size:0.85rem;margin:0;">No picks yet</p>`
      : this.myPicks.map((p: any) => html`
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:0.3rem 0;border-bottom:1px solid #1e293b;">
            <div>
              <div style="font-size:0.85rem;">${p.player_name}</div>
              <div style="font-size:0.7rem;color:#64748b;">
                ${p.player_designation} · ${p.player_team}
              </div>
            </div>
            <div style="font-size:0.75rem;color:#64748b;flex-shrink:0;">R${p.round}</div>
          </div>
        `)
    }
  </div>
` : ''}
```

**Gate Pick button to active turn** — in the player pool section, update the Pick button:

```typescript
// Find the Pick button render (~line 438), update disabled condition:
?disabled=${isDrafted || this.isDryRun ||
            (state && !state.is_complete &&
             state.current_team_id !== this.myTeamId &&
             !isAdmin())}
```

This disables the Pick button when:
- Player already drafted
- In dry-run/preview mode
- It's not the current user's turn (non-admins only — admins can always force-pick)

---

## Alternative Approaches Considered

### `?preview=1` query param to skip WS
Could detect preview mode from URL and bypass WS entirely, loading state via `api.getDraft()` instead. Rejected — the WS state shape differs from the REST `/draft` response shape; aligning them would be extra work. Using the WS `status` field is simpler and keeps a single code path.

### Dry-run with in-memory simulated picks
True dry-run where users can make fake picks that are stored locally and reset on leave. Rejected for now — useful but adds significant state management complexity. The current design gives users visibility into the empty board structure and player pool, which satisfies the core preview need. Simulated picking can be added in a future phase.

### Separate "preview" route
`/season/:id/draft/snake/preview` as a distinct route. Rejected — the season status is already the source of truth; routing to a separate URL adds indirection without benefit.

---

## System-Wide Impact

### Interaction Graph

`owner_id` addition:
1. `get_draft_state` builds teams list with `owner_id` → `DraftState.teams` carries the field
2. `_serialize_state` passes `state.teams` through verbatim (no change needed there)
3. WS `draft_state` broadcast → frontend receives `owner_id` in team objects
4. `myTeamId` getter resolves → board highlight + My Team panel activate

Dry-run → live transition:
1. Admin clicks "Start Draft" in preview banner → `api.startDraft()` → `POST /api/seasons/:id/start-draft`
2. Backend: season status transitions to `"drafting"`
3. WS: broadcasts new `draft_state` with `status: "drafting"` to all connected clients
4. All clients: `isDryRun` flips `false` → preview banner disappears, Pick buttons activate, commissioner controls appear
5. No page reload needed — seamless transition

### Error & Failure Propagation

- `api.startDraft()` failure from preview banner: no try/catch in `startDraft` method — add `this.error` display consistent with page pattern
- `owner_id` null (team has no owner): `myTeamId` returns null → "My Team" panel hidden, no column highlight — graceful degradation
- Non-admin user without a team in the season: `myTeamId` returns null → same graceful degradation; Pick buttons show but are functionally disabled (backend guards enforce turn order)

### State Lifecycle Risks

- `isDryRun` is derived from WS state, not URL or local storage — always in sync with actual season status across all connected clients
- If admin starts draft from `page-season.ts` (not the preview banner) while another user is in preview mode, the WS broadcast correctly flips `isDryRun = false` for all tabs
- `me` is loaded once in `connectedCallback` and never changes — safe as a non-reactive private field

### API Surface Parity

- `owner_id` is added to the WS `draft_state` teams payload. The REST `GET /api/seasons/:id/teams` endpoint (via `api.getTeams()`) likely already includes `owner_id` in its Pydantic response model — verify before Phase 4 to ensure consistency. If not, add there too.

### Integration Test Scenarios

1. **Non-admin user enters preview, picks are suppressed** — connect WS with SETUP season, attempt pick → no WS pick message sent, no DB change, error not displayed to user
2. **Admin starts draft from preview banner** → season transitions to drafting → all connected WS clients receive new `draft_state` with `status: "drafting"` → `isDryRun` flips false on all clients simultaneously
3. **User with no team visits draft room** → `myTeamId = null` → no My Team panel, no column highlight, Pick buttons hidden (wait, Pick buttons should still show but remain disabled by turn guard — confirm desired behavior)
4. **Multiple teams, correct column highlighted** → user owns "Stunners" (draft_position 2) → board round 2 (even, reversed) shows "Stunners" at position N-2 → highlight still applied correctly because it matches by `team.id` not position
5. **`timer_seconds` fix** → admin reset timer → clients receive correct timer value from `pick_timer_seconds` config key → countdown resets to configured value not 0

---

## Acceptance Criteria

### Functional

**Preview entry point:**
- [x] "Preview Draft Room" button visible to all users on Draft Room tab when `status = setup`
- [x]"Start Draft" button visible to admin only (non-admin cannot see it, backend still guards it)
- [x]Clicking "Preview Draft Room" navigates to `/season/:id/draft/snake`

**Dry-run mode:**
- [x]Draft room loads without error for SETUP seasons (backend fix already merged ✓)
- [x]Preview banner shown: "Preview Mode — Draft has not started yet"
- [x]Pick button does not send WS message in dry-run (suppressed client-side)
- [x]Admin sees "Start Draft" button in preview banner
- [x]Admin clicking "Start Draft" from preview banner transitions to live draft
- [x]Preview banner disappears and picks activate without page reload after start

**Board + My Team panel:**
- [x]Current user's team column header has distinct visual treatment (amber outline, darker bg)
- [x]Current user's team cells have subtle amber background tint
- [x]"My Team" panel appears in sidebar when `owner_id` resolves to a team
- [x]"My Team" panel shows each pick with player name, designation, IPL team, and round
- [x]"You're on the clock!" shown when `current_team_id === myTeamId`
- [x]Pick button disabled when it's not the current user's turn (non-admin)
- [x]Admin Pick buttons never disabled by turn order
- [x]No "My Team" panel shown when user has no team in the season (graceful)

**Timer fix:**
- [x]`admin_timer_reset` resets countdown to the configured `pick_timer_seconds` value, not 0

**Security guards:**
- [x]`POST /api/seasons/:id/start-draft` returns 403 for non-admin callers
- [x]`force_pick` WS message from non-admin returns personal error, no pick made
- [x]`undo_last_pick` WS message from non-admin returns personal error, no undo

### Non-Functional
- [x]`owner_id` addition requires no DB migration (FK column already exists)
- [x]No additional DB queries introduced (FK value loaded with ORM row)
- [x]Dry-run → live transition requires no page reload
- [x]All new UI elements follow existing `.card` / `.btn` / color patterns from `shared-styles.ts`

---

## Dependencies & Prerequisites

- Phase 1 (all backend changes) is independent and can ship before any frontend changes
- Phase 1a (`owner_id`) must ship before Phase 4 (My Team panel, board highlight)
- Phase 1b/1c/1d (timer fix + security guards) can ship in any order relative to frontend
- Phase 2 (entry point) and Phase 3 (dry-run) are independent of each other and can ship together
- Backend bug fix (`len(teams)`) already merged ✓
- `getCachedUser` and `isAdmin` already exported from `auth.ts` — only need to add `getCachedUser` to import in `page-snake-draft.ts`

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `owner_id` null for all teams in test data | Medium | Low | Graceful: no panel, no highlight |
| Admin starts draft from season page while users are in preview | Low | Low | WS broadcast flips `isDryRun` for all clients — no action needed |
| `timer_seconds` fix reveals previously-hidden timer misconfiguration | Low | Low | One-line fix; if timer was always 0, the fix makes it correct |
| Pick button turn-gating breaks admin force-pick | Low | Medium | `!isAdmin()` exemption in disabled condition covers this |
| REST `/api/seasons/:id/teams` missing `owner_id` in response schema | Medium | Low | Verify `TeamResponse` Pydantic model; add field if absent |
| Admin guard on `start-draft` breaks existing non-admin usage | Low | Low | In this app, only admins create seasons — non-admins should never have been able to start drafts |
| Admin guard on `undo_last_pick` prevents team owners from self-correcting | Low | Low | Only admins should have undo rights; team owners can ask admin to undo |

---

## Sources & References

### Internal References

- Bug fix (already merged): [backend/app/services/snake_draft_service.py:110](backend/app/services/snake_draft_service.py#L110)
- Teams serialization to update: [backend/app/services/snake_draft_service.py:66-70](backend/app/services/snake_draft_service.py#L66)
- Timer key mismatch (latent bug): [backend/app/services/snake_draft_service.py:100](backend/app/services/snake_draft_service.py#L100)
- `_serialize_state` (no change needed): [backend/app/ws/snake_ws.py:174](backend/app/ws/snake_ws.py#L174)
- `Team.owner_id` field: [backend/app/models/team.py:19](backend/app/models/team.py#L19)
- `DraftState` interface: [frontend/src/pages/page-snake-draft.ts:8](frontend/src/pages/page-snake-draft.ts#L8)
- `renderBoard()`: [frontend/src/pages/page-snake-draft.ts:314](frontend/src/pages/page-snake-draft.ts#L314)
- `connectedCallback`: [frontend/src/pages/page-snake-draft.ts:203](frontend/src/pages/page-snake-draft.ts#L203)
- `renderDraftRoom()`: [frontend/src/pages/page-season.ts:263](frontend/src/pages/page-season.ts#L263)
- `getCachedUser()`: [frontend/src/services/auth.ts:52](frontend/src/services/auth.ts#L52)
- `isAdmin()`: [frontend/src/services/auth.ts:56](frontend/src/services/auth.ts#L56)
- `api.startDraft()`: [frontend/src/services/api.ts:87](frontend/src/services/api.ts#L87)
- `start_draft` endpoint (missing admin guard): [backend/app/routers/seasons.py:192](backend/app/routers/seasons.py#L192)
- `force_pick` WS handler (missing admin guard): [backend/app/ws/snake_ws.py:88](backend/app/ws/snake_ws.py#L88)
- `undo_last_pick` WS handler (missing admin guard): [backend/app/ws/snake_ws.py:106](backend/app/ws/snake_ws.py#L106)
