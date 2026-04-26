import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.services.midseason_scoring_service import get_midseason_dashboard

router = APIRouter(prefix="/api/seasons", tags=["midseason-dashboard"])


@router.get("/{season_id}/midseason-dashboard")
async def midseason_dashboard(
    season_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_midseason_dashboard(db, season_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
