"""Midseason dashboard scoring service.

Computes standings and chart data for a mid-season draft league:
  - points_at_half  : sum of drafted players' points_at_draft (baseline snapshot)
  - effective_points: points earned after the draft (from PlayerMatchScore minus baseline)
  - total_points    : points_at_half + effective_points
"""

import re
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.player import Player
from app.models.player_match_score import PlayerMatchScore
from app.models.season import Season
from app.models.snake_pick import SnakePick
from app.models.team import Team

_MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}


def _parse_match_date(label: str) -> date | None:
    """Parse '25 Apr IST-...' → date(2026, 4, 25). Returns None if unparseable."""
    m = re.match(r'(\d+)\s+([A-Za-z]{3})', label)
    if not m:
        return None
    day, mon = int(m.group(1)), m.group(2).lower()
    month = _MONTH_MAP.get(mon)
    if not month:
        return None
    return date(2026, month, day)


async def get_midseason_dashboard(db: AsyncSession, season_id: uuid.UUID) -> dict:
    # ── Season ────────────────────────────────────────────────────────────
    season_stmt = (
        select(Season)
        .options(selectinload(Season.league))
        .where(Season.id == season_id)
    )
    season = (await db.execute(season_stmt)).scalar_one_or_none()
    if not season:
        raise ValueError("Season not found")

    draft_config = season.draft_config or {}
    # Optional: admin can set "midseason_draft_date": "2026-04-25" in draft_config
    draft_date_str = draft_config.get("midseason_draft_date")
    draft_cutoff: date | None = date.fromisoformat(draft_date_str) if draft_date_str else None

    # ── Teams ─────────────────────────────────────────────────────────────
    teams_stmt = (
        select(Team)
        .options(selectinload(Team.owner))
        .where(Team.season_id == season_id)
        .order_by(Team.draft_position)
    )
    teams = (await db.execute(teams_stmt)).scalars().all()
    team_map = {t.id: t for t in teams}

    # ── Picks ─────────────────────────────────────────────────────────────
    picks_stmt = (
        select(SnakePick)
        .where(SnakePick.season_id == season_id, SnakePick.is_undone == False)  # noqa: E712
        .order_by(SnakePick.pick_number)
    )
    picks = (await db.execute(picks_stmt)).scalars().all()

    player_to_team: dict[uuid.UUID, uuid.UUID] = {}
    player_to_round: dict[uuid.UUID, int] = {}
    team_player_ids: dict[uuid.UUID, list[uuid.UUID]] = {t.id: [] for t in teams}
    for pick in picks:
        player_to_team[pick.player_id] = pick.team_id
        player_to_round[pick.player_id] = pick.round
        team_player_ids[pick.team_id].append(pick.player_id)

    all_player_ids = list(player_to_team.keys())

    # ── Players (with points_at_draft baseline) ───────────────────────────
    players_map: dict[uuid.UUID, Player] = {}
    if all_player_ids:
        p_stmt = select(Player).where(Player.id.in_(all_player_ids))
        for p in (await db.execute(p_stmt)).scalars().all():
            players_map[p.id] = p

    # Baseline per team: sum of points_at_draft for their drafted players
    team_baseline: dict[uuid.UUID, Decimal] = {}
    for team in teams:
        baseline = sum(
            (players_map[pid].points_at_draft or players_map[pid].points or Decimal("0"))
            for pid in team_player_ids.get(team.id, [])
            if pid in players_map
        )
        team_baseline[team.id] = Decimal(str(baseline))

    # ── PlayerMatchScore aggregates ───────────────────────────────────────
    player_match_total: dict[uuid.UUID, Decimal] = {}
    has_match_scores = False

    if all_player_ids:
        agg_stmt = (
            select(
                PlayerMatchScore.player_id,
                func.coalesce(func.sum(PlayerMatchScore.points), 0).label("total"),
            )
            .where(
                PlayerMatchScore.season_id == season_id,
                PlayerMatchScore.player_id.in_(all_player_ids),
            )
            .group_by(PlayerMatchScore.player_id)
        )
        rows = (await db.execute(agg_stmt)).all()
        for row in rows:
            player_match_total[row.player_id] = Decimal(str(row.total))
        has_match_scores = len(rows) > 0

    # ── Score history for chart (per match, per team) ─────────────────────
    score_history = []
    if all_player_ids and has_match_scores:
        history_stmt = (
            select(
                PlayerMatchScore.match_id,
                PlayerMatchScore.match_label,
                PlayerMatchScore.player_id,
                func.sum(PlayerMatchScore.points).label("match_pts"),
            )
            .where(
                PlayerMatchScore.season_id == season_id,
                PlayerMatchScore.player_id.in_(all_player_ids),
            )
            .group_by(
                PlayerMatchScore.match_id,
                PlayerMatchScore.match_label,
                PlayerMatchScore.player_id,
            )
        )
        history_rows = (await db.execute(history_stmt)).all()

        match_team_pts: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
        match_labels: dict[str, str] = {}
        match_dates: dict[str, date | None] = {}

        for row in history_rows:
            tid = player_to_team.get(row.player_id)
            if not tid:
                continue
            team = team_map.get(tid)
            if not team:
                continue
            match_team_pts[row.match_id][team.name] += Decimal(str(row.match_pts))
            match_labels[row.match_id] = row.match_label
            if row.match_id not in match_dates:
                match_dates[row.match_id] = _parse_match_date(row.match_label)

        def _sort_key(mid: str):
            try:
                return (0, int(mid))
            except (ValueError, TypeError):
                return (1, mid)

        for mid in sorted(match_team_pts.keys(), key=_sort_key):
            md = match_dates.get(mid)
            # Filter to post-draft matches only when cutoff is set
            if draft_cutoff and md and md < draft_cutoff:
                continue
            score_history.append({
                "match_id": mid,
                "match_label": match_labels[mid],
                "team_points": {t: float(p) for t, p in match_team_pts[mid].items()},
            })

    # ── Standings ─────────────────────────────────────────────────────────
    standings = []
    for team in teams:
        player_ids = team_player_ids.get(team.id, [])
        baseline = team_baseline[team.id]

        if has_match_scores:
            # Sum of all PlayerMatchScore for this team's players
            match_total = sum(
                player_match_total.get(pid, Decimal("0")) for pid in player_ids
            )
            effective = max(Decimal("0"), Decimal(str(match_total)) - baseline)
            total = baseline + effective
        else:
            # No match scores yet — use Player.points as total, effective = 0
            total = sum(
                (players_map[pid].points or Decimal("0"))
                for pid in player_ids if pid in players_map
            )
            effective = Decimal("0")
            total = Decimal(str(total))

        standings.append({
            "team_name": team.name,
            "owner_name": team.owner.display_name if team.owner else None,
            "points_at_half": float(baseline),
            "effective_points": float(effective),
            "total_points": float(total),
        })

    standings.sort(key=lambda x: x["effective_points"], reverse=True)
    for i, s in enumerate(standings, 1):
        s["rank"] = i

    # ── Rosters ───────────────────────────────────────────────────────────
    # Per-player effective points (post-draft match points minus baseline)
    rosters = []
    for standing in standings:
        team = next((t for t in teams if t.name == standing["team_name"]), None)
        if not team:
            continue
        player_ids = team_player_ids.get(team.id, [])
        roster_players = []
        for pid in player_ids:
            p = players_map.get(pid)
            if not p:
                continue
            match_total = player_match_total.get(pid, Decimal("0"))
            baseline = p.points_at_draft or p.points or Decimal("0")
            eff = float(max(Decimal("0"), match_total - Decimal(str(baseline))))
            roster_players.append({
                "player_name": p.name,
                "ipl_team": p.ipl_team,
                "designation": p.designation,
                "draft_round": player_to_round.get(pid),
                "effective_points": eff,
            })
        roster_players.sort(key=lambda x: x["effective_points"], reverse=True)
        rosters.append({
            "team_name": standing["team_name"],
            "owner_name": standing["owner_name"],
            "effective_points": standing["effective_points"],
            "players": roster_players,
        })

    # ── Metadata ──────────────────────────────────────────────────────────
    matches_played = len({e["match_id"] for e in score_history})

    last_updated_stmt = (
        select(func.max(PlayerMatchScore.updated_at))
        .where(PlayerMatchScore.season_id == season_id)
    )
    last_updated_val = (await db.execute(last_updated_stmt)).scalar()
    last_updated = last_updated_val.isoformat() if last_updated_val else None

    return {
        "league_name": season.league.name if season.league else "",
        "season_label": season.label,
        "last_updated": last_updated,
        "matches_played": matches_played,
        "standings": standings,
        "score_history": score_history,
        "rosters": rosters,
    }
