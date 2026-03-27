import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_current_admin, get_current_user, get_db
from app.models.auction_event import AuctionEvent
from app.models.league import League
from app.models.player import Player
from app.models.season import Season
from app.models.snake_pick import SnakePick
from app.models.team import Team
from app.schemas.league import (
    LeagueCreate,
    LeagueDetail,
    LeagueMineResponse,
    LeagueResponse,
    SeasonInLeagueMine,
    TeamInLeagueMine,
)

router = APIRouter(prefix="/api/leagues", tags=["leagues"])


@router.post("", response_model=LeagueResponse, status_code=status.HTTP_201_CREATED)
async def create_league(
    body: LeagueCreate,
    current_user: dict = Depends(get_current_admin),
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


# IMPORTANT: /mine must be declared before /{league_id} to avoid route conflict
@router.get("/mine", response_model=list[LeagueMineResponse])
async def get_my_leagues(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(current_user["user_id"])

    # Get leagues where user is commissioner
    commissioner_stmt = (
        select(League)
        .options(selectinload(League.seasons).selectinload(Season.teams))
        .where(League.commissioner_id == user_id)
    )
    commissioner_result = await db.execute(commissioner_stmt)
    commissioner_leagues = commissioner_result.scalars().all()

    # Get leagues where user has a team (as member)
    member_stmt = (
        select(League)
        .options(selectinload(League.seasons).selectinload(Season.teams))
        .join(League.seasons)
        .join(Season.teams)
        .where(Team.owner_id == user_id)
        .where(League.commissioner_id != user_id)  # exclude already captured as commissioner
    )
    member_result = await db.execute(member_stmt)
    member_leagues = member_result.scalars().unique().all()

    response = []
    for league in commissioner_leagues:
        response.append(_build_league_mine_response(league, user_id, "commissioner"))
    for league in member_leagues:
        response.append(_build_league_mine_response(league, user_id, "member"))

    return response


def _build_league_mine_response(league: League, user_id: uuid.UUID, user_role: str) -> LeagueMineResponse:
    seasons = []
    for season in league.seasons:
        my_team = next((t for t in season.teams if t.owner_id == user_id), None)
        seasons.append(
            SeasonInLeagueMine(
                id=season.id,
                label=season.label,
                status=season.status,
                team_count=season.team_count,
                teams_joined=len(season.teams),
                invite_code=season.invite_code,
                draft_config=season.draft_config,
                my_team=TeamInLeagueMine(
                    id=my_team.id,
                    name=my_team.name,
                    draft_position=my_team.draft_position,
                    points=float(my_team.points),
                ) if my_team else None,
            )
        )
    return LeagueMineResponse(
        id=league.id,
        name=league.name,
        user_role=user_role,
        seasons=seasons,
    )


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


@router.delete("/{league_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_league(
    league_id: uuid.UUID,
    current_user: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(League).options(selectinload(League.seasons)).where(League.id == league_id)
    result = await db.execute(stmt)
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    season_ids = [s.id for s in league.seasons]
    if season_ids:
        await db.execute(delete(SnakePick).where(SnakePick.season_id.in_(season_ids)))
        await db.execute(delete(AuctionEvent).where(AuctionEvent.season_id.in_(season_ids)))
        await db.execute(delete(Player).where(Player.season_id.in_(season_ids)))
        await db.execute(delete(Team).where(Team.season_id.in_(season_ids)))
        await db.execute(delete(Season).where(Season.id.in_(season_ids)))

    await db.delete(league)
    await db.commit()
