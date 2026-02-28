from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.agent import Agent
from models.session import Session
from models.argument import Argument
from models.thought import Thought
from models.queue_entry import QueueEntry
from models.summary import Summary
from schemas.api import CreateSessionRequestSchema


async def create_session(
    db: AsyncSession, request: CreateSessionRequestSchema
) -> Session:
    agents_data = request.agents

    participant_count = sum(
        1 for a in agents_data if a.get("role") == "participant"
    )
    moderator_count = sum(
        1 for a in agents_data if a.get("role") == "moderator"
    )
    scribe_count = sum(
        1 for a in agents_data if a.get("role") == "scribe"
    )

    if participant_count < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 participant agents required",
        )
    if moderator_count != 1:
        raise HTTPException(
            status_code=400,
            detail="Exactly one moderator agent required",
        )
    if scribe_count != 1:
        raise HTTPException(
            status_code=400,
            detail="Exactly one scribe agent required",
        )

    session_id = str(uuid.uuid4())
    session = Session(
        id=session_id,
        topic=request.topic,
        supporting_context=request.supporting_context,
        status="configured",
        config=request.config.model_dump(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(session)

    for agent_data in agents_data:
        agent = Agent(
            id=str(uuid.uuid4()),
            session_id=session_id,
            display_name=agent_data.get("display_name", ""),
            persona_description=agent_data.get("persona_description"),
            expertise=agent_data.get("expertise"),
            llm_provider=agent_data.get("llm_provider", ""),
            llm_model=agent_data.get("llm_model", ""),
            llm_config=agent_data.get("llm_config"),
            role=agent_data.get("role", ""),
        )
        db.add(agent)

    await db.commit()

    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.agents))
    )
    return result.scalar_one()


async def get_session(db: AsyncSession, session_id: str) -> Session | None:
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.agents))
    )
    return result.scalar_one_or_none()


async def list_sessions(db: AsyncSession) -> list[Session]:
    result = await db.execute(
        select(Session)
        .options(selectinload(Session.agents))
        .order_by(Session.created_at.desc())
    )
    return list(result.scalars().all())


async def get_transcript(db: AsyncSession, session_id: str) -> list[Argument]:
    result = await db.execute(
        select(Argument)
        .where(Argument.session_id == session_id)
        .order_by(Argument.created_at.asc())
    )
    return list(result.scalars().all())


async def get_thoughts(
    db: AsyncSession, session_id: str, version: int | None = None
) -> list[Thought]:
    query = select(Thought).where(Thought.session_id == session_id)
    if version is not None:
        query = query.where(Thought.version == version)
    else:
        query = query.order_by(Thought.agent_id, Thought.version.desc())

    result = await db.execute(query)
    thoughts = list(result.scalars().all())

    if version is None:
        latest_thoughts = []
        seen_agents = set()
        for t in thoughts:
            if t.agent_id not in seen_agents:
                latest_thoughts.append(t)
                seen_agents.add(t.agent_id)
        return latest_thoughts
    return thoughts


async def get_queue(db: AsyncSession, session_id: str) -> list[QueueEntry]:
    result = await db.execute(
        select(QueueEntry)
        .where(QueueEntry.session_id == session_id)
        .where(QueueEntry.processed_at.is_(None))
        .order_by(QueueEntry.position.asc())
    )
    return list(result.scalars().all())


async def get_summary(db: AsyncSession, session_id: str) -> Summary | None:
    result = await db.execute(
        select(Summary)
        .where(Summary.session_id == session_id)
        .order_by(Summary.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()

