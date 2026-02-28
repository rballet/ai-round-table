from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from engine.broadcast_manager import BroadcastManager

router = APIRouter()


@router.websocket("/sessions/{session_id}/stream")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    manager: BroadcastManager = websocket.app.state.broadcast_manager
    await manager.connect(session_id, websocket)
    try:
        while True:
            # Keep the connection alive until the client disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(session_id, websocket)
