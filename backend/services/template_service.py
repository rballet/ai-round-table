from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.session_template import SessionTemplate
from models.session import Session
from schemas.api import CreateTemplateRequestSchema


async def list_templates(db: AsyncSession) -> list[SessionTemplate]:
    """Return all templates ordered by created_at DESC."""
    result = await db.execute(
        select(SessionTemplate).order_by(SessionTemplate.created_at.desc())
    )
    return list(result.scalars().all())


async def create_template(
    db: AsyncSession, data: CreateTemplateRequestSchema
) -> SessionTemplate:
    """Insert a new template and return it."""
    template = SessionTemplate(
        id=str(uuid.uuid4()),
        name=data.name,
        description=data.description,
        agents=data.agents,
        config=data.config.model_dump(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(template)
    await db.commit()
    return template


async def delete_template(db: AsyncSession, template_id: str) -> bool:
    """Delete a template by ID. Returns True if deleted, False if not found."""
    result = await db.execute(
        select(SessionTemplate).where(SessionTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if template is None:
        return False
    await db.delete(template)
    await db.commit()
    return True


async def save_session_as_template(
    db: AsyncSession,
    session_id: str,
    name: str,
    description: Optional[str] = None,
) -> SessionTemplate | None:
    """Read session + agents and create a template from them.

    Returns None if the session is not found.
    """
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.agents))
    )
    session = result.scalar_one_or_none()
    if session is None:
        return None

    agents_data = [
        {
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

    template = SessionTemplate(
        id=str(uuid.uuid4()),
        name=name,
        description=description,
        agents=agents_data,
        config=session.config,
        created_at=datetime.now(timezone.utc),
    )
    db.add(template)
    await db.commit()
    return template
