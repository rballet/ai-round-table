from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.thought import Thought


async def save_thought(
    db: AsyncSession,
    *,
    session_id: str,
    agent_id: str,
    content: str,
) -> Thought:
    existing_max_version = await db.execute(
        select(func.max(Thought.version)).where(Thought.agent_id == agent_id)
    )
    current_version = existing_max_version.scalar_one_or_none() or 0

    thought = Thought(
        id=str(uuid.uuid4()),
        agent_id=agent_id,
        session_id=session_id,
        version=current_version + 1,
        content=content.strip(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(thought)
    await db.commit()
    await db.refresh(thought)
    return thought
