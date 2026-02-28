from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import AsyncSessionLocal, get_db
from engine.orchestrator import SessionOrchestrator
from schemas.api import (
    CreateSessionRequestSchema,
    StartSessionRequestSchema,
    SessionResponseSchema,
    SessionsListResponseSchema,
)
from schemas.session import SessionSchema
from services import session_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _serialize_session(session) -> SessionSchema:
    created_at = session.created_at
    if hasattr(created_at, "isoformat"):
        created_at_str = created_at.isoformat()
    else:
        created_at_str = str(created_at)

    ended_at_str = None
    if session.ended_at is not None:
        ended_at_str = (
            session.ended_at.isoformat()
            if hasattr(session.ended_at, "isoformat")
            else str(session.ended_at)
        )

    agents = getattr(session, "agents", [])

    return SessionSchema(
        id=session.id,
        topic=session.topic,
        supporting_context=session.supporting_context,
        status=session.status,
        config=session.config,
        created_at=created_at_str,
        ended_at=ended_at_str,
        termination_reason=session.termination_reason,
        rounds_elapsed=None,
        agent_count=len(agents),
    )


@router.post("", status_code=201, response_model=SessionResponseSchema)
async def create_session(
    request: CreateSessionRequestSchema,
    db: AsyncSession = Depends(get_db),
) -> SessionResponseSchema:
    session = await session_service.create_session(db, request)
    base = _serialize_session(session)
    agents_out = [
        {
            "id": agent.id,
            "session_id": agent.session_id,
            "display_name": agent.display_name,
            "persona_description": agent.persona_description,
            "expertise": agent.expertise,
            "llm_provider": agent.llm_provider,
            "llm_model": agent.llm_model,
            "llm_config": agent.llm_config,
            "role": agent.role,
        }
        for agent in session.agents
    ]
    return SessionResponseSchema(**base.model_dump(), agents=agents_out)


@router.get("", response_model=SessionsListResponseSchema)
async def list_sessions(
    db: AsyncSession = Depends(get_db),
) -> SessionsListResponseSchema:
    sessions = await session_service.list_sessions(db)
    return SessionsListResponseSchema(
        sessions=[_serialize_session(s) for s in sessions]
    )


@router.get("/{session_id}", response_model=SessionResponseSchema)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionResponseSchema:
    session = await session_service.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    base = _serialize_session(session)
    agents_out = [
        {
            "id": agent.id,
            "session_id": agent.session_id,
            "display_name": agent.display_name,
            "persona_description": agent.persona_description,
            "expertise": agent.expertise,
            "llm_provider": agent.llm_provider,
            "llm_model": agent.llm_model,
            "llm_config": agent.llm_config,
            "role": agent.role,
        }
        for agent in session.agents
    ]
    return SessionResponseSchema(**base.model_dump(), agents=agents_out)


@router.post("/{session_id}/start", status_code=202)
async def start_session(
    session_id: str,
    payload: StartSessionRequestSchema,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    session = await session_service.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "configured":
        raise HTTPException(
            status_code=409,
            detail="Session can only be started from configured state",
        )

    active_tasks: dict[str, asyncio.Task] = request.app.state.orchestrator_tasks
    existing_task = active_tasks.get(session_id)
    if existing_task is not None and not existing_task.done():
        raise HTTPException(
            status_code=409, detail="Session is already running"
        )

    session_factory = getattr(
        request.app.state, "session_factory", AsyncSessionLocal
    )
    orchestrator = SessionOrchestrator(
        session_id=session_id,
        session_factory=session_factory,
        broadcast_manager=request.app.state.broadcast_manager,
        llm_client=request.app.state.llm_client,
    )
    task = asyncio.create_task(orchestrator.run(prompt=payload.prompt))
    active_tasks[session_id] = task

    def _cleanup(_task: asyncio.Task, sid: str = session_id) -> None:
        active_tasks.pop(sid, None)

    task.add_done_callback(_cleanup)
    return {"session_id": session_id, "status": "running"}
