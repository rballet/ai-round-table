from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket


class BroadcastManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, session_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[session_id].add(ws)

    async def disconnect(self, session_id: str, ws: WebSocket) -> None:
        connections = self._connections.get(session_id)
        if not connections:
            return

        connections.discard(ws)
        if not connections:
            self._connections.pop(session_id, None)

    async def broadcast(self, session_id: str, event: dict) -> None:
        connections = list(self._connections.get(session_id, ()))
        if not connections:
            return

        stale_connections: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_json(event)
            except Exception:
                stale_connections.append(ws)

        for ws in stale_connections:
            await self.disconnect(session_id, ws)
