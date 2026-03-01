"""Tests for SPEC-402: Session Templates.

Covers:
- template_service.list_templates (empty db, ordering by created_at DESC)
- template_service.create_template (correct fields, UUID id, created_at set)
- template_service.delete_template (True when found, False when not found)
- template_service.save_session_as_template (None when session not found,
  template with agent data when session found)
- Router endpoints: GET /sessions/templates (200, empty list),
  POST /sessions/templates (201), DELETE /sessions/templates/{id} (204/404),
  POST /sessions/{id}/save-as-template (201/404)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from services import template_service
from schemas.api import CreateTemplateRequestSchema
from schemas.session import SessionConfigSchema
from models.session import Session
from models.agent import Agent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DEFAULT_CONFIG = {
    "max_rounds": 3,
    "convergence_majority": 0.6,
    "priority_weights": {"recency": 1.0, "novelty": 1.0, "role": 1.0},
    "thought_inspector_enabled": False,
}

_DEFAULT_AGENTS = [
    {
        "display_name": "Agent Alpha",
        "persona_description": "A thoughtful analyst",
        "expertise": "Economics",
        "llm_provider": "anthropic",
        "llm_model": "claude-sonnet-4-6",
        "llm_config": None,
        "role": "participant",
    }
]


def _make_create_request(**overrides) -> CreateTemplateRequestSchema:
    defaults = dict(
        name="Test Template",
        description="A template used in tests",
        agents=_DEFAULT_AGENTS,
        config=SessionConfigSchema(**_DEFAULT_CONFIG),
    )
    defaults.update(overrides)
    return CreateTemplateRequestSchema(**defaults)


async def _insert_session(db: AsyncSession, *, with_agent: bool = True) -> Session:
    """Insert a bare Session row (and optionally one Agent) directly into the DB."""
    session = Session(
        id=str(uuid.uuid4()),
        topic="Test Topic",
        supporting_context=None,
        status="configured",
        config=_DEFAULT_CONFIG,
        created_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.flush()

    if with_agent:
        agent = Agent(
            id=str(uuid.uuid4()),
            session_id=session.id,
            display_name="Agent Alpha",
            persona_description="A thoughtful analyst",
            expertise="Economics",
            llm_provider="anthropic",
            llm_model="claude-sonnet-4-6",
            llm_config=None,
            role="participant",
        )
        db.add(agent)

    await db.commit()
    return session


# ---------------------------------------------------------------------------
# list_templates
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_templates_empty_db(db: AsyncSession):
    """list_templates returns an empty list on a fresh database."""
    result = await template_service.list_templates(db)
    assert result == []


@pytest.mark.asyncio
async def test_list_templates_returns_all(db: AsyncSession):
    """list_templates returns every created template."""
    await template_service.create_template(db, _make_create_request(name="Template A"))
    await template_service.create_template(db, _make_create_request(name="Template B"))

    result = await template_service.list_templates(db)
    assert len(result) == 2


@pytest.mark.asyncio
async def test_list_templates_ordered_by_created_at_desc(db: AsyncSession):
    """list_templates orders results newest first (created_at DESC)."""
    from models.session_template import SessionTemplate as TemplateORM

    now = datetime.now(timezone.utc)
    older = TemplateORM(
        id=str(uuid.uuid4()),
        name="Older Template",
        description=None,
        agents=_DEFAULT_AGENTS,
        config=_DEFAULT_CONFIG,
        created_at=now - timedelta(seconds=10),
    )
    newer = TemplateORM(
        id=str(uuid.uuid4()),
        name="Newer Template",
        description=None,
        agents=_DEFAULT_AGENTS,
        config=_DEFAULT_CONFIG,
        created_at=now,
    )
    db.add(older)
    db.add(newer)
    await db.commit()

    result = await template_service.list_templates(db)
    assert len(result) == 2
    # Newest first
    assert result[0].id == newer.id
    assert result[1].id == older.id


# ---------------------------------------------------------------------------
# create_template
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_template_persists_fields(db: AsyncSession):
    """create_template writes all provided fields to the database."""
    data = _make_create_request(
        name="My Template",
        description="A detailed description",
        agents=_DEFAULT_AGENTS,
    )
    template = await template_service.create_template(db, data)

    assert template.name == "My Template"
    assert template.description == "A detailed description"
    assert template.agents == _DEFAULT_AGENTS


@pytest.mark.asyncio
async def test_create_template_id_is_uuid_string(db: AsyncSession):
    """create_template assigns a UUID string as the id."""
    template = await template_service.create_template(db, _make_create_request())

    assert template.id is not None
    # Must be parseable as a UUID
    parsed = uuid.UUID(template.id)
    assert str(parsed) == template.id


@pytest.mark.asyncio
async def test_create_template_created_at_is_set(db: AsyncSession):
    """create_template sets created_at to a recent datetime."""
    before = datetime.now(timezone.utc)
    template = await template_service.create_template(db, _make_create_request())
    after = datetime.now(timezone.utc)

    # created_at may be timezone-naive (SQLite stores without tz info)
    created_at = template.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    assert before <= created_at <= after


@pytest.mark.asyncio
async def test_create_template_optional_description_none(db: AsyncSession):
    """create_template accepts None as description."""
    data = _make_create_request(description=None)
    template = await template_service.create_template(db, data)

    assert template.description is None


@pytest.mark.asyncio
async def test_create_template_config_stored_as_dict(db: AsyncSession):
    """create_template stores the SessionConfigSchema as a plain dict."""
    template = await template_service.create_template(db, _make_create_request())

    assert isinstance(template.config, dict)
    assert template.config["max_rounds"] == 3
    assert template.config["convergence_majority"] == 0.6


# ---------------------------------------------------------------------------
# delete_template
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_template_returns_true_when_found(db: AsyncSession):
    """delete_template returns True after successfully deleting an existing template."""
    template = await template_service.create_template(db, _make_create_request())

    result = await template_service.delete_template(db, template.id)
    assert result is True


@pytest.mark.asyncio
async def test_delete_template_removes_from_db(db: AsyncSession):
    """delete_template removes the template so it no longer appears in list_templates."""
    template = await template_service.create_template(db, _make_create_request())
    await template_service.delete_template(db, template.id)

    remaining = await template_service.list_templates(db)
    assert template.id not in [t.id for t in remaining]


@pytest.mark.asyncio
async def test_delete_template_returns_false_when_not_found(db: AsyncSession):
    """delete_template returns False when the given id does not exist."""
    result = await template_service.delete_template(db, "nonexistent-template-id")
    assert result is False


@pytest.mark.asyncio
async def test_delete_template_idempotent_second_call(db: AsyncSession):
    """A second delete call on the same id returns False (already gone)."""
    template = await template_service.create_template(db, _make_create_request())
    await template_service.delete_template(db, template.id)

    second = await template_service.delete_template(db, template.id)
    assert second is False


# ---------------------------------------------------------------------------
# save_session_as_template
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_session_as_template_returns_none_when_session_missing(
    db: AsyncSession,
):
    """save_session_as_template returns None when the session_id does not exist."""
    result = await template_service.save_session_as_template(
        db, "nonexistent-session-id", name="Ghost Template"
    )
    assert result is None


@pytest.mark.asyncio
async def test_save_session_as_template_creates_template_from_session(
    db: AsyncSession,
):
    """save_session_as_template returns a template whose agents match the session's agents."""
    session = await _insert_session(db, with_agent=True)

    template = await template_service.save_session_as_template(
        db, session.id, name="From Session", description="Derived from a real session"
    )

    assert template is not None
    assert template.name == "From Session"
    assert template.description == "Derived from a real session"
    assert len(template.agents) == 1
    agent_data = template.agents[0]
    assert agent_data["display_name"] == "Agent Alpha"
    assert agent_data["llm_provider"] == "anthropic"
    assert agent_data["role"] == "participant"


