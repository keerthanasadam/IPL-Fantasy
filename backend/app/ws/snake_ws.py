"""WebSocket endpoint for snake draft rooms."""

import uuid
import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.season import Season, SeasonStatus
from app.services.snake_draft_service import get_draft_state, make_pick, undo_last_pick
from app.ws.manager import manager

router = APIRouter()


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return {"user_id": payload.get("sub"), "email": payload.get("email")}
    except JWTError:
        return None


async def get_ws_db(app) -> AsyncSession:
    async with app.state.async_session() as session:
        yield session


@router.websocket("/ws/draft/{season_id}")
async def snake_draft_ws(websocket: WebSocket, season_id: uuid.UUID):
    # Authenticate via query param
    token = websocket.query_params.get("token", "")
    user = decode_token(token) if token else None

    room = str(season_id)
    await manager.connect(websocket, room)

    # Initialize Redis in manager if needed
    redis = websocket.app.state.redis
    await manager.init_redis(redis)

    # Send initial draft state
    try:
        async with websocket.app.state.async_session() as db:
            state = await get_draft_state(db, season_id)
            await manager.send_personal(websocket, {
                "type": "draft_state",
                "data": _serialize_state(state),
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
                        user_id = uuid.UUID(user["user_id"]) if user else None
                        pick_data = await make_pick(db, season_id, player_id, user_id=user_id)
                        await manager.broadcast_to_room(room, {
                            "type": "pick_made",
                            "data": pick_data,
                        })
                        # Send updated state
                        state = await get_draft_state(db, season_id)
                        await manager.broadcast_to_room(room, {
                            "type": "draft_state",
                            "data": _serialize_state(state),
                        })

                    elif msg_type == "force_pick":
                        player_id = uuid.UUID(msg["player_id"])
                        team_id = uuid.UUID(msg["team_id"])
                        user_id = uuid.UUID(user["user_id"]) if user else None
                        pick_data = await make_pick(
                            db, season_id, player_id, user_id=user_id, force_team_id=team_id,
                        )
                        await manager.broadcast_to_room(room, {
                            "type": "pick_made",
                            "data": pick_data,
                        })
                        state = await get_draft_state(db, season_id)
                        await manager.broadcast_to_room(room, {
                            "type": "draft_state",
                            "data": _serialize_state(state),
                        })

                    elif msg_type == "undo_last_pick":
                        undone = await undo_last_pick(db, season_id)
                        if undone:
                            await manager.broadcast_to_room(room, {
                                "type": "pick_undone",
                                "data": undone,
                            })
                            state = await get_draft_state(db, season_id)
                            await manager.broadcast_to_room(room, {
                                "type": "draft_state",
                                "data": _serialize_state(state),
                            })
                        else:
                            await manager.send_personal(websocket, {
                                "type": "error",
                                "message": "No picks to undo",
                            })

                    elif msg_type == "pause_draft":
                        season_stmt = await db.execute(
                            __import__("sqlalchemy").select(Season).where(Season.id == season_id)
                        )
                        season = season_stmt.scalar_one()
                        season.draft_config = {**(season.draft_config or {}), "paused": True}
                        await db.commit()
                        await manager.broadcast_to_room(room, {"type": "draft_paused"})

                    elif msg_type == "resume_draft":
                        from sqlalchemy import select as sel
                        season_stmt = await db.execute(sel(Season).where(Season.id == season_id))
                        season = season_stmt.scalar_one()
                        config = dict(season.draft_config or {})
                        config.pop("paused", None)
                        season.draft_config = config
                        await db.commit()
                        await manager.broadcast_to_room(room, {"type": "draft_resumed"})

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


def _serialize_state(state) -> dict:
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
    }
