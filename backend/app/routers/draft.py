import csv
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.player import Player
from app.models.snake_pick import SnakePick
from app.models.team import Team
from app.services.snake_draft_service import get_draft_state

router = APIRouter(prefix="/api/seasons/{season_id}/draft", tags=["draft"])


@router.get("")
async def get_draft(
    season_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        state = await get_draft_state(db, season_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {
        "season_id": str(state.season_id),
        "status": state.status,
        "total_rounds": state.total_rounds,
        "team_count": state.team_count,
        "current_pick_number": state.current_pick_number,
        "current_round": state.current_round,
        "current_team_id": str(state.current_team_id) if state.current_team_id else None,
        "current_team_name": state.current_team_name,
        "is_complete": state.is_complete,
        "picks": state.picks,
        "teams": state.teams,
        "timer_seconds": state.timer_seconds,
    }


@router.get("/export")
async def export_draft(
    season_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state = await get_draft_state(db, season_id)
    if not state.picks:
        raise HTTPException(status_code=400, detail="No picks to export")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Pick #", "Round", "Team", "Player Name", "IPL Team", "Designation"])
    for p in state.picks:
        writer.writerow([
            p["pick_number"],
            p["round"],
            p["team_name"],
            p["player_name"],
            p["player_team"],
            p["player_designation"],
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=draft_results_{season_id}.csv"},
    )
