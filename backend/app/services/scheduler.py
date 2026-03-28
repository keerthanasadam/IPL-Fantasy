"""APScheduler-based auto-scraper: runs Cricbattle score scraping on a schedule."""

import logging
import uuid

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _scheduled_scrape():
    """Called by APScheduler — creates its own DB session and runs the scraper."""
    season_id_str = settings.SCRAPE_SEASON_ID
    if not season_id_str:
        logger.warning("SCRAPE_SEASON_ID not set, skipping scheduled scrape")
        return

    try:
        season_id = uuid.UUID(season_id_str)
    except ValueError:
        logger.error("Invalid SCRAPE_SEASON_ID: %s", season_id_str)
        return

    # Import here to avoid circular imports — we need the app's sessionmaker
    from app.services.cricbattle_scraper import scrape_all_matches

    # Create a fresh session using the engine from settings
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        logger.info("Starting scheduled score scrape for season %s", season_id)
        result = await scrape_all_matches(db, season_id)
        logger.info(
            "Scheduled scrape complete: %d matches, %d players updated, %d errors",
            result["matches_scraped"],
            result["players_updated"],
            len(result["errors"]),
        )
        if result["errors"]:
            for err in result["errors"]:
                logger.warning("Scrape error: %s", err)
        if result["unmatched_players"]:
            logger.warning("Unmatched players: %s", result["unmatched_players"])

    await engine.dispose()


def start_scheduler():
    """Start the APScheduler with configured scrape times."""
    hours_str = settings.SCRAPE_HOURS_IST.strip()
    if not hours_str or not settings.SCRAPE_SEASON_ID:
        logger.info(
            "Auto-scraper disabled (SCRAPE_HOURS_IST=%r, SCRAPE_SEASON_ID=%r)",
            hours_str,
            settings.SCRAPE_SEASON_ID,
        )
        return

    hours = [h.strip() for h in hours_str.split(",") if h.strip()]

    for hour in hours:
        trigger = CronTrigger(hour=int(hour), minute=0, timezone="Asia/Kolkata")
        job_id = f"scrape_{hour}h"
        scheduler.add_job(
            _scheduled_scrape,
            trigger=trigger,
            id=job_id,
            replace_existing=True,
            name=f"Cricbattle scrape at {hour}:00 IST",
        )
        logger.info("Scheduled auto-scrape job '%s' at %s:00 IST", job_id, hour)

    scheduler.start()
    logger.info("APScheduler started with %d jobs", len(scheduler.get_jobs()))


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler shut down")
