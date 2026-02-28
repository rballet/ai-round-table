from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.queue_entry import QueueEntry


async def create_queue_entry(
    db: AsyncSession,
    *,
    session_id: str,
    agent_id: str,
    novelty_tier: str,
    priority_score: float,
    justification: str | None,
) -> QueueEntry:
    entry = QueueEntry(
        id=str(uuid.uuid4()),
        session_id=session_id,
        agent_id=agent_id,
        novelty_tier=novelty_tier,
        justification=justification.strip() if justification else None,
        priority_score=priority_score,
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def mark_queue_entry_processed(
    db: AsyncSession,
    *,
    queue_entry_id: str,
) -> QueueEntry | None:
    result = await db.execute(
        select(QueueEntry).where(QueueEntry.id == queue_entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return None

    entry.processed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(entry)
    return entry
