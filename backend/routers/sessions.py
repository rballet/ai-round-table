from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import AsyncSessionLocal, get_db
from engine.orchestrator import SessionOrchestrator
from schemas.api import (
    CreateSessionRequestSchema,
    StartSessionRequestSchema,
    SessionResponseSchema,
    SessionsListResponseSchema,
    TranscriptResponseSchema,
    ThoughtsResponseSchema,
    QueueResponseSchema,
    SummaryResponseSchema,
    ErrorsResponseSchema,
)
from schemas.session import SessionSchema
from services import error_service, session_service

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

    if not hasattr(request.app.state, "active_orchestrators"):
        request.app.state.active_orchestrators = {}
    active_orchestrators: dict[str, SessionOrchestrator] = request.app.state.active_orchestrators

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
    active_orchestrators[session_id] = orchestrator

    def _cleanup(_task: asyncio.Task, sid: str = session_id) -> None:
        active_tasks.pop(sid, None)
        active_orchestrators.pop(sid, None)

    task.add_done_callback(_cleanup)
    return {"session_id": session_id, "status": "running"}


@router.post("/{session_id}/pause", status_code=200)
async def pause_session(
    session_id: str,
    request: Request,
) -> dict[str, str]:
    if not hasattr(request.app.state, "active_orchestrators"):
        raise HTTPException(status_code=404, detail="Session not running")
        
    orchestrator = request.app.state.active_orchestrators.get(session_id)
    if orchestrator is None:
        raise HTTPException(status_code=404, detail="Session not running")
        
    await orchestrator.pause()
    return {"session_id": session_id, "status": "paused"}


@router.post("/{session_id}/resume", status_code=200)
async def resume_session(
    session_id: str,
    request: Request,
) -> dict[str, str]:
    if not hasattr(request.app.state, "active_orchestrators"):
        raise HTTPException(status_code=404, detail="Session not running")
        
    orchestrator = request.app.state.active_orchestrators.get(session_id)
    if orchestrator is None:
        raise HTTPException(status_code=404, detail="Session not running")
        
    await orchestrator.resume()
    return {"session_id": session_id, "status": "resumed"}


@router.post("/{session_id}/end", status_code=200)
async def end_session(
    session_id: str,
    request: Request,
) -> dict[str, str]:
    if not hasattr(request.app.state, "active_orchestrators"):
        raise HTTPException(status_code=404, detail="Session not running")
        
    orchestrator = request.app.state.active_orchestrators.get(session_id)
    if orchestrator is None:
        raise HTTPException(status_code=404, detail="Session not running")
        
    await orchestrator.end()
    return {"session_id": session_id, "status": "ending"}


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    request: Request = None,
) -> Response:
    # Check if session is running and force end it to clean up orchestrator state
    if request and hasattr(request.app.state, "active_orchestrators"):
        orchestrator = request.app.state.active_orchestrators.get(session_id)
        if orchestrator:
            await orchestrator.end()
            request.app.state.active_orchestrators.pop(session_id, None)

    success = await session_service.delete_session(db, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return Response(status_code=204)


@router.get("/{session_id}/transcript", response_model=TranscriptResponseSchema)
async def get_transcript(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> TranscriptResponseSchema:
    session = await session_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    agents_map = {a.id: a.display_name for a in session.agents}
    arguments = await session_service.get_transcript(db, session_id)

    args_out = []
    for arg in arguments:
        created_at_str = arg.created_at.isoformat() if hasattr(arg.created_at, "isoformat") else str(arg.created_at)
        args_out.append({
            "id": arg.id,
            "agent_id": arg.agent_id,
            "agent_name": agents_map.get(arg.agent_id, "Unknown"),
            "round_index": arg.round_index,
            "turn_index": arg.turn_index,
            "content": arg.content,
            "created_at": created_at_str,
        })

    return TranscriptResponseSchema(session_id=session_id, arguments=args_out)


@router.get("/{session_id}/thoughts", response_model=ThoughtsResponseSchema)
async def get_thoughts(
    session_id: str,
    version: Optional[int] = None,
    agent_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> ThoughtsResponseSchema:
    session = await session_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    agents_map = {a.id: a.display_name for a in session.agents}
    thoughts = await session_service.get_thoughts(db, session_id, version, agent_id)

    thoughts_out = []
    for t in thoughts:
        created_at_str = t.created_at.isoformat() if hasattr(t.created_at, "isoformat") else str(t.created_at)
        thoughts_out.append({
            "id": t.id,
            "agent_id": t.agent_id,
            "agent_name": agents_map.get(t.agent_id, "Unknown"),
            "version": t.version,
            "content": t.content,
            "created_at": created_at_str,
        })

    return ThoughtsResponseSchema(session_id=session_id, thoughts=thoughts_out)


@router.get("/{session_id}/queue", response_model=QueueResponseSchema)
async def get_queue(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> QueueResponseSchema:
    session = await session_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    agents_map = {a.id: a.display_name for a in session.agents}
    queue_entries = await session_service.get_queue(db, session_id)

    queue_out = []
    for q in queue_entries:
        queue_out.append({
            "agent_id": q.agent_id,
            "agent_name": agents_map.get(q.agent_id, "Unknown"),
            "priority_score": q.priority_score,
            "novelty_tier": q.novelty_tier,
            "justification": q.justification,
            "position": q.position,
        })

    return QueueResponseSchema(session_id=session_id, queue=queue_out)


@router.get("/{session_id}/summary", response_model=SummaryResponseSchema)
async def get_summary(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SummaryResponseSchema:
    session = await session_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    summary = await session_service.get_summary(db, session_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")

    created_at_str = summary.created_at.isoformat() if hasattr(summary.created_at, "isoformat") else str(summary.created_at)

    return SummaryResponseSchema(
        id=summary.id,
        session_id=summary.session_id,
        termination_reason=summary.termination_reason,
        content=summary.content,
        created_at=created_at_str,
    )


@router.get("/{session_id}/errors", response_model=ErrorsResponseSchema)
async def get_errors(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> ErrorsResponseSchema:
    session = await session_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    events = await error_service.get_errors_for_session(db, session_id)
    errors_out = []
    for ev in events:
        created_at_str = (
            ev.created_at.isoformat()
            if hasattr(ev.created_at, "isoformat")
            else str(ev.created_at)
        )
        errors_out.append(
            {
                "id": ev.id,
                "session_id": ev.session_id,
                "agent_id": ev.agent_id,
                "code": ev.code,
                "message": ev.message,
                "created_at": created_at_str,
            }
        )

    return ErrorsResponseSchema(session_id=session_id, errors=errors_out)

