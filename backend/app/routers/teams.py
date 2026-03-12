import random
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.season import Season
from app.models.team import Team
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

    if body.name is not None:
        team.name = body.name
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
