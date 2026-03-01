from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.database import AsyncSessionLocal
from engine.broadcast_manager import BroadcastManager
from llm.client import LLMClient
from routers import websocket
from routers.agents import router as agents_router
from routers.sessions import router as sessions_router
from services import preset_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: seed system presets
    async with AsyncSessionLocal() as db:
        await preset_service.seed_system_presets(db)
    yield
    # Shutdown: nothing to clean up


app = FastAPI(title="AI Round Table API", version="0.1.0", lifespan=lifespan)

app.state.broadcast_manager = BroadcastManager()
app.state.llm_client = LLMClient(timeout_seconds=settings.LLM_TIMEOUT_SECONDS)
app.state.orchestrator_tasks = {}
app.state.active_orchestrators = {}
app.state.session_factory = AsyncSessionLocal

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(websocket.router)
app.include_router(sessions_router)
app.include_router(agents_router)


@app.get("/")
async def root():
    return {"message": "AI Round Table API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
