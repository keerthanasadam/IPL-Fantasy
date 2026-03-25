---
title: "feat: Team Roster View with Player Points"
type: feat
status: completed
date: 2026-03-24
origin: docs/brainstorms/2026-03-24-team-roster-player-points-brainstorm.md
---

# feat: Team Roster View with Player Points

## Overview

After the draft completes, there is no way for league members to see which players each team drafted or how many points those players have earned. This feature closes that gap by:

1. Adding a `points` field to the `Player` model (season-scoped, updated via the existing CSV import)
2. Exposing a public `/rosters` endpoint that returns all teams with their drafted players and points
3. Making the standings table on the league home page expand per team to show their roster inline

(see brainstorm: docs/brainstorms/2026-03-24-team-roster-player-points-brainstorm.md)

---

## Problem Statement

The league home page (`page-league.ts`) shows a standings table (rank, team name, manager, pts) but gives no way to drill into a team's roster. After the draft, managers and spectators want to know:
- Which players are on each team?
- How many points has each player scored?
- How does a team's total points break down across players?

There is also no player-level points field — the admin can update `Team.points` but there's no per-player tracking and no automatic rollup.

---

## Proposed Solution

### Backend changes

1. **Migration** — add `points NUMERIC(10,2) DEFAULT 0 NULLABLE` to the `players` table.
2. **Player model** — add `points: Mapped[Decimal | None]` field.
3. **Player schema** — add `points: float | None = None` to `PlayerResponse`.
4. **Player import** — handle optional `Points` column in the CSV. After all rows are processed, recalculate `team.points = SUM(player.points)` for every team in the season whose players were touched.
5. **New public roster endpoint** — `GET /api/seasons/{season_id}/rosters`: no auth required when season status is `completed` or `active`. Returns all teams in draft-position order, each with their picked players (name, ipl_team, designation, points). Uses existing `SnakePick` join.

### Frontend changes

6. **`page-league.ts`** — add `expandedTeams: Set<string>` state. When a team row is clicked, toggle expanded state and (if first expand) fetch rosters for the season. Cache the result to avoid repeat requests.
7. **Roster display** — render an inline sub-table under each expanded team row: player name, IPL team, designation, and points (points column hidden when no scores uploaded yet).
8. **`api.ts`** — add `getSeasonRosters(seasonId)` method (no auth headers — public endpoint).

---

## Technical Considerations

### Roster endpoint vs re-using draft state
The existing `GET /api/seasons/{season_id}/draft` endpoint already returns all picks with player info, but (a) it requires auth and (b) it includes draft-engine state (current pick, timer, etc.) irrelevant to a post-draft summary. A purpose-built `/rosters` endpoint is cleaner and public. (see brainstorm: decision table)

### Team points recalculation on import
When the CSV import updates player points, we need to recalculate `team.points` for all affected teams. The safest approach: after committing player updates, run a single query per team in the season:

```sql
SELECT COALESCE(SUM(p.points), 0)
FROM players p
JOIN snake_picks sp ON sp.player_id = p.id
WHERE sp.team_id = :team_id
  AND sp.is_undone = false
  AND sp.season_id = :season_id
```

Then update each `Team.points` and commit.

### Public visibility
The roster endpoint checks `season.status in ('completed', 'active')` and returns 403 otherwise. No JWT required. This matches the brainstorm decision: "Public once draft is completed." (see brainstorm: Resolved Questions)

### Points column conditional rendering
The frontend should only render the `Pts` column in the roster sub-table if `hasScores` is true — computed as `any player in any roster has points > 0`. This avoids a meaningless all-zeros column before scores are uploaded.

---

## System-Wide Impact

- **Import endpoint** (`POST /api/seasons/{season_id}/players/import`) gains side-effect: updates `Team.points` after player upsert. The existing `ImportResult` schema is unchanged; no new fields needed.
- **`PlayerResponse` schema** gains `points` field. All consumers of `PlayerListResponse` (the players page, draft room player list) will start receiving points — this is additive and safe.
- **No WebSocket changes** — the draft room live state is unaffected; player points are a post-draft concern.
- **No auth middleware changes** — the new roster endpoint bypasses `get_current_user` by not using that dependency.

