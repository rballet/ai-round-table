from __future__ import annotations

import logging
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.error_event import ErrorEvent

logger = logging.getLogger(__name__)


async def log_error(
    db: AsyncSession,
    session_id: str,
    code: str,
    message: str,
    agent_id: Optional[str] = None,
) -> ErrorEvent:
    """Persist an error event to SQLite and return the saved record."""
    event = ErrorEvent(
        session_id=session_id,
        agent_id=agent_id,
        code=code,
        message=message,
    )
    db.add(event)
    await db.commit()
    logger.warning(
        "Error logged: session=%s agent=%s code=%s message=%s",
        session_id,
        agent_id,
        code,
        message,
    )
    return event


async def get_errors_for_session(
    db: AsyncSession,
    session_id: str,
) -> List[ErrorEvent]:
    """Return all error events for a session, ordered by creation time."""
    result = await db.execute(
        select(ErrorEvent)
        .where(ErrorEvent.session_id == session_id)
        .order_by(ErrorEvent.created_at)
    )
    return list(result.scalars().all())
