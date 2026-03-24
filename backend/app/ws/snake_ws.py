"""WebSocket endpoint for snake draft rooms."""

import asyncio
import uuid
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.player import Player
from app.models.season import Season, SeasonStatus
from app.models.team import Team
from app.models.user import User
from app.services.snake_draft_service import calculate_snake_turn, get_draft_state, make_pick, undo_last_pick
from app.ws.manager import manager

router = APIRouter()

# Per-draft asyncio timer tasks: season_id_str -> Task
_timer_tasks: dict[str, asyncio.Task] = {}


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return {"user_id": payload.get("sub"), "email": payload.get("email")}
    except JWTError:
        return None


def _cancel_timer(season_id_str: str) -> None:
    task = _timer_tasks.pop(season_id_str, None)
    if task and not task.done():
        task.cancel()


def _start_timer(app, season_id: uuid.UUID, pick_number: int, timer_seconds: int) -> None:
    key = str(season_id)
    _cancel_timer(key)
    task = asyncio.create_task(
        _auto_pick_after_timeout(app, season_id, pick_number, timer_seconds)
    )
    _timer_tasks[key] = task


async def _auto_pick_after_timeout(
    app,
    season_id: uuid.UUID,
    pick_number: int,
    timer_seconds: int,
) -> None:
    """Sleep for timer duration; if pick hasn't advanced, auto-pick highest ranked available player."""
    await asyncio.sleep(timer_seconds)

    async with app.state.async_session() as db:
        season = await db.get(Season, season_id)
        if not season:
            return

        on_timeout = (season.draft_config or {}).get("on_timeout", "auto_pick")
        if on_timeout != "auto_pick":
            return

        state = await get_draft_state(db, season_id)

        # Stale wakeup: pick already made or draft ended
        if state.current_pick_number != pick_number or state.is_complete:
            return

        # Draft must still be active and not paused
        if state.status != "drafting" or (season.draft_config or {}).get("paused"):
            return

        # Find highest-ranked available player
        drafted_ids = {p["player_id"] for p in state.picks}
        players_stmt = await db.execute(
            select(Player)
            .where(Player.season_id == season_id)
            .order_by(Player.ranking.asc().nulls_last(), Player.name.asc())
        )
        all_players = players_stmt.scalars().all()
        available = [p for p in all_players if str(p.id) not in drafted_ids]

        if not available:
            return

        player_id = available[0].id
        team_id = state.current_team_id

        try:
            await make_pick(db, season_id, player_id, force_team_id=team_id)
        except ValueError:
            return

        # Reload and broadcast updated state
        season = await db.get(Season, season_id)
        updated_state = await get_draft_state(db, season_id)
        room = str(season_id)
        await manager.broadcast_to_room(room, {
            "type": "draft_state",
            "data": _serialize_state(updated_state, season.draft_config if season else {}),
        })

        # Chain next timer if draft continues
        if not updated_state.is_complete:
            next_timer = (season.draft_config or {}).get("pick_timer_seconds", 0)
            if next_timer > 0:
                _start_timer(app, season_id, updated_state.current_pick_number, next_timer)


