from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import websocket
from routers.sessions import router as sessions_router
from routers.agents import router as agents_router

app = FastAPI(title="AI Round Table API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
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
