import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db
from app.models.league import League
from app.schemas.league import LeagueCreate, LeagueDetail, LeagueResponse

router = APIRouter(prefix="/api/leagues", tags=["leagues"])


@router.post("", response_model=LeagueResponse, status_code=status.HTTP_201_CREATED)
async def create_league(
    body: LeagueCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    league = League(name=body.name, commissioner_id=uuid.UUID(current_user["user_id"]))
    db.add(league)
    await db.commit()
    await db.refresh(league)
    return league


@router.get("", response_model=list[LeagueResponse])
async def list_leagues(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(League).where(League.commissioner_id == uuid.UUID(current_user["user_id"]))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{league_id}", response_model=LeagueDetail)
async def get_league(
    league_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(League).options(selectinload(League.seasons)).where(League.id == league_id)
    result = await db.execute(stmt)
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    return league
