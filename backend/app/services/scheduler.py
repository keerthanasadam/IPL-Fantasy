"""APScheduler-based auto-scraper: runs Cricbattle score scraping on a schedule."""

import logging
import uuid

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def _resolve_season_ids() -> list[uuid.UUID]:
    """Return the list of season UUIDs to scrape, from config."""
    raw = settings.SCRAPE_SEASON_IDS.strip() or settings.SCRAPE_SEASON_ID.strip()
    if not raw:
        return []
    ids = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ids.append(uuid.UUID(part))
        except ValueError:
            logger.error("Invalid season ID in SCRAPE_SEASON_IDS: %r", part)
    return ids


async def _scheduled_scrape():
    """Called by APScheduler — scrapes all configured seasons."""
    season_ids = _resolve_season_ids()
    if not season_ids:
        logger.warning("No valid season IDs configured (SCRAPE_SEASON_IDS), skipping")
        return

    from app.services.cricbattle_scraper import scrape_all_matches
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    for season_id in season_ids:
        async with async_session() as db:
            logger.info("Scheduled scrape starting for season %s", season_id)
            result = await scrape_all_matches(db, season_id)
            logger.info(
                "Season %s: %d matches, %d players updated, %d errors",
                season_id,
                result["matches_scraped"],
                result["players_updated"],
                len(result["errors"]),
            )
            for err in result.get("errors", []):
                logger.warning("  Scrape error: %s", err)
            if result.get("unmatched_players"):
                logger.warning("  Unmatched players: %s", result["unmatched_players"])

    await engine.dispose()


def start_scheduler():
    """Start APScheduler with cron jobs at SCRAPE_HOURS_IST:SCRAPE_MINUTE_IST (IST)."""
    hours_str = settings.SCRAPE_HOURS_IST.strip()
    season_ids = _resolve_season_ids()

    if not hours_str or not season_ids:
        logger.info(
            "Auto-scraper disabled (SCRAPE_HOURS_IST=%r, seasons=%r)",
            hours_str,
            [str(s) for s in season_ids],
        )
        return

    minute = settings.SCRAPE_MINUTE_IST
    hours = [h.strip() for h in hours_str.split(",") if h.strip()]

    for hour in hours:
        trigger = CronTrigger(hour=int(hour), minute=minute, timezone="America/New_York")
        job_id = f"scrape_{hour}h{minute:02d}m"
        scheduler.add_job(
            _scheduled_scrape,
            trigger=trigger,
            id=job_id,
            replace_existing=True,
            name=f"Cricbattle scrape at {hour}:{minute:02d} EST ({len(season_ids)} season(s))",
        )
        logger.info(
            "Scheduled scrape job '%s' at %s:%02d EST for %d season(s)",
            job_id, hour, minute, len(season_ids),
        )

    scheduler.start()
    logger.info("APScheduler started with %d job(s)", len(scheduler.get_jobs()))


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler shut down")
