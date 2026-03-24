import csv
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_admin, get_current_user, get_db
from app.models.player import Player
from app.models.season import Season
from app.schemas.player import ImportResult, PlayerListResponse, PlayerResponse

router = APIRouter(prefix="/api/seasons/{season_id}/players", tags=["players"])


@router.get("", response_model=PlayerListResponse)
async def list_players(
    season_id: uuid.UUID,
    search: str = Query(default="", description="Search by player name"),
    team: str = Query(default="", description="Filter by IPL team"),
    designation: str = Query(default="", description="Filter by designation"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Player).where(Player.season_id == season_id)
    count_stmt = select(func.count(Player.id)).where(Player.season_id == season_id)

    if search:
        stmt = stmt.where(Player.name.ilike(f"%{search}%"))
        count_stmt = count_stmt.where(Player.name.ilike(f"%{search}%"))
    if team:
        stmt = stmt.where(Player.ipl_team == team)
        count_stmt = count_stmt.where(Player.ipl_team == team)
    if designation:
        stmt = stmt.where(Player.designation == designation)
        count_stmt = count_stmt.where(Player.designation == designation)

    stmt = stmt.order_by(Player.ranking.asc().nulls_last(), Player.name.asc())
    result = await db.execute(stmt)
    players = result.scalars().all()

    count_result = await db.execute(count_stmt)
    total = count_result.scalar()

    return PlayerListResponse(players=players, total=total)


@router.post("/import", response_model=ImportResult)
async def import_players(
    season_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    # Verify season exists
    stmt = select(Season).where(Season.id == season_id)
    result = await db.execute(stmt)
    season = result.scalar_one_or_none()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    required_fields = {"Player Name", "Team", "Designation"}
    if not reader.fieldnames or not required_fields.issubset(set(reader.fieldnames)):
        raise HTTPException(
            status_code=400,
            detail=f"CSV must have columns: {required_fields}. Got: {reader.fieldnames}",
        )

    imported = 0
    updated = 0
    skipped = 0
    errors = []

    # Load existing players as a dict keyed by lowercase name for upsert
    existing_stmt = select(Player).where(Player.season_id == season_id)
    existing_result = await db.execute(existing_stmt)
    existing_players: dict[str, Player] = {
        p.name.lower(): p for p in existing_result.scalars().all()
    }

    for i, row in enumerate(reader, start=2):
        name = row.get("Player Name", "").strip()
        ipl_team = row.get("Team", "").strip()
        designation = row.get("Designation", "").strip()

        if not name:
            errors.append(f"Row {i}: missing Player Name")
            continue

        ranking_raw = row.get("Ranking", "").strip()
        ranking = int(ranking_raw) if ranking_raw.isdigit() else None

        existing = existing_players.get(name.lower())
        if existing:
            # Update fields on existing player (allows ranking updates after initial import)
            existing.ipl_team = ipl_team or existing.ipl_team
            existing.designation = designation or existing.designation
            existing.ranking = ranking
            updated += 1
        else:
            player = Player(
                season_id=season_id,
                name=name,
                ipl_team=ipl_team,
                designation=designation,
                ranking=ranking,
            )
            db.add(player)
            existing_players[name.lower()] = player
            imported += 1

    await db.commit()
    return ImportResult(imported=imported, updated=updated, skipped=skipped, errors=errors)


@router.delete("")
async def clear_players(
    season_id: uuid.UUID,
    current_user: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import delete
    stmt = delete(Player).where(Player.season_id == season_id)
    await db.execute(stmt)
    await db.commit()
    return {"deleted": True}
