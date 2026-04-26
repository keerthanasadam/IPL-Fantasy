"""Scoring service: computes all dashboard leaderboards from DB data."""

import re
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.league import League
from app.models.player import Player
from app.models.player_match_score import PlayerMatchScore
from app.models.season import Season
from app.models.side_pot_config import SidePotConfig
from app.models.snake_pick import SnakePick
from app.models.team import Team
from app.models.user import User

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


async def get_dashboard_data(db: AsyncSession, season_id: uuid.UUID) -> dict:
    """Build the full public dashboard payload for a season."""

    # Load season with league
    season_stmt = (
        select(Season)
        .options(selectinload(Season.league))
        .where(Season.id == season_id)
    )
    result = await db.execute(season_stmt)
    season = result.scalar_one_or_none()
    if not season:
        raise ValueError("Season not found")

    league: League = season.league

    draft_config = season.draft_config or {}
    midseason_draft_date_str = draft_config.get("midseason_draft_date")
    draft_cutoff: date | None = date.fromisoformat(midseason_draft_date_str) if midseason_draft_date_str else None

    # Load all teams with owners
    teams_stmt = (
        select(Team)
        .options(selectinload(Team.owner))
        .where(Team.season_id == season_id)
        .order_by(Team.draft_position)
    )
    teams_result = await db.execute(teams_stmt)
    teams = teams_result.scalars().all()
    team_map = {t.id: t for t in teams}

    # Load all active snake picks (team -> player mapping with round info)
    picks_stmt = (
        select(SnakePick)
        .where(SnakePick.season_id == season_id, SnakePick.is_undone == False)  # noqa: E712
        .order_by(SnakePick.pick_number)
    )
    picks_result = await db.execute(picks_stmt)
    picks = picks_result.scalars().all()

    # Build pick lookups: player_id -> (team_id, round)
    player_to_team: dict[uuid.UUID, uuid.UUID] = {}
    player_to_round: dict[uuid.UUID, int] = {}
    team_player_ids: dict[uuid.UUID, list[uuid.UUID]] = {t.id: [] for t in teams}
    for pick in picks:
        player_to_team[pick.player_id] = pick.team_id
        player_to_round[pick.player_id] = pick.round
        team_player_ids[pick.team_id].append(pick.player_id)

    all_player_ids = list(player_to_team.keys())

    # Load player info for all drafted players
    players_map: dict[uuid.UUID, Player] = {}
    if all_player_ids:
        players_stmt = select(Player).where(Player.id.in_(all_player_ids))
        players_result = await db.execute(players_stmt)
        for p in players_result.scalars().all():
            players_map[p.id] = p

    # Detect midseason league: season has midseason_draft_date set in draft_config
    is_midseason = bool(midseason_draft_date_str)

    # Aggregate match scores per player
    player_points: dict[uuid.UUID, Decimal] = {}
    player_fours: dict[uuid.UUID, int] = {}
    player_sixes: dict[uuid.UUID, int] = {}

    if all_player_ids:
        scores_stmt = (
            select(
                PlayerMatchScore.player_id,
                func.coalesce(func.sum(PlayerMatchScore.points), 0).label("total_points"),
                func.coalesce(func.sum(PlayerMatchScore.fours), 0).label("total_fours"),
                func.coalesce(func.sum(PlayerMatchScore.sixes), 0).label("total_sixes"),
            )
            .where(
                PlayerMatchScore.season_id == season_id,
                PlayerMatchScore.player_id.in_(all_player_ids),
            )
            .group_by(PlayerMatchScore.player_id)
        )
        scores_result = await db.execute(scores_stmt)
        for row in scores_result.all():
            player_points[row.player_id] = Decimal(str(row.total_points))
            player_fours[row.player_id] = int(row.total_fours)
            player_sixes[row.player_id] = int(row.total_sixes)

    # Compute effective points per player (for midseason leagues, subtract baseline)
    player_effective_points: dict[uuid.UUID, Decimal] = {}
    for pid in all_player_ids:
        raw = player_points.get(pid, Decimal("0"))
        if is_midseason:
            p = players_map.get(pid)
            baseline = Decimal(str(p.points_at_draft)) if p and p.points_at_draft is not None else Decimal("0")
            player_effective_points[pid] = max(Decimal("0"), raw - baseline)
        else:
            player_effective_points[pid] = raw

    # Per-match per-team score history (for line chart)
    score_history = []
    if all_player_ids:
        history_stmt = (
            select(
                PlayerMatchScore.match_id,
                PlayerMatchScore.match_label,
                PlayerMatchScore.player_id,
                func.sum(PlayerMatchScore.points).label("match_points"),
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
        history_result = await db.execute(history_stmt)
        match_team_pts: dict = defaultdict(lambda: defaultdict(Decimal))
        match_labels: dict[str, str] = {}
        match_dates: dict[str, date | None] = {}
        for row in history_result.all():
            team_id = player_to_team.get(row.player_id)
            if not team_id:
                continue
            team = team_map.get(team_id)
            if not team:
                continue
            match_team_pts[row.match_id][team.name] += Decimal(str(row.match_points))
            match_labels[row.match_id] = row.match_label
            if row.match_id not in match_dates:
                match_dates[row.match_id] = _parse_match_date(row.match_label)

        def _match_sort_key(mid: str):
            try:
                return (0, int(mid))
            except (ValueError, TypeError):
                return (1, mid)

        for mid in sorted(match_team_pts.keys(), key=_match_sort_key):
            md = match_dates.get(mid)
            if draft_cutoff and md and md < draft_cutoff:
                continue
            score_history.append({
                "match_id": mid,
                "match_label": match_labels[mid],
                "team_points": {t: float(p) for t, p in match_team_pts[mid].items()},
            })

    # Count distinct matches (post-draft only for midseason leagues)
    if is_midseason:
        matches_played = len({e["match_id"] for e in score_history})
    else:
        matches_stmt = (
            select(func.count(func.distinct(PlayerMatchScore.match_id)))
            .where(PlayerMatchScore.season_id == season_id)
        )
        matches_result = await db.execute(matches_stmt)
        matches_played = matches_result.scalar() or 0

    # Last updated timestamp
    last_updated_stmt = (
        select(func.max(PlayerMatchScore.updated_at))
        .where(PlayerMatchScore.season_id == season_id)
    )
    last_updated_result = await db.execute(last_updated_stmt)
    last_updated_val = last_updated_result.scalar()
    last_updated = last_updated_val.isoformat() if last_updated_val else None

    # --- 1. Main standings: sum effective points per team ---
    standings = []
    for team in teams:
        total = sum(
            player_effective_points.get(pid, Decimal("0"))
            for pid in team_player_ids.get(team.id, [])
        )
        points_at_half = None
        if is_midseason:
            baseline = sum(
                (Decimal(str(players_map[pid].points_at_draft))
                 if players_map[pid].points_at_draft is not None
                 else players_map[pid].points or Decimal("0"))
                for pid in team_player_ids.get(team.id, [])
                if pid in players_map
            )
            points_at_half = float(baseline)
        standings.append({
            "team_name": team.name,
            "owner_name": team.owner.display_name if team.owner else None,
            "total_points": float(total),
            "points_at_half": points_at_half,
            "effective_points": float(total) if is_midseason else None,
        })
    standings.sort(key=lambda x: x["total_points"], reverse=True)
    for i, entry in enumerate(standings, 1):
        entry["rank"] = i

    # --- 2. Boundary pot (Mellaga Kodatava Gattiga): 0.5 pts per four, 2 pts per six ---
    boundary_pot = []
    for team in teams:
        total_f = sum(player_fours.get(pid, 0) for pid in team_player_ids.get(team.id, []))
        total_s = sum(player_sixes.get(pid, 0) for pid in team_player_ids.get(team.id, []))
        boundary_points = (total_f * Decimal("0.5")) + (total_s * Decimal("2"))
        boundary_pot.append({
            "team_name": team.name,
            "owner_name": team.owner.display_name if team.owner else None,
            "total_fours": total_f,
            "total_sixes": total_s,
            "boundary_points": float(boundary_points),
        })
    boundary_pot.sort(key=lambda x: x["boundary_points"], reverse=True)
    for i, entry in enumerate(boundary_pot, 1):
        entry["rank"] = i

    # --- 3. Captain/VC pot ---
    cvc_configs_stmt = (
        select(SidePotConfig)
        .where(SidePotConfig.season_id == season_id, SidePotConfig.pot_type == "captain_vc")
    )
    cvc_result = await db.execute(cvc_configs_stmt)
    cvc_configs = cvc_result.scalars().all()

    captain_vc_pot = []
    for cfg in cvc_configs:
        team = team_map.get(cfg.team_id)
        if not team:
            continue
        config_data = cfg.config or {}
        captain_name = config_data.get("captain")
        vc_name = config_data.get("vice_captain")

        captain_points = Decimal("0")
        vc_points = Decimal("0")
        for pid in team_player_ids.get(team.id, []):
            p = players_map.get(pid)
            if not p:
                continue
            pts = player_effective_points.get(pid, Decimal("0"))
            if captain_name and p.name.lower() == captain_name.lower():
                captain_points = pts * 2
            elif vc_name and p.name.lower() == vc_name.lower():
                vc_points = pts * Decimal("1.5")

        total = captain_points + vc_points
        captain_vc_pot.append({
            "team_name": team.name,
            "owner_name": team.owner.display_name if team.owner else None,
            "captain": captain_name,
            "vice_captain": vc_name,
            "total_points": float(total),
        })
    captain_vc_pot.sort(key=lambda x: x["total_points"], reverse=True)
    for i, entry in enumerate(captain_vc_pot, 1):
        entry["rank"] = i

    # --- 4. Awesome Threesome pot ---
    at_configs_stmt = (
        select(SidePotConfig)
        .where(SidePotConfig.season_id == season_id, SidePotConfig.pot_type == "awesome_threesome")
    )
    at_result = await db.execute(at_configs_stmt)
    at_configs = at_result.scalars().all()

    awesome_threesome_pot = []
    for cfg in at_configs:
        team = team_map.get(cfg.team_id)
        if not team:
            continue
        config_data = cfg.config or {}
        batter_name = config_data.get("batter")
        bowler_name = config_data.get("bowler")
        allrounder_name = config_data.get("allrounder")

        total = Decimal("0")
        for pid in team_player_ids.get(team.id, []):
            p = players_map.get(pid)
            if not p:
                continue
            pts = player_effective_points.get(pid, Decimal("0"))
            if batter_name and p.name.lower() == batter_name.lower():
                total += pts
            elif bowler_name and p.name.lower() == bowler_name.lower():
                total += pts
            elif allrounder_name and p.name.lower() == allrounder_name.lower():
                total += pts

        awesome_threesome_pot.append({
            "team_name": team.name,
            "owner_name": team.owner.display_name if team.owner else None,
            "batter": batter_name,
            "bowler": bowler_name,
            "allrounder": allrounder_name,
            "total_points": float(total),
        })
    awesome_threesome_pot.sort(key=lambda x: x["total_points"], reverse=True)
    for i, entry in enumerate(awesome_threesome_pot, 1):
        entry["rank"] = i

    # --- 5. Predictions ---
    pred_configs_stmt = (
        select(SidePotConfig)
        .where(SidePotConfig.season_id == season_id, SidePotConfig.pot_type == "predictions")
    )
    pred_result = await db.execute(pred_configs_stmt)
    pred_configs = pred_result.scalars().all()

    predictions = []
    for cfg in pred_configs:
        team = team_map.get(cfg.team_id)
        if not team:
            continue
        config_data = cfg.config or {}
        predictions.append({
            "team_name": team.name,
            "owner_name": team.owner.display_name if team.owner else None,
            "ipl_winner": config_data.get("ipl_winner"),
            "orange_cap": config_data.get("orange_cap"),
            "purple_cap": config_data.get("purple_cap"),
            "ipl_mvp": config_data.get("ipl_mvp"),
        })

    # --- 6. Top scorers: top 5 drafted players by effective points ---
    top_scorers = []
    for pid, pts in sorted(player_effective_points.items(), key=lambda x: x[1], reverse=True)[:5]:
        p = players_map.get(pid)
        team_id = player_to_team.get(pid)
        team = team_map.get(team_id) if team_id else None
        top_scorers.append({
            "player_name": p.name if p else "Unknown",
            "ipl_team": p.ipl_team if p else None,
            "designation": p.designation if p else None,
            "total_points": float(pts),
            "fantasy_team": team.name if team else None,
            "owner_name": team.owner.display_name if team and team.owner else None,
            "draft_round": player_to_round.get(pid),
        })
    for i, entry in enumerate(top_scorers, 1):
        entry["rank"] = i

    # --- 6b. Top 3 undrafted players by total points ---
    drafted_player_ids = set(player_to_team.keys())
    undrafted_scores_stmt = (
        select(
            PlayerMatchScore.player_id,
            func.coalesce(func.sum(PlayerMatchScore.points), 0).label("total_points"),
        )
        .where(
            PlayerMatchScore.season_id == season_id,
            PlayerMatchScore.player_id.notin_(drafted_player_ids) if drafted_player_ids else True,
        )
        .group_by(PlayerMatchScore.player_id)
        .order_by(func.sum(PlayerMatchScore.points).desc())
        .limit(3)
    )
    undrafted_result = await db.execute(undrafted_scores_stmt)
    undrafted_rows = undrafted_result.all()

    undrafted_ids = [row.player_id for row in undrafted_rows]
    undrafted_players_map: dict[uuid.UUID, Player] = {}
    if undrafted_ids:
        undrafted_players_stmt = select(Player).where(Player.id.in_(undrafted_ids))
        undrafted_players_result = await db.execute(undrafted_players_stmt)
        for p in undrafted_players_result.scalars().all():
            undrafted_players_map[p.id] = p

    top_undrafted = []
    for row in undrafted_rows:
        p = undrafted_players_map.get(row.player_id)
        top_undrafted.append({
            "player_name": p.name if p else "Unknown",
            "ipl_team": p.ipl_team if p else None,
            "designation": p.designation if p else None,
            "total_points": float(row.total_points),
        })

    # --- 7. Team rosters ---
    rosters = []
    for team in teams:
        team_total = Decimal("0")
        players_list = []
        for pid in team_player_ids.get(team.id, []):
            p = players_map.get(pid)
            if not p:
                continue
            pts = player_effective_points.get(pid, Decimal("0"))
            f = player_fours.get(pid, 0)
            s = player_sixes.get(pid, 0)
            team_total += pts
            players_list.append({
                "player_name": p.name,
                "ipl_team": p.ipl_team,
                "designation": p.designation,
                "total_points": float(pts),
                "total_boundaries": f + s,
                "draft_round": player_to_round.get(pid, 0),
            })
        players_list.sort(key=lambda x: x["total_points"], reverse=True)
        rosters.append({
            "team_name": team.name,
            "owner_name": team.owner.display_name if team.owner else None,
            "total_points": float(team_total),
            "players": players_list,
        })

    return {
        "league_name": league.name,
        "season_label": season.label,
        "last_updated": last_updated,
        "matches_played": matches_played,
        "standings": standings,
        "boundary_pot": boundary_pot,
        "captain_vc_pot": captain_vc_pot,
        "awesome_threesome_pot": awesome_threesome_pot,
        "predictions": predictions,
        "prediction_actuals": draft_config.get("prediction_actuals"),
        "score_history": score_history,
        "top_scorers": top_scorers,
        "top_undrafted": top_undrafted,
        "rosters": rosters,
        "is_midseason": is_midseason,
    }
