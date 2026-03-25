# Brainstorm: Team Roster View with Player Points

**Date:** 2026-03-24
**Status:** Ready for planning

---

## What We're Building

After a draft completes, users have no way to see which players each team drafted or how many fantasy points those players have scored. This feature adds:

1. **Expandable team rows** on the league home page standings — clicking a team reveals their full roster inline
2. **Player-level points** — a `points` field on the Player model, updated via CSV upload
3. **Team total sync** — when player points are uploaded, each team's total automatically reflects the sum of their players' points
4. **Public visibility** — rosters (and points) are visible to anyone once the draft is completed, no login required

---

## Why This Approach

### Expand standings cards (chosen over dedicated team page or new tab)
Keeps all post-draft information in one place. The standings table already exists; expanding rows is the lowest-friction way to surface roster data without adding navigation complexity. A separate team page adds a route and extra navigation for something you'd typically glance at quickly.

### Points on Player model (chosen over SnakePick or team-only)
Players are already season-scoped (`season_id` FK), so a `points` field on Player is naturally isolated per season. It avoids a more complex aggregation model and aligns with the existing CSV import pattern — just add a column.

### Reuse existing CSV import (chosen over a separate scores-only upload)
The import endpoint already does upsert-by-name within a season. Extending it to handle a `points` column means no new endpoint, no new frontend uploader, and a consistent format for the admin.

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where to display | Expand standings rows | Minimal navigation, all info in one place |
| Player points storage | `points` field on Player model | Season-scoped, aligns with existing import |
| Score upload mechanism | Same CSV + `points` column | Reuses existing import endpoint/UI |
| Team total update | Auto-recalculate on score import | Keeps Team.points in sync automatically |
| Visibility | Public once draft is completed | Matches the spirit of a public league |

---

## Implementation Scope

### Backend
1. **Migration:** Add `points: Numeric` column to `players` table (nullable, default 0)
2. **Player import:** Handle optional `points` column during CSV import; after updating players, recalculate and update `team.points = SUM(player.points)` for each affected team
3. **Roster endpoint:** Add `GET /api/seasons/{season_id}/teams/{team_id}/roster` — returns team info + list of their picked players (with points). No auth required when season is completed.
4. **Season draft endpoint:** May already serve enough data; evaluate whether a dedicated roster endpoint is cleaner

### Frontend
1. **Standings table** (`page-league.ts`): Add expand/collapse toggle per team row
2. **Roster fetch:** On expand, call roster endpoint (or parse from cached draft state)
3. **Roster display:** Show player name, IPL team, designation, points per player; subtotal at the bottom
4. **Points column:** Only show points column if any player has points > 0 (i.e., scores have been uploaded)

---

## Open Questions

_None — all resolved during brainstorm._

## Resolved Questions

- **Where to show rosters?** → Expand standings cards inline (not a new page or tab)
- **How to track player points?** → Add `points` field to Player model
- **Score CSV format?** → Same CSV reused with an optional `points` column
- **Who can see rosters?** → Public once draft is completed (no auth required)

---

## Out of Scope

- Per-match point breakdowns (just total points for now)
- Historical points tracking across seasons
- Auction draft roster view (snake only for now, can extend later)