---

## Acceptance Criteria

- [x] `players` table has a `points` column (Numeric, nullable, default 0)
- [x] Uploading a CSV with a `Points` column updates `player.points` for matching players
- [x] After a points import, each team's `team.points` equals the sum of their drafted players' points
- [x] `GET /api/seasons/{season_id}/rosters` returns 200 (no auth) when season is `completed`
- [x] Roster response includes: team id, name, points, and list of players (name, ipl_team, designation, points, ranking)
- [x] `GET /api/seasons/{season_id}/rosters` returns 403 when season status is `setup` or `drafting`
- [x] On the league home page, clicking a team row expands to show their roster inline
- [x] Roster rows show: player name, IPL team, designation, and points
- [x] Points column is hidden when no player has points > 0
- [x] Clicking the same row again collapses the roster
- [x] Rosters load once and are cached for the page session (no re-fetch on re-expand)
- [x] Expanding works for all teams independently (multiple teams can be open at once)

---

## ERD Change

```mermaid
erDiagram
    Player {
        uuid id PK
        uuid season_id FK
        string name
        string ipl_team
        string designation
        int ranking
        numeric points   %% NEW
        jsonb metadata_
    }
    Team {
        uuid id PK
        uuid season_id FK
        string name
        int draft_position
        uuid owner_id FK
        numeric budget
        numeric points   %% recalculated from player.points
    }
    SnakePick {
        uuid id PK
        uuid season_id FK
        uuid team_id FK
        uuid player_id FK
        int pick_number
        int round
        bool is_undone
    }
    Player ||--o{ SnakePick : "picked in"
    Team ||--o{ SnakePick : "owns"
```

---

## Implementation Steps

### Step 1 — Migration
**File:** `backend/migrations/versions/<new_revision>_add_points_to_players.py`

```python
def upgrade():
    op.add_column('players', sa.Column('points', sa.Numeric(10, 2), nullable=True, server_default='0'))

def downgrade():
    op.drop_column('players', 'points')
```

Generate with: `alembic revision --autogenerate -m "add_points_to_players"`

### Step 2 — Player model
**File:** `backend/app/models/player.py`

Add field after `ranking`:
```python
from decimal import Decimal
points: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True, default=Decimal("0"))
```

### Step 3 — Player schema
**File:** `backend/app/schemas/player.py`

Add to `PlayerResponse`:
```python
points: float | None = None
```

### Step 4 — Player import (points column + team recalculation)
**File:** `backend/app/routers/players.py`

In `import_players`:
1. After parsing each row, also read `points_raw = row.get("Points", "").strip()` and parse to `Decimal` (skip if blank/invalid).
2. When upserting, set `player.points = points_value` (or leave existing if column absent).
3. After `await db.commit()`, run team recalculation:

```python
# Recalculate team totals for all teams in this season
teams_stmt = select(Team).where(Team.season_id == season_id)
teams_result = await db.execute(teams_stmt)
for team in teams_result.scalars().all():
    sum_stmt = (
        select(func.coalesce(func.sum(Player.points), 0))
        .join(SnakePick, SnakePick.player_id == Player.id)
        .where(SnakePick.team_id == team.id)
        .where(SnakePick.is_undone == False)
    )
    total = (await db.execute(sum_stmt)).scalar()
    team.points = total
await db.commit()
```

### Step 5 — Roster endpoint
**File:** `backend/app/routers/teams.py`

```python
@router.get("/seasons/{season_id}/rosters")
async def get_season_rosters(
    season_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    season_stmt = select(Season).where(Season.id == season_id)
    season = (await db.execute(season_stmt)).scalar_one_or_none()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status not in ("completed", "active"):
        raise HTTPException(status_code=403, detail="Rosters are only public once the draft is complete")

    teams_stmt = select(Team).where(Team.season_id == season_id).order_by(Team.draft_position)
    teams = (await db.execute(teams_stmt)).scalars().all()

    result = []
    for team in teams:
        picks_stmt = (
            select(Player)
            .join(SnakePick, SnakePick.player_id == Player.id)
            .where(SnakePick.team_id == team.id)
            .where(SnakePick.is_undone == False)
            .order_by(SnakePick.pick_number)
        )
        players = (await db.execute(picks_stmt)).scalars().all()
        result.append({
            "team_id": str(team.id),
            "team_name": team.name,
            "team_points": float(team.points),
            "players": [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "ipl_team": p.ipl_team,
                    "designation": p.designation,
                    "ranking": p.ranking,
                    "points": float(p.points) if p.points is not None else 0.0,
                }
                for p in players
            ],
        })
    return result
```

