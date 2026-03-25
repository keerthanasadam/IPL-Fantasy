import random
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.player import Player
from app.models.season import Season
from app.models.snake_pick import SnakePick
from app.models.team import Team
from app.models.user import User
from app.schemas.team import DraftOrderUpdate, TeamResponse, TeamUpdate

router = APIRouter(prefix="/api", tags=["teams"])


@router.get("/seasons/{season_id}/teams", response_model=list[TeamResponse])
async def list_teams(
    season_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Team).where(Team.season_id == season_id).order_by(Team.draft_position)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.patch("/teams/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: uuid.UUID,
    body: TeamUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Team).where(Team.id == team_id)
    result = await db.execute(stmt)
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Ownership guard: only the team owner can rename; admins bypass
    user_id = uuid.UUID(current_user["user_id"])
    if team.owner_id is not None and team.owner_id != user_id:
        user_stmt = select(User).where(User.id == user_id)
        user_result = await db.execute(user_stmt)
        user_obj = user_result.scalar_one_or_none()
        if not user_obj or not user_obj.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't own this team",
            )

    if body.name is not None:
        team.name = body.name.strip()
        if not team.name:
            raise HTTPException(status_code=400, detail="Team name cannot be blank")
    if body.owner_id is not None:
        team.owner_id = body.owner_id

    await db.commit()
    await db.refresh(team)
    return team


@router.patch("/seasons/{season_id}/draft-order", response_model=list[TeamResponse])
async def update_draft_order(
    season_id: uuid.UUID,
    body: DraftOrderUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Team).where(Team.season_id == season_id).order_by(Team.draft_position)
    result = await db.execute(stmt)
    teams = list(result.scalars().all())

    if not teams:
        raise HTTPException(status_code=404, detail="No teams found")

    if body.randomize:
        rng = random.Random(body.seed) if body.seed is not None else random.Random()
        rng.shuffle(teams)
        for i, team in enumerate(teams):
            team.draft_position = i + 1
    elif body.order:
        team_map = {t.id: t for t in teams}
        for i, tid in enumerate(body.order):
            if tid not in team_map:
                raise HTTPException(status_code=400, detail=f"Team {tid} not found")
            team_map[tid].draft_position = i + 1

    await db.commit()

    stmt = select(Team).where(Team.season_id == season_id).order_by(Team.draft_position)
    result = await db.execute(stmt)
    return result.scalars().all()


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
            .where(SnakePick.is_undone == False)  # noqa: E712
            .order_by(SnakePick.pick_number)
        )
        players = (await db.execute(picks_stmt)).scalars().all()
        result.append({
            "team_id": str(team.id),
            "team_name": team.name,
            "team_points": float(team.points) if team.points is not None else 0.0,
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
