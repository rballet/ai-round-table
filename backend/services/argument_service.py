from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.argument import Argument


async def save_argument(
    db: AsyncSession,
    *,
    session_id: str,
    agent_id: str,
    round_index: int,
    turn_index: int,
    content: str,
) -> Argument:
    argument = Argument(
        id=str(uuid.uuid4()),
        session_id=session_id,
        agent_id=agent_id,
        round_index=round_index,
        turn_index=turn_index,
        content=content.strip(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(argument)
    await db.commit()
    await db.refresh(argument)
    return argument


async def list_arguments_for_session(
    db: AsyncSession,
    *,
    session_id: str,
) -> list[Argument]:
    result = await db.execute(
        select(Argument)
        .where(Argument.session_id == session_id)
        .order_by(Argument.turn_index.asc(), Argument.created_at.asc())
    )
    return list(result.scalars().all())
