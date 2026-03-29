"""Cricbattle score scraper: logs in, fetches match scores, upserts into DB."""

import json
import logging
import uuid
from decimal import Decimal

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.player import Player
from app.models.player_match_score import PlayerMatchScore

logger = logging.getLogger(__name__)

# Step 1: GET this page to trigger session cookie
CRICBATTLE_LOGIN_START_URL = "https://www.cricbattle.com/Account/LoginRegister/ByEmail"
# Step 2: POST email here
CRICBATTLE_LOGIN_EMAIL_URL = "https://www.cricbattle.com/Account/Login/ByEmail"
# Step 3: POST password here (with IsPassword=True)
CRICBATTLE_LOGIN_OPTIONS_URL = "https://www.cricbattle.com/Account/Login/Options"

CRICBATTLE_SCORES_PAGE_URL = (
    "https://fantasycricket.cricbattle.com/MyFantasy/"
    "Player-Scores-Breakdown?LeagueModel=SalaryCap&LeagueId={league_id}"
)
CRICBATTLE_SCORES_API_URL = (
    "https://fantasycricket.cricbattle.com/MyFantasy/"
    "PlayerScoresBreakdown/GetLeaguePlayerScoresBreakdownData"
)


async def _get_authenticated_client() -> httpx.AsyncClient:
    """Create an httpx client and authenticate with Cricbattle.

    Cricbattle uses a 3-step email+password login:
      1. GET /Account/LoginRegister/ByEmail  (establishes session)
      2. POST /Account/Login/ByEmail         (submit email)
      3. POST /Account/Login/Options         (submit password with IsPassword=True)
    """
    client = httpx.AsyncClient(
        follow_redirects=True,
        timeout=httpx.Timeout(30.0),
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
    )

    # Step 1: establish session
    await client.get(CRICBATTLE_LOGIN_START_URL)

    # Step 2: submit email
    resp = await client.post(CRICBATTLE_LOGIN_EMAIL_URL, data={
        "IsUseOfficialEmail": "False",
        "CountryId": "3",
        "Email": settings.CRICBATTLE_EMAIL,
    })
    resp.raise_for_status()

    # Step 3: extract hidden fields from options page, add password
    soup = BeautifulSoup(resp.text, "html.parser")
    form = soup.find("form", {"action": "/Account/Login/Options"})
    if not form:
        raise RuntimeError(
            f"Login options form not found (landed on: {resp.url}). "
            "Check CRICBATTLE_EMAIL is correct."
        )
    hidden = {
        inp.get("name"): inp.get("value", "")
        for inp in form.find_all("input")
        if inp.get("name")
    }
    hidden["Password"] = settings.CRICBATTLE_PASSWORD
    hidden["IsPassword"] = "True"

    login_resp = await client.post(CRICBATTLE_LOGIN_OPTIONS_URL, data=hidden)
    login_resp.raise_for_status()

    # Verify we're logged in (should have .CBProd auth cookie)
    if ".CBProd" not in client.cookies:
        raise RuntimeError(
            "Login failed: .CBProd auth cookie not set. "
            "Check CRICBATTLE_EMAIL and CRICBATTLE_PASSWORD."
        )

    logger.info("Cricbattle login successful (landed on: %s)", login_resp.url)
    return client


async def _get_match_list(client: httpx.AsyncClient) -> list[dict]:
    """Fetch the Player Scores page and extract match dropdown options.

    Returns list of {"match_id": str, "match_label": str}.
    """
    url = CRICBATTLE_SCORES_PAGE_URL.format(league_id=settings.CRICBATTLE_LEAGUE_ID)
    resp = await client.get(url)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    match_select = soup.find("select", {"id": "MatchId"})

    matches = []
    if match_select:
        for option in match_select.find_all("option"):
            val = option.get("value", "").strip()
            label = option.get_text(strip=True)
            if val and val not in ("0", ""):
                matches.append({"match_id": val, "match_label": label})

    logger.info("Found %d matches in dropdown", len(matches))
    return matches


