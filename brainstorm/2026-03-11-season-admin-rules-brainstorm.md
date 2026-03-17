---
date: 2026-03-11
topic: season-admin-rules
---

# Season Admin Rules & Management

## What We're Building

Expanding the season creation form with extended draft rules (snake draft), adding a season management UI with rename/delete/player actions, and fixing player data management via a clear-and-reimport CSV flow.

## Decisions

### 1. Season Creation — Extended Draft Rules (Snake)

All rules stored in the existing `draft_config` JSONB column on `Season`. No new columns needed.

**`draft_config` shape (snake draft):**
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

**Fields on the creation form:**
| Field | Type | Notes |
|---|---|---|
| Season Label | text | existing |
| Draft Format | select | Snake / Auction |
| Max Teams | number | existing |
| Draft Rounds | number | existing (in draft_config) |
| Pick Timer | number (seconds) | new |
| Scheduled Draft Time | datetime | new |
| On Timeout | select | Auto-pick / Skip turn |
| Role Limits | inline table | per role: min + max pickers |

**Auction rules:** Designed later — separate brainstorm when needed.

---

### 2. Live Draft Admin Controls (WebSocket)

Admin can, during a live snake draft:
- **Pause entire draft** — broadcasts `draft_paused` to all clients; picks blocked until resumed
- **Resume draft** — broadcasts `draft_resumed`; timer restarts
- **Reset current team's timer** — resets pick timer for the currently active team without skipping their turn

New WebSocket message types needed in `snake_ws.py`:
```
admin_pause_draft   → { type: "admin_pause_draft" }
admin_resume_draft  → { type: "admin_resume_draft" }
admin_reset_timer   → { type: "admin_reset_timer" }
```

Server validates sender is admin before applying.

---

### 3. Season Management — Settings Tab

**Location:** `page-season.ts` at `/season/:seasonId` gets a tabbed layout:

```
[Home]  [Draft Room]  [⚙ Settings]   ← Settings tab: admin only
```

**Settings tab sections:**

#### General
- Rename season: inline edit → `PATCH /api/seasons/:id { label }`  (already implemented)
- Delete season: red button, disabled unless `status = SETUP`
  - On click: confirmation dialog "This will delete all teams and players. Cannot be undone."
  - On confirm: `DELETE /api/seasons/:id` (needs to be built)

#### Draft Rules
- Edit `draft_config` fields (same fields as creation form)
- Save: `PATCH /api/seasons/:id { draft_config }` (already implemented, but locked after SETUP)

#### Players
- Shows current player count for this season
- **"Clear All Players"** button → `DELETE /api/seasons/:id/players` (already implemented)
- CSV upload → `POST /api/seasons/:id/players/import` (already implemented, season_id from route)
- Recommended flow displayed in UI: "Clear first, then re-upload to avoid duplicates"

---

### 4. Player Data Fix (Immediate)

Current bad data: players exist in DB with wrong team associations.

**Fix (no code change needed):**
1. Admin navigates to `/season/:seasonId` → Settings → Players
2. Clicks "Clear All Players" (calls `DELETE /api/seasons/:seasonId/players` — already built)
3. Uploads corrected CSV (calls `POST /api/seasons/:seasonId/players/import` — already built)

The `season_id` is derived from the URL route parameter — no manual entry needed.

---

## What Already Exists (Don't Rebuild)

| Feature | Endpoint | Status |
|---|---|---|
| Rename season | `PATCH /api/seasons/:id` | ✅ Built |
| Update draft_config | `PATCH /api/seasons/:id` | ✅ Built |
| Clear season players | `DELETE /api/seasons/:id/players` | ✅ Built |
| CSV player import (season-scoped) | `POST /api/seasons/:id/players/import` | ✅ Built |

## What Needs to Be Built

### Backend
1. `DELETE /api/seasons/:id` — delete season (guard: status = SETUP only, cascade teams + players)
2. Admin guard on `PATCH /api/seasons/:id` draft_config updates (currently no role check)
3. WebSocket: `admin_pause_draft`, `admin_resume_draft`, `admin_reset_timer` message handlers

### Frontend
1. Season creation form — add pick_timer, scheduled_draft_time, on_timeout, role_limits fields
2. `page-season.ts` — tabbed layout with Settings tab (General / Draft Rules / Players sections)
3. Delete season button + confirmation dialog
4. Draft room (`page-snake-draft.ts`) — admin controls panel: Pause, Resume, Reset Timer buttons

## Open Questions
- Role limit enforcement: validate at pick time (WebSocket) or at draft-start? → Pick time is safer
- ~~Should `scheduled_draft_time` auto-open the draft room?~~ **Decision: informational only** — admin manually clicks Start Draft
- Role limit categories: WK / BAT / BOWL / AR — are these the exact designations in your CSV?

## Next Steps
→ `/ce:plan` for implementation details
