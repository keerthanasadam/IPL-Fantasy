import random
import secrets
import string
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_current_admin, get_current_user, get_db
from app.models.auction_event import AuctionEvent
from app.models.league import League
from app.models.player import Player
from app.models.season import DraftFormat, Season, SeasonStatus
from app.models.snake_pick import SnakePick
from app.models.team import Team
from app.schemas.season import (
    SeasonCreate,
    SeasonDetail,
    SeasonJoinRequest,
    SeasonJoinResponse,
    SeasonResponse,
    SeasonUpdate,
)

router = APIRouter(prefix="/api", tags=["seasons"])


def _generate_invite_code(label: str) -> str:
    """Generate a short unique code, e.g. IPL26-XKFM"""
    chars = string.ascii_uppercase + string.digits
    suffix = "".join(secrets.choice(chars) for _ in range(4))
    prefix = "".join(c for c in label.upper()[:5] if c.isalnum())
    return f"{prefix}-{suffix}"


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

    # Generate unique invite code with retry on collision
    for _ in range(5):
        invite_code = _generate_invite_code(body.label)
        season = Season(
            league_id=league_id,
            label=body.label,
            draft_format=draft_format,
            team_count=body.team_count,
            draft_config=body.draft_config.model_dump(exclude_none=True),
            invite_code=invite_code,
        )
        db.add(season)
        try:
            await db.flush()
            break
        except IntegrityError:
            await db.rollback()
    else:
        raise HTTPException(status_code=500, detail="Failed to generate unique invite code")

    await db.commit()
    await db.refresh(season)
    return season


# IMPORTANT: /seasons/join must be declared before /seasons/{season_id} to avoid route conflict
@router.post("/seasons/join", response_model=SeasonJoinResponse, status_code=status.HTTP_201_CREATED)
async def join_season(
    body: SeasonJoinRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(current_user["user_id"])

    # Find season by invite_code
    stmt = select(Season).options(selectinload(Season.teams), selectinload(Season.league)).where(
        Season.invite_code == body.invite_code
    )
    result = await db.execute(stmt)
    season = result.scalar_one_or_none()
    if not season:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    if season.status != SeasonStatus.SETUP:
        raise HTTPException(status_code=400, detail="Joining is closed for this season")

    # Check user doesn't already have a team in this season
    existing = next((t for t in season.teams if t.owner_id == user_id), None)
    if existing:
        raise HTTPException(status_code=400, detail="You already have a team in this season")

    # Check capacity
    if len(season.teams) >= season.team_count:
        raise HTTPException(status_code=400, detail="Season is full")

    # Check team name uniqueness within season
    name_taken = any(t.name.lower() == body.team_name.lower() for t in season.teams)
    if name_taken:
        raise HTTPException(status_code=400, detail="That team name is already taken in this season")

    budget = Decimal("200") if season.draft_format == DraftFormat.AUCTION else Decimal("0")
    team = Team(
        season_id=season.id,
        owner_id=user_id,
        name=body.team_name,
        draft_position=len(season.teams) + 1,
        budget=budget,
    )
    db.add(team)
    await db.commit()
    await db.refresh(team)
    await db.refresh(season)

    return SeasonJoinResponse(team=team, season=season, league=season.league)


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
    current_user: dict = Depends(get_current_admin),
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
        season.draft_config = body.draft_config.model_dump(exclude_none=True)

    await db.commit()
    await db.refresh(season)
    return season


@router.delete("/seasons/{season_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_season(
    season_id: uuid.UUID,
    current_user: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    season = await db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != SeasonStatus.SETUP:
        raise HTTPException(status_code=400, detail="Can only delete seasons in SETUP status")

    # Cascade in FK dependency order: picks/events → players → teams → season
    await db.execute(delete(SnakePick).where(SnakePick.season_id == season_id))
    await db.execute(delete(AuctionEvent).where(AuctionEvent.season_id == season_id))
    await db.execute(delete(Player).where(Player.season_id == season_id))
    await db.execute(delete(Team).where(Team.season_id == season_id))
    await db.delete(season)
    await db.commit()


@router.post("/seasons/{season_id}/start-draft", response_model=SeasonResponse)
async def start_draft(
    season_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Season)
        .options(selectinload(Season.players), selectinload(Season.teams))
        .where(Season.id == season_id)
    )
    result = await db.execute(stmt)
    season = result.scalar_one_or_none()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != SeasonStatus.SETUP:
        raise HTTPException(status_code=400, detail="Draft already started or completed")
    if not season.players:
        raise HTTPException(status_code=400, detail="Import players before starting draft")

    # Randomize draft positions (Fisher-Yates shuffle)
    positions = list(range(1, len(season.teams) + 1))
    random.shuffle(positions)
    for team, position in zip(season.teams, positions):
        team.draft_position = position

    season.status = SeasonStatus.DRAFTING
    await db.commit()
    await db.refresh(season)
    return season