### Step 6 — api.ts
**File:** `frontend/src/services/api.ts`

Add after `getDraft`:
```ts
getSeasonRosters(seasonId: string) {
  return fetch(`${BASE}/seasons/${seasonId}/rosters`).then(handleResponse);
},
```
No auth headers — public endpoint.

### Step 7 — page-league.ts
**File:** `frontend/src/pages/page-league.ts`

Key changes:
- Add `@state() private expandedTeams = new Set<string>();`
- Add `@state() private rosters: Record<string, any[]> = {};`
- Add `@state() private rostersLoaded = false;`
- `toggleTeam(teamId)`: if not loaded yet, call `api.getSeasonRosters(seasonId)` and populate `this.rosters`; then toggle `expandedTeams`.
- Only load rosters if `season.status === 'completed'` (no expand button shown otherwise).
- Compute `hasScores`: `Object.values(this.rosters).some(players => players.some(p => p.points > 0))`.

Standings row becomes clickable when season is completed:
```ts
<tr @click=${() => this.toggleTeam(t.id)}
    style="cursor:${isDraftComplete ? 'pointer' : 'default'}">
  <td>${i + 1}</td>
  <td>${t.name} ${isDraftComplete ? (expanded ? '▾' : '▸') : ''}</td>
  ...
</tr>
${expanded ? html`
  <tr>
    <td colspan="4" style="padding:0;">
      ${this.renderRoster(t.id)}
    </td>
  </tr>
` : ''}
```

`renderRoster(teamId)`:
```ts
private renderRoster(teamId: string) {
  const players = this.rosters[teamId] ?? [];
  return html`
    <table style="width:100%;background:#0f172a;">
      <thead>
        <tr>
          <th>Player</th><th>IPL Team</th><th>Role</th>
          ${this.hasScores ? html`<th>Pts</th>` : ''}
        </tr>
      </thead>
      <tbody>
        ${players.map(p => html`
          <tr>
            <td>${p.name}</td>
            <td class="text-muted">${p.ipl_team}</td>
            <td class="text-muted">${p.designation}</td>
            ${this.hasScores ? html`<td class="text-gold">${p.points.toFixed(1)}</td>` : ''}
          </tr>
        `)}
      </tbody>
    </table>
  `;
}
```

---

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Player name mismatch on points CSV upload | Import already matches by `name.lower()` — same tolerance as current upsert |
| Team points desync if picks are undone after score upload | Recalculation runs on every import; manual admin action can re-import to reset |
| Season in `active` status (not `completed`) but rosters requested | Endpoint accepts both `active` and `completed` — this is intentional post-draft visibility |
| Large leagues with many teams causing N+1 queries in roster endpoint | Currently N queries (one per team). Acceptable for league sizes (≤16 teams). Can optimize with a single JOIN query later. |

---

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-24-team-roster-player-points-brainstorm.md](docs/brainstorms/2026-03-24-team-roster-player-points-brainstorm.md)
  - Key decisions carried forward: expand-inline (not new page), points on Player model, reuse CSV import, public after draft complete
- Player model: [backend/app/models/player.py](backend/app/models/player.py)
- Player import router: [backend/app/routers/players.py:49](backend/app/routers/players.py)
- Teams router: [backend/app/routers/teams.py](backend/app/routers/teams.py)
- League page: [frontend/src/pages/page-league.ts:89](frontend/src/pages/page-league.ts)
- Migration pattern: [backend/migrations/versions/14e1406a0a34_add_ranking_to_players.py](backend/migrations/versions/14e1406a0a34_add_ranking_to_players.py)
