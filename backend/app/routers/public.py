import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.schemas.dashboard import DashboardResponse
from app.services.scoring_service import get_dashboard_data

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/dashboard/{season_id}", response_model=DashboardResponse)
async def get_public_dashboard(
    season_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Fully public endpoint - no auth required."""
    try:
        data = await get_dashboard_data(db, season_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return data