async def _get_match_scores(
    client: httpx.AsyncClient, match_id: str
) -> list[dict]:
    """Fetch player scores for a single match via the JSON API.

    Returns list of {"player_name": str, "points": Decimal, "fours": int, "sixes": int}.

    The API accepts JSON: {"lid": "<league_id>", "matchid": "<match_id>"}
    and returns {"Result": {"lstPlayer": [...], "lstTeam": [...]}}
    Each player has TotalScore and lstScore[] entries per inning with Fours/Sixes.
    """
    resp = await client.post(
        CRICBATTLE_SCORES_API_URL,
        content=json.dumps({
            "lid": settings.CRICBATTLE_LEAGUE_ID,
            "matchid": match_id,
        }),
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    resp.raise_for_status()

    data = resp.json()
    result = data.get("Result") or {}
    raw_players = result.get("lstPlayer") or []

    players = []
    for p in raw_players:
        name = p.get("PlayerName", "").strip()
        if not name:
            continue

        # TotalScore on the player object is already aggregated across innings
        total_points = Decimal(str(p.get("TotalScore") or 0))

        # Sum fours and sixes across all innings
        fours = sum(inning.get("Fours", 0) or 0 for inning in p.get("lstScore", []))
        sixes = sum(inning.get("Sixes", 0) or 0 for inning in p.get("lstScore", []))

        players.append({
            "player_name": name,
            "points": total_points,
            "fours": fours,
            "sixes": sixes,
        })

    logger.info("Parsed %d player scores for match %s", len(players), match_id)
    return players


async def _match_player_name(
    db: AsyncSession,
    season_id: uuid.UUID,
    name: str,
    player_cache: dict[str, Player],
) -> Player | None:
    """Match a scraped player name to a DB player (case-insensitive)."""
    key = name.strip().lower()
    if key in player_cache:
        return player_cache[key]

    # Exact case-insensitive match
    stmt = select(Player).where(
        Player.season_id == season_id,
        func.lower(Player.name) == key,
    )
    result = await db.execute(stmt)
    player = result.scalar_one_or_none()

    if player:
        player_cache[key] = player
        return player

    # Try partial match: scraped name contained in DB name or vice versa
    all_stmt = select(Player).where(Player.season_id == season_id)
    all_result = await db.execute(all_stmt)
    for p in all_result.scalars().all():
        db_key = p.name.strip().lower()
        if db_key not in player_cache:
            player_cache[db_key] = p
        if key in db_key or db_key in key:
            player_cache[key] = p
            return p

    return None


async def scrape_all_matches(
    db: AsyncSession, season_id: uuid.UUID
) -> dict:
    """Scrape all matches from Cricbattle and upsert scores into DB.

    Returns a ScrapeResult-compatible dict.
    """
    errors: list[str] = []
    unmatched: set[str] = set()
    total_players_updated = 0
    total_matches = 0
    player_cache: dict[str, Player] = {}

    try:
        client = await _get_authenticated_client()
    except Exception as e:
        logger.exception("Failed to authenticate with Cricbattle")
        return {
            "matches_scraped": 0,
            "players_updated": 0,
            "unmatched_players": [],
            "errors": [f"Login failed: {str(e)}"],
        }

    try:
        matches = await _get_match_list(client)
        if not matches:
            errors.append("No matches found in dropdown")
            return {
                "matches_scraped": 0,
                "players_updated": 0,
                "unmatched_players": [],
                "errors": errors,
            }

        for match_info in matches:
            match_id = match_info["match_id"]
            match_label = match_info["match_label"]

            try:
                player_scores = await _get_match_scores(client, match_id)
            except Exception as e:
                logger.exception("Failed to fetch scores for match %s", match_id)
                errors.append(f"Match {match_id} ({match_label}): {str(e)}")
                continue

            match_updated = 0
            for ps in player_scores:
                player = await _match_player_name(
                    db, season_id, ps["player_name"], player_cache
                )
                if not player:
                    unmatched.add(ps["player_name"])
                    continue

                # Upsert using PostgreSQL ON CONFLICT
                stmt = pg_insert(PlayerMatchScore).values(
                    player_id=player.id,
                    season_id=season_id,
                    match_id=match_id,
                    match_label=match_label,
                    points=ps["points"],
                    fours=ps["fours"],
                    sixes=ps["sixes"],
                ).on_conflict_do_update(
                    constraint="uq_player_match",
                    set_={
                        "points": ps["points"],
                        "fours": ps["fours"],
                        "sixes": ps["sixes"],
                        "match_label": match_label,
                    },
                )
                await db.execute(stmt)
                match_updated += 1

            total_players_updated += match_updated
            total_matches += 1
            logger.info(
                "Match %s (%s): updated %d players",
                match_id, match_label, match_updated,
            )

        await db.commit()

    except Exception as e:
        logger.exception("Scraping failed")
        errors.append(f"Scraping error: {str(e)}")
        await db.rollback()
    finally:
        await client.aclose()

    return {
        "matches_scraped": total_matches,
        "players_updated": total_players_updated,
        "unmatched_players": sorted(unmatched),
        "errors": errors,
    }