@pytest.mark.asyncio
async def test_save_session_as_template_template_has_uuid_id(db: AsyncSession):
    """save_session_as_template assigns a valid UUID string as the template id."""
    session = await _insert_session(db, with_agent=False)

    template = await template_service.save_session_as_template(
        db, session.id, name="UUID Check"
    )

    assert template is not None
    parsed = uuid.UUID(template.id)
    assert str(parsed) == template.id


@pytest.mark.asyncio
async def test_save_session_as_template_appears_in_list(db: AsyncSession):
    """A template created via save_session_as_template is returned by list_templates."""
    session = await _insert_session(db, with_agent=False)

    template = await template_service.save_session_as_template(
        db, session.id, name="Listed Template"
    )

    all_templates = await template_service.list_templates(db)
    assert template.id in [t.id for t in all_templates]


@pytest.mark.asyncio
async def test_save_session_as_template_copies_session_config(db: AsyncSession):
    """save_session_as_template copies the session's config into the template."""
    session = await _insert_session(db, with_agent=False)

    template = await template_service.save_session_as_template(
        db, session.id, name="Config Copy"
    )

    assert template is not None
    assert template.config == _DEFAULT_CONFIG


# ---------------------------------------------------------------------------
# Router integration tests — HTTP layer
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def app_with_db(db: AsyncSession):
    """Return a FastAPI app instance with get_db overridden to use the test DB."""
    from main import app
    from core.database import get_db

    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    yield app
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_router_get_templates_empty(app_with_db):
    """GET /sessions/templates returns 200 with an empty list on a fresh db."""
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        response = await client.get("/sessions/templates")

    assert response.status_code == 200
    body = response.json()
    assert "templates" in body
    assert body["templates"] == []


