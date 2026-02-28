from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import HTTPException

from schemas.api import CreateSessionRequestSchema
from schemas.session import SessionConfigSchema
from services import session_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config() -> SessionConfigSchema:
    return SessionConfigSchema(
        max_rounds=5,
        convergence_majority=0.66,
        priority_weights={"recency": 0.33, "novelty": 0.33, "role": 0.34},
        thought_inspector_enabled=False,
    )


def _participant(name: str = "Agent") -> dict:
    return {
        "display_name": name,
        "persona_description": "A thinker.",
        "expertise": "General reasoning",
        "llm_provider": "openai",
        "llm_model": "gpt-4o",
        "llm_config": None,
        "role": "participant",
    }


def _moderator() -> dict:
    return {
        "display_name": "Moderator",
        "persona_description": "Keeps discussion on track.",
        "expertise": "Facilitation",
        "llm_provider": "openai",
        "llm_model": "gpt-4o",
        "llm_config": None,
        "role": "moderator",
    }


def _scribe() -> dict:
    return {
        "display_name": "Scribe",
        "persona_description": "Takes notes.",
        "expertise": "Summarisation",
        "llm_provider": "openai",
        "llm_model": "gpt-4o",
        "llm_config": None,
        "role": "scribe",
    }


def _valid_request(**overrides) -> CreateSessionRequestSchema:
    defaults = dict(
        topic="Is remote work better than office work?",
        supporting_context=None,
        config=_make_config(),
        agents=[
            _participant("Alice"),
            _participant("Bob"),
            _moderator(),
            _scribe(),
        ],
    )
    defaults.update(overrides)
    return CreateSessionRequestSchema(**defaults)


# ---------------------------------------------------------------------------
# create_session — happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_session_returns_session_with_agents(db):
    request = _valid_request()
    session = await session_service.create_session(db, request)

    assert session.id is not None
    assert session.topic == "Is remote work better than office work?"
    assert session.status == "configured"
    assert session.supporting_context is None
    assert len(session.agents) == 4


@pytest.mark.asyncio
async def test_create_session_persists_config(db):
    request = _valid_request()
    session = await session_service.create_session(db, request)

    assert session.config["max_rounds"] == 5
    assert session.config["convergence_majority"] == 0.66
    assert session.config["thought_inspector_enabled"] is False


@pytest.mark.asyncio
async def test_create_session_agents_have_correct_roles(db):
    request = _valid_request()
    session = await session_service.create_session(db, request)

    roles = [a.role for a in session.agents]
    assert roles.count("participant") == 2
    assert roles.count("moderator") == 1
    assert roles.count("scribe") == 1


@pytest.mark.asyncio
async def test_create_session_agents_belong_to_session(db):
    request = _valid_request()
    session = await session_service.create_session(db, request)

    for agent in session.agents:
        assert agent.session_id == session.id


@pytest.mark.asyncio
async def test_create_session_with_supporting_context(db):
    request = _valid_request(supporting_context="Some background research.")
    session = await session_service.create_session(db, request)

    assert session.supporting_context == "Some background research."


# ---------------------------------------------------------------------------
# create_session — validation failures
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_session_fails_with_fewer_than_2_participants(db):
    request = _valid_request(
        agents=[_participant("Alice"), _moderator(), _scribe()]
    )
    with pytest.raises(HTTPException) as exc_info:
        await session_service.create_session(db, request)

    assert exc_info.value.status_code == 400
    assert "participant" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_create_session_fails_with_no_participants(db):
    request = _valid_request(agents=[_moderator(), _scribe()])
    with pytest.raises(HTTPException) as exc_info:
        await session_service.create_session(db, request)

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_create_session_fails_with_no_moderator(db):
    request = _valid_request(
        agents=[_participant("Alice"), _participant("Bob"), _scribe()]
    )
    with pytest.raises(HTTPException) as exc_info:
        await session_service.create_session(db, request)

    assert exc_info.value.status_code == 400
    assert "moderator" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_create_session_fails_with_two_moderators(db):
    request = _valid_request(
        agents=[
            _participant("Alice"),
            _participant("Bob"),
            _moderator(),
            _moderator(),
            _scribe(),
        ]
    )
    with pytest.raises(HTTPException) as exc_info:
        await session_service.create_session(db, request)

    assert exc_info.value.status_code == 400
    assert "moderator" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_create_session_fails_with_no_scribe(db):
    request = _valid_request(
        agents=[_participant("Alice"), _participant("Bob"), _moderator()]
    )
    with pytest.raises(HTTPException) as exc_info:
        await session_service.create_session(db, request)

    assert exc_info.value.status_code == 400
    assert "scribe" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_create_session_fails_with_two_scribes(db):
    request = _valid_request(
        agents=[
            _participant("Alice"),
            _participant("Bob"),
            _moderator(),
            _scribe(),
            _scribe(),
        ]
    )
    with pytest.raises(HTTPException) as exc_info:
        await session_service.create_session(db, request)

    assert exc_info.value.status_code == 400
    assert "scribe" in exc_info.value.detail.lower()


# ---------------------------------------------------------------------------
# get_session
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_session_returns_session(db):
    created = await session_service.create_session(db, _valid_request())
    fetched = await session_service.get_session(db, created.id)

    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.topic == created.topic


@pytest.mark.asyncio
async def test_get_session_includes_agents(db):
    created = await session_service.create_session(db, _valid_request())
    fetched = await session_service.get_session(db, created.id)

    assert fetched is not None
    assert len(fetched.agents) == 4


@pytest.mark.asyncio
async def test_get_session_returns_none_for_missing_id(db):
    result = await session_service.get_session(db, "nonexistent-id")
    assert result is None


# ---------------------------------------------------------------------------
# list_sessions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_sessions_returns_all(db):
    await session_service.create_session(db, _valid_request(topic="Topic A"))
    await session_service.create_session(db, _valid_request(topic="Topic B"))

    sessions = await session_service.list_sessions(db)
    assert len(sessions) == 2


@pytest.mark.asyncio
async def test_list_sessions_ordered_by_created_at_desc(db):
    await session_service.create_session(db, _valid_request(topic="First"))
    await session_service.create_session(db, _valid_request(topic="Second"))

    sessions = await session_service.list_sessions(db)
    # Most recent first — "Second" was created after "First"
    topics = [s.topic for s in sessions]
    assert topics.index("Second") < topics.index("First")


@pytest.mark.asyncio
async def test_list_sessions_empty(db):
    sessions = await session_service.list_sessions(db)
    assert sessions == []