@router.websocket("/ws/draft/{season_id}")
async def snake_draft_ws(websocket: WebSocket, season_id: uuid.UUID):
    # Authenticate via query param — required for all connections
    token = websocket.query_params.get("token", "")
    user = decode_token(token) if token else None
    if user is None:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "Authentication required"})
        await websocket.close(code=4001)
        return

    room = str(season_id)
    await manager.connect(websocket, room)

    # Initialize Redis in manager if needed
    redis = websocket.app.state.redis
    await manager.init_redis(redis)

    # Resolve is_admin once at connect time to avoid per-message DB lookups
    is_admin_user = False
    async with websocket.app.state.async_session() as db:
        user_row = await db.get(User, uuid.UUID(user["user_id"]))
        is_admin_user = bool(user_row and user_row.is_admin)

    # Send initial draft state
    try:
        async with websocket.app.state.async_session() as db:
            season = await db.get(Season, season_id)
            state = await get_draft_state(db, season_id)
            await manager.send_personal(websocket, {
                "type": "draft_state",
                "data": _serialize_state(state, season.draft_config if season else {}),
            })
    except Exception as e:
        await manager.send_personal(websocket, {"type": "error", "message": str(e)})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_personal(websocket, {"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = msg.get("type", "")

            async with websocket.app.state.async_session() as db:
                try:
                    if msg_type == "pick":
                        player_id = uuid.UUID(msg["player_id"])
                        user_id = uuid.UUID(user["user_id"])
                        # Look up the user's team in this season for ownership validation
                        team_stmt = await db.execute(
                            select(Team).where(
                                Team.season_id == season_id,
                                Team.owner_id == user_id,
                            )
                        )
                        user_team = team_stmt.scalar_one_or_none()
                        requesting_team_id = user_team.id if user_team else None
                        pick_data = await make_pick(
                            db, season_id, player_id, user_id=user_id,
                            requesting_team_id=requesting_team_id,
                        )
                        await manager.broadcast_to_room(room, {
                            "type": "pick_made",
                            "data": pick_data,
                        })
                        season = await db.get(Season, season_id)
                        state = await get_draft_state(db, season_id)
                        await manager.broadcast_to_room(room, {
                            "type": "draft_state",
                            "data": _serialize_state(state, season.draft_config if season else {}),
                        })
                        _cancel_timer(room)
                        if not state.is_complete:
                            timer_secs = (season.draft_config or {}).get("pick_timer_seconds", 0)
                            if timer_secs > 0:
                                _start_timer(websocket.app, season_id, state.current_pick_number, timer_secs)

                    elif msg_type == "force_pick":
                        if not is_admin_user:
                            await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
                            continue
                        player_id = uuid.UUID(msg["player_id"])
                        team_id = uuid.UUID(msg["team_id"])
                        user_id = uuid.UUID(user["user_id"])
                        pick_data = await make_pick(
                            db, season_id, player_id, user_id=user_id, force_team_id=team_id,
                        )
                        await manager.broadcast_to_room(room, {
                            "type": "pick_made",
                            "data": pick_data,
                        })
                        season = await db.get(Season, season_id)
                        state = await get_draft_state(db, season_id)
                        await manager.broadcast_to_room(room, {
                            "type": "draft_state",
                            "data": _serialize_state(state, season.draft_config if season else {}),
                        })
                        _cancel_timer(room)
                        if not state.is_complete:
                            timer_secs = (season.draft_config or {}).get("pick_timer_seconds", 0)
                            if timer_secs > 0:
                                _start_timer(websocket.app, season_id, state.current_pick_number, timer_secs)

                    elif msg_type == "undo_last_pick":
                        if not is_admin_user:
                            await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
                            continue
                        undone = await undo_last_pick(db, season_id)
                        if undone:
                            await manager.broadcast_to_room(room, {
                                "type": "pick_undone",
                                "data": undone,
                            })
                            season = await db.get(Season, season_id)
                            state = await get_draft_state(db, season_id)
                            await manager.broadcast_to_room(room, {
                                "type": "draft_state",
                                "data": _serialize_state(state, season.draft_config if season else {}),
                            })
                            _cancel_timer(room)
                            if not state.is_complete:
                                timer_secs = (season.draft_config or {}).get("pick_timer_seconds", 0)
                                if timer_secs > 0:
                                    _start_timer(websocket.app, season_id, state.current_pick_number, timer_secs)
                        else:
                            await manager.send_personal(websocket, {
                                "type": "error",
                                "message": "No picks to undo",
                            })

                    elif msg_type in ("pause_draft", "admin_pause_draft"):
                        if not is_admin_user:
                            await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
                            continue
                        season_stmt = await db.execute(select(Season).where(Season.id == season_id))
                        season = season_stmt.scalar_one()
                        season.draft_config = {**(season.draft_config or {}), "paused": True}
                        await db.commit()
                        _cancel_timer(room)
                        await manager.broadcast_to_room(room, {"type": "draft_paused"})

                    elif msg_type in ("resume_draft", "admin_resume_draft"):
                        if not is_admin_user:
                            await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
                            continue
                        season_stmt = await db.execute(select(Season).where(Season.id == season_id))
                        season = season_stmt.scalar_one()
                        config = dict(season.draft_config or {})
                        config.pop("paused", None)
                        season.draft_config = config
                        await db.commit()
                        state = await get_draft_state(db, season_id)
                        await manager.broadcast_to_room(room, {"type": "draft_resumed"})
                        if not state.is_complete:
                            timer_secs = config.get("pick_timer_seconds", 0)
                            if timer_secs > 0:
                                _start_timer(websocket.app, season_id, state.current_pick_number, timer_secs)

                    elif msg_type == "admin_reset_timer":
                        if not is_admin_user:
                            await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
                            continue
                        season_stmt = await db.execute(select(Season).where(Season.id == season_id))
                        season = season_stmt.scalar_one()
                        timer_seconds = (season.draft_config or {}).get("pick_timer_seconds", 0)
                        state = await get_draft_state(db, season_id)
                        await manager.broadcast_to_room(room, {
                            "type": "admin_timer_reset",
                            "pick_timer_seconds": timer_seconds,
                        })
                        _cancel_timer(room)
                        if not state.is_complete and timer_seconds > 0:
                            _start_timer(websocket.app, season_id, state.current_pick_number, timer_seconds)

                    elif msg_type == "admin_end_draft":
                        if not is_admin_user:
                            await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
                            continue
                        season_stmt = await db.execute(select(Season).where(Season.id == season_id))
                        season = season_stmt.scalar_one()
                        if season.status != SeasonStatus.DRAFTING:
                            await manager.send_personal(websocket, {
                                "type": "error",
                                "message": "Draft is not currently active",
                            })
                            continue
                        season.status = SeasonStatus.COMPLETED
                        await db.commit()
                        _cancel_timer(room)
                        state = await get_draft_state(db, season_id)
                        await manager.broadcast_to_room(room, {
                            "type": "draft_state",
                            "data": _serialize_state(state, season.draft_config or {}),
                        })

                    else:
                        await manager.send_personal(websocket, {
                            "type": "error",
                            "message": f"Unknown message type: {msg_type}",
                        })

                except ValueError as e:
                    await manager.send_personal(websocket, {"type": "error", "message": str(e)})
                except Exception as e:
                    await manager.send_personal(websocket, {"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        await manager.disconnect(websocket, room)


def _serialize_state(state, draft_config: dict | None = None) -> dict:
    config = draft_config or {}
    total_picks = state.total_rounds * state.team_count

    # Compute next team using snake turn logic
    next_team_id = None
    next_team_name = None
    if not state.is_complete and state.teams:
        next_pick = state.current_pick_number + 1
        if next_pick <= total_picks:
            _, next_team = calculate_snake_turn(next_pick, len(state.teams), state.teams)
            next_team_id = next_team["id"]
            next_team_name = next_team["name"]

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
        "pick_timer_seconds": config.get("pick_timer_seconds", 0),
        "paused": bool(config.get("paused", False)),
        "next_team_id": next_team_id,
        "next_team_name": next_team_name,
    }
