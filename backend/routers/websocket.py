from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

@router.websocket("/sessions/{session_id}/stream")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        while True:
            # Skeleton endpoint, doing nothing yet but keeping connection active
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        pass