@pytest.mark.asyncio
async def test_router_post_template_returns_201(app_with_db):
    """POST /sessions/templates returns 201 with the created template body."""
    payload = {
        "name": "HTTP Template",
        "description": "Created via HTTP",
        "agents": _DEFAULT_AGENTS,
        "config": _DEFAULT_CONFIG,
    }

    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        response = await client.post("/sessions/templates", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "HTTP Template"
    assert body["description"] == "Created via HTTP"
    assert "id" in body
    assert "created_at" in body
    assert body["agents"] == _DEFAULT_AGENTS


@pytest.mark.asyncio
async def test_router_get_templates_lists_created_templates(app_with_db):
    """GET /sessions/templates returns all previously created templates."""
    payload = {
        "name": "Listed via GET",
        "description": None,
        "agents": _DEFAULT_AGENTS,
        "config": _DEFAULT_CONFIG,
    }

    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        await client.post("/sessions/templates", json=payload)
        response = await client.get("/sessions/templates")

    assert response.status_code == 200
    body = response.json()
    names = [t["name"] for t in body["templates"]]
    assert "Listed via GET" in names


@pytest.mark.asyncio
async def test_router_delete_template_returns_204(app_with_db):
    """DELETE /sessions/templates/{id} returns 204 when the template exists."""
    payload = {
        "name": "To Delete",
        "description": None,
        "agents": _DEFAULT_AGENTS,
        "config": _DEFAULT_CONFIG,
    }

    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        create_resp = await client.post("/sessions/templates", json=payload)
        assert create_resp.status_code == 201
        template_id = create_resp.json()["id"]

        delete_resp = await client.delete(f"/sessions/templates/{template_id}")

    assert delete_resp.status_code == 204


@pytest.mark.asyncio
async def test_router_delete_template_returns_404_when_not_found(app_with_db):
    """DELETE /sessions/templates/{id} returns 404 when the template does not exist."""
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        response = await client.delete("/sessions/templates/does-not-exist")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_router_save_as_template_returns_404_when_session_not_found(
    app_with_db,
):
    """POST /sessions/{id}/save-as-template returns 404 when the session does not exist."""
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        response = await client.post(
            "/sessions/nonexistent-session/save-as-template",
            json={"name": "Ghost", "description": None},
        )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_router_save_as_template_returns_201_when_session_found(
    app_with_db, db: AsyncSession
):
    """POST /sessions/{id}/save-as-template returns 201 with the template when session exists."""
    session = await _insert_session(db, with_agent=True)

    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as client:
        response = await client.post(
            f"/sessions/{session.id}/save-as-template",
            json={"name": "From Live Session", "description": "Snapshot"},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "From Live Session"
    assert body["description"] == "Snapshot"
    assert "id" in body
    assert len(body["agents"]) == 1
    assert body["agents"][0]["display_name"] == "Agent Alpha"
