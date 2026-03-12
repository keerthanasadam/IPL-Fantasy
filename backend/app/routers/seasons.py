import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db
from app.models.league import League
from app.models.season import DraftFormat, Season, SeasonStatus
from app.models.team import Team
from app.schemas.season import SeasonCreate, SeasonDetail, SeasonResponse, SeasonUpdate

router = APIRouter(prefix="/api", tags=["seasons"])


@router.post("/leagues/{league_id}/seasons", response_model=SeasonResponse, status_code=status.HTTP_201_CREATED)
async def create_season(
    league_id: uuid.UUID,
    body: SeasonCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify league ownership
    stmt = select(League).where(League.id == league_id, League.commissioner_id == uuid.UUID(current_user["user_id"]))
    result = await db.execute(stmt)
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    draft_format = DraftFormat(body.draft_format)
    season = Season(
        league_id=league_id,
        label=body.label,
        draft_format=draft_format,
        team_count=body.team_count,
        draft_config=body.draft_config,
    )
    db.add(season)
    await db.flush()

    # Auto-create teams
    default_budget = Decimal("200") if draft_format == DraftFormat.AUCTION else Decimal("0")
    for i in range(body.team_count):
        team = Team(
            season_id=season.id,
            name=f"Team {i + 1}",
            draft_position=i + 1,
            budget=default_budget,
        )
        db.add(team)

    await db.commit()
    await db.refresh(season)
    return season


@router.get("/seasons/{season_id}", response_model=SeasonDetail)
async def get_season(
    season_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Season).options(selectinload(Season.teams)).where(Season.id == season_id)
    result = await db.execute(stmt)
    season = result.scalar_one_or_none()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return season


@router.patch("/seasons/{season_id}", response_model=SeasonResponse)
async def update_season(
    season_id: uuid.UUID,
    body: SeasonUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Season).where(Season.id == season_id)
    result = await db.execute(stmt)
    season = result.scalar_one_or_none()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != SeasonStatus.SETUP:
        raise HTTPException(status_code=400, detail="Cannot modify season after setup")

    if body.label is not None:
        season.label = body.label
    if body.draft_config is not None:
        season.draft_config = body.draft_config

    await db.commit()
    await db.refresh(season)
    return season


@router.post("/seasons/{season_id}/start-draft", response_model=SeasonResponse)
async def start_draft(
    season_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Season).options(selectinload(Season.players)).where(Season.id == season_id)
    result = await db.execute(stmt)
    season = result.scalar_one_or_none()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != SeasonStatus.SETUP:
        raise HTTPException(status_code=400, detail="Draft already started or completed")
    if not season.players:
        raise HTTPException(status_code=400, detail="Import players before starting draft")

    season.status = SeasonStatus.DRAFTING
    await db.commit()
    await db.refresh(season)
    return season
