"""Core snake draft engine.

Snake draft order: In odd rounds (1, 3, 5...) teams pick in ascending order.
In even rounds (2, 4, 6...) teams pick in descending order (snake back).

Example with 4 teams, positions [1, 2, 3, 4]:
  Round 1: 1, 2, 3, 4
  Round 2: 4, 3, 2, 1
  Round 3: 1, 2, 3, 4
  ...
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.player import Player
from app.models.season import Season, SeasonStatus
from app.models.snake_pick import SnakePick
from app.models.team import Team


@dataclass
class DraftState:
    season_id: uuid.UUID
    status: str
    total_rounds: int
    team_count: int
    current_pick_number: int
    current_round: int
    current_team_id: uuid.UUID | None
    current_team_name: str | None
    is_complete: bool
    picks: list[dict]
    teams: list[dict]
    timer_seconds: int


def calculate_snake_turn(pick_number: int, team_count: int, teams: list[dict]) -> tuple[int, dict]:
    """Given a 1-based pick number, return (round, team_dict) for that pick."""
    round_num = (pick_number - 1) // team_count + 1
    position_in_round = (pick_number - 1) % team_count

    # Snake: odd rounds go forward, even rounds go backward
    if round_num % 2 == 1:
        team_index = position_in_round
    else:
        team_index = team_count - 1 - position_in_round

    return round_num, teams[team_index]


async def get_draft_state(db: AsyncSession, season_id: uuid.UUID) -> DraftState:
    """Build the full draft state from the database."""
    # Get season
    stmt = select(Season).where(Season.id == season_id)
    result = await db.execute(stmt)
    season = result.scalar_one_or_none()
    if not season:
        raise ValueError("Season not found")

    # Get teams ordered by draft_position
    teams_stmt = select(Team).where(Team.season_id == season_id).order_by(Team.draft_position)
    teams_result = await db.execute(teams_stmt)
    teams = [
        {
            "id": str(t.id),
            "name": t.name,
            "draft_position": t.draft_position,
            "owner_id": str(t.owner_id) if t.owner_id else None,
        }
        for t in teams_result.scalars().all()
    ]

    # Get active picks (not undone)
    picks_stmt = (
        select(SnakePick)
        .where(SnakePick.season_id == season_id, SnakePick.is_undone == False)
        .order_by(SnakePick.pick_number)
    )
    picks_result = await db.execute(picks_stmt)
    pick_rows = picks_result.scalars().all()

    # Build pick list with player info
    picks = []
    for p in pick_rows:
        player_stmt = select(Player).where(Player.id == p.player_id)
        player_result = await db.execute(player_stmt)
        player = player_result.scalar_one_or_none()
        team_name = next((t["name"] for t in teams if t["id"] == str(p.team_id)), "Unknown")
        picks.append({
            "pick_number": p.pick_number,
            "round": p.round,
            "team_id": str(p.team_id),
            "team_name": team_name,
            "player_id": str(p.player_id),
            "player_name": player.name if player else "Unknown",
            "player_team": player.ipl_team if player else "",
            "player_designation": player.designation if player else "",
        })

    total_rounds = (season.draft_config or {}).get("rounds", 15)
    timer_seconds = (season.draft_config or {}).get("pick_timer_seconds", 0)
    team_count = season.team_count
    total_picks = total_rounds * team_count
    next_pick_number = len(picks) + 1
    is_complete = next_pick_number > total_picks

    current_team_id = None
    current_team_name = None
    current_round = 1
    if not is_complete and teams:
        current_round, current_team = calculate_snake_turn(next_pick_number, len(teams), teams)
        current_team_id = uuid.UUID(current_team["id"])
        current_team_name = current_team["name"]

    return DraftState(
        season_id=season_id,
        status=season.status.value if hasattr(season.status, 'value') else season.status,
        total_rounds=total_rounds,
        team_count=team_count,
        current_pick_number=next_pick_number,
        current_round=current_round,
        current_team_id=current_team_id,
        current_team_name=current_team_name,
        is_complete=is_complete,
        picks=picks,
        teams=teams,
        timer_seconds=timer_seconds,
    )


async def make_pick(
    db: AsyncSession,
    season_id: uuid.UUID,
    player_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    force_team_id: uuid.UUID | None = None,
) -> dict:
    """Make a snake draft pick. Returns the pick data or raises ValueError."""
    state = await get_draft_state(db, season_id)

    if state.status != "drafting":
        raise ValueError("Draft is not active")
    if state.is_complete:
        raise ValueError("Draft is already complete")

    # Determine which team is picking
    if force_team_id:
        team_id = force_team_id
    elif state.current_team_id:
        team_id = state.current_team_id
    else:
        raise ValueError("No team on the clock")

    # Check player is not already drafted
    drafted_player_ids = {p["player_id"] for p in state.picks}
    if str(player_id) in drafted_player_ids:
        raise ValueError("Player already drafted")

    # Verify player exists in this season
    player_stmt = select(Player).where(Player.id == player_id, Player.season_id == season_id)
    player_result = await db.execute(player_stmt)
    player = player_result.scalar_one_or_none()
    if not player:
        raise ValueError("Player not found in this season")

    pick = SnakePick(
        season_id=season_id,
        pick_number=state.current_pick_number,
        round=state.current_round,
        team_id=team_id,
        player_id=player_id,
        picked_by=user_id,
    )
    db.add(pick)

    # Check if draft is now complete
    total_picks = state.total_rounds * state.team_count
    if state.current_pick_number >= total_picks:
        season_stmt = select(Season).where(Season.id == season_id)
        season_result = await db.execute(season_stmt)
        season = season_result.scalar_one()
        season.status = SeasonStatus.COMPLETED

    await db.commit()

    team_name = next((t["name"] for t in state.teams if t["id"] == str(team_id)), "Unknown")
    return {
        "pick_number": state.current_pick_number,
        "round": state.current_round,
        "team_id": str(team_id),
        "team_name": team_name,
        "player_id": str(player_id),
        "player_name": player.name,
        "player_team": player.ipl_team,
        "player_designation": player.designation,
    }


async def undo_last_pick(db: AsyncSession, season_id: uuid.UUID) -> dict | None:
    """Undo the last active pick. Returns the undone pick data or None."""
    stmt = (
        select(SnakePick)
        .where(SnakePick.season_id == season_id, SnakePick.is_undone == False)
        .order_by(SnakePick.pick_number.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    pick = result.scalar_one_or_none()
    if not pick:
        return None

    pick.is_undone = True

    # If season was completed, revert to drafting
    season_stmt = select(Season).where(Season.id == season_id)
    season_result = await db.execute(season_stmt)
    season = season_result.scalar_one()
    if season.status == SeasonStatus.COMPLETED:
        season.status = SeasonStatus.DRAFTING

    await db.commit()
    return {"pick_number": pick.pick_number, "player_id": str(pick.player_id)}
