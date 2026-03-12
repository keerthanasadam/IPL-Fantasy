"""WebSocket connection manager with Redis pub/sub for multi-worker support."""

import asyncio
import json
from collections import defaultdict

from fastapi import WebSocket
from redis.asyncio import Redis


class ConnectionManager:
    def __init__(self):
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._redis: Redis | None = None
        self._pubsub_task: asyncio.Task | None = None

    async def init_redis(self, redis: Redis):
        self._redis = redis

    async def connect(self, websocket: WebSocket, room: str):
        await websocket.accept()
        self._rooms[room].add(websocket)

        # Subscribe to Redis channel for this room if first connection
        if self._redis and len(self._rooms[room]) == 1:
            await self._subscribe(room)

    async def disconnect(self, websocket: WebSocket, room: str):
        self._rooms[room].discard(websocket)
        if not self._rooms[room]:
            del self._rooms[room]

    async def broadcast_to_room(self, room: str, message: dict):
        """Broadcast to all local connections + publish to Redis for other workers."""
        data = json.dumps(message)

        # Publish to Redis so other workers get it
        if self._redis:
            await self._redis.publish(f"draft:{room}", data)
        else:
            # No Redis, just broadcast locally
            await self._local_broadcast(room, data)

    async def _local_broadcast(self, room: str, data: str):
        """Send to all WebSocket connections in a room."""
        dead = []
        for ws in self._rooms.get(room, set()):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._rooms[room].discard(ws)

    async def send_personal(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    async def _subscribe(self, room: str):
        """Subscribe to Redis pub/sub channel for a room."""
        if not self._redis:
            return

        pubsub = self._redis.pubsub()
        await pubsub.subscribe(f"draft:{room}")

        async def reader():
            try:
                async for msg in pubsub.listen():
                    if msg["type"] == "message":
                        await self._local_broadcast(room, msg["data"])
            except asyncio.CancelledError:
                await pubsub.unsubscribe(f"draft:{room}")
                await pubsub.aclose()

        asyncio.create_task(reader())

    def get_room_count(self, room: str) -> int:
        return len(self._rooms.get(room, set()))


manager = ConnectionManager()
