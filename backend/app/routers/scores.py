import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_admin, get_db
from app.models.season import Season
from app.models.side_pot_config import SidePotConfig
from app.models.team import Team
from app.schemas.scores import ScrapeResult, SidePotsUpload
from app.services.cricbattle_scraper import scrape_all_matches
from app.services.scheduler import scheduler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/seasons", tags=["scores"])


@router.get("/scheduler/status", tags=["scores"])
async def scheduler_status(current_user: dict = Depends(get_current_admin)):
    """Check the auto-scraper schedule. Admin only."""
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": str(job.next_run_time) if job.next_run_time else None,
        })
    return {
        "running": scheduler.running,
        "jobs": jobs,
    }


@router.post("/{season_id}/update-scores", response_model=ScrapeResult)
async def update_scores(
    season_id: uuid.UUID,
    current_user: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a full score scrape from Cricbattle. Admin only."""
    season = await db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    result = await scrape_all_matches(db, season_id)
    return result


@router.post("/{season_id}/side-pots")
async def upload_side_pots(
    season_id: uuid.UUID,
    body: SidePotsUpload,
    current_user: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Upload side pot configurations (captain/vc, awesome threesome, predictions). Admin only."""
    season = await db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    # Build team name -> team ID map (case-insensitive)
    teams_stmt = select(Team).where(Team.season_id == season_id)
    teams_result = await db.execute(teams_stmt)
    teams = teams_result.scalars().all()
    team_by_name: dict[str, Team] = {t.name.lower(): t for t in teams}

    errors = []
    upserted = 0

    # Helper to upsert a side pot config
    async def _upsert_config(team_name: str, pot_type: str, config: dict):
        nonlocal upserted, errors
        team = team_by_name.get(team_name.strip().lower())
        if not team:
            errors.append(f"Team not found: {team_name}")
            return

        # Check if config already exists
        stmt = select(SidePotConfig).where(
            SidePotConfig.team_id == team.id,
            SidePotConfig.pot_type == pot_type,
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.config = config
        else:
            db.add(SidePotConfig(
                season_id=season_id,
                team_id=team.id,
                pot_type=pot_type,
                config=config,
            ))
        upserted += 1

    # Captain/VC picks
    for pick in body.captain_vc_picks:
        await _upsert_config(pick.team_name, "captain_vc", {
            "captain": pick.captain,
            "vice_captain": pick.vice_captain,
        })

    # Awesome Threesome
    for pick in body.awesome_threesome:
        await _upsert_config(pick.team_name, "awesome_threesome", {
            "batter": pick.batter,
            "bowler": pick.bowler,
            "allrounder": pick.allrounder,
        })

    # Predictions
    for pick in body.predictions:
        await _upsert_config(pick.team_name, "predictions", {
            "ipl_winner": pick.ipl_winner,
            "orange_cap": pick.orange_cap,
            "purple_cap": pick.purple_cap,
            "ipl_mvp": pick.ipl_mvp,
        })

    await db.commit()

    return {
        "upserted": upserted,
        "errors": errors,
    }
