"""Cricbattle score scraper: logs in, fetches match scores, upserts into DB."""

import logging
import re
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

CRICBATTLE_LOGIN_URL = "https://www.cricbattle.com/Account/Login"
CRICBATTLE_SCORES_URL = (
    "https://fantasycricket.cricbattle.com/MyFantasy/"
    "PlayerScoresBreakdown/GetLeaguePlayerScoresBreakdownData"
)
CRICBATTLE_BASE_URL = "https://fantasycricket.cricbattle.com"


async def _get_authenticated_client() -> httpx.AsyncClient:
    """Create an httpx client and authenticate with Cricbattle."""
    client = httpx.AsyncClient(
        follow_redirects=True,
        timeout=httpx.Timeout(30.0),
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
    )

    # GET login page to extract verification token
    login_page = await client.get(CRICBATTLE_LOGIN_URL)
    login_page.raise_for_status()
    soup = BeautifulSoup(login_page.text, "html.parser")
    token_input = soup.find("input", {"name": "__RequestVerificationToken"})
    token = token_input["value"] if token_input else ""

    # POST login
    login_data = {
        "Email": settings.CRICBATTLE_EMAIL,
        "Password": settings.CRICBATTLE_PASSWORD,
        "__RequestVerificationToken": token,
    }
    login_resp = await client.post(CRICBATTLE_LOGIN_URL, data=login_data)
    login_resp.raise_for_status()
    logger.info("Cricbattle login completed (status=%s)", login_resp.status_code)

    return client


async def _get_match_list(client: httpx.AsyncClient) -> list[dict]:
    """Fetch the Player Scores page and extract match dropdown options.

    Returns list of {"match_id": str, "match_label": str}.
    """
    scores_page_url = (
        f"{CRICBATTLE_BASE_URL}/MyFantasy/PlayerScoresBreakdown"
        f"?leagueId={settings.CRICBATTLE_LEAGUE_ID}"
    )
    resp = await client.get(scores_page_url)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    match_select = soup.find("select", {"id": "MatchId"}) or soup.find("select", {"name": "MatchId"})
    if not match_select:
        # Try alternative selectors
        match_select = soup.find("select", id=lambda x: x and "match" in x.lower())

    matches = []
    if match_select:
        for option in match_select.find_all("option"):
            val = option.get("value", "").strip()
            label = option.get_text(strip=True)
            if val and val != "0" and val != "":
                matches.append({"match_id": val, "match_label": label})

    logger.info("Found %d matches in dropdown", len(matches))
    return matches


async def _get_match_scores(
    client: httpx.AsyncClient, match_id: str
) -> list[dict]:
    """Fetch player scores for a single match.

    Returns list of {"player_name": str, "points": Decimal, "fours": int, "sixes": int}.
    """
    payload = {
        "leagueId": settings.CRICBATTLE_LEAGUE_ID,
        "matchId": match_id,
    }
    resp = await client.post(CRICBATTLE_SCORES_URL, data=payload)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    players = []

    # Parse score rows from the HTML table
    rows = soup.find_all("tr")
    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 2:
            continue

        # Try to extract player name from first cell
        name_cell = cells[0]
        player_name = name_cell.get_text(strip=True)
        if not player_name:
            continue

        # Try to extract total points (usually last numeric cell)
        points = Decimal("0")
        fours = 0
        sixes = 0

        for cell in cells:
            text = cell.get_text(strip=True)
            # Look for boundary breakdown info
            title = cell.get("title", "") or cell.get("data-original-title", "")
            if title:
                fours_val, sixes_val = _parse_boundary_breakdown(title)
                if fours_val is not None:
                    fours = fours_val
                if sixes_val is not None:
                    sixes = sixes_val

        # Points is typically the last or second-to-last cell
        for cell in reversed(cells):
            text = cell.get_text(strip=True).replace(",", "")
            try:
                points = Decimal(text)
                break
            except Exception:
                continue

        if player_name and not player_name.startswith(("Total", "Player", "#")):
            players.append({
                "player_name": player_name,
                "points": points,
                "fours": fours,
                "sixes": sixes,
            })

    logger.info("Parsed %d player scores for match %s", len(players), match_id)
    return players


def _parse_boundary_breakdown(tooltip_text: str) -> tuple[int | None, int | None]:
    """Parse boundary counts from tooltip/title text.

    Looks for patterns like '4 Runs: 3' and '6 Runs: 1'.
    """
    fours = None
    sixes = None
    text = tooltip_text.lower()

    # Try common patterns
    four_match = re.search(r"4\s*runs?\s*[:\-=]\s*(\d+)", text)
    if four_match:
        fours = int(four_match.group(1))

    six_match = re.search(r"6\s*runs?\s*[:\-=]\s*(\d+)", text)
    if six_match:
        sixes = int(six_match.group(1))

    # Alternative patterns: "Fours: 3" / "Sixes: 1"
    if fours is None:
        four_match = re.search(r"fours?\s*[:\-=]\s*(\d+)", text)
        if four_match:
            fours = int(four_match.group(1))

    if sixes is None:
        six_match = re.search(r"sixes?\s*[:\-=]\s*(\d+)", text)
        if six_match:
            sixes = int(six_match.group(1))

    return fours, sixes


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
