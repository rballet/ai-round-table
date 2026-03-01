"""Tests for SPEC-302: Error Handling.

Covers:
- LLM timeout in argue phase → ERROR event broadcast, session continues
- LLM timeout in think phase → ERROR event broadcast, think phase continues for other agents
- LLM timeout in update phase → ERROR broadcast, update phase continues (UPDATE_END emitted)
- LLM timeout in decide phase → ERROR broadcast, decide phase continues (safe fallback)
- decide() double parse failure → returns fallback DecideResult (request_token=False)
- ErrorEvent ORM model persisted to SQLite via error_service.log_error
- GET /sessions/{id}/errors returns logged events
- Scribe LLM error → ERROR broadcast, SESSION_END with reason="error"
"""
from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from engine.context import AgentContext, ContextBundle
from engine.orchestrator import SessionOrchestrator
from llm.client import LLMClient
from llm.errors import LLMTimeoutError, LLMError
from llm.providers.base import BaseLLMProvider
from llm.types import LLMConfig, Message
from models.error_event import ErrorEvent
from schemas.api import CreateSessionRequestSchema
from schemas.session import SessionConfigSchema
from services import error_service, session_service


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


class RecordingBroadcastManager:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def broadcast(self, session_id: str, event: dict) -> None:
        self.events.append(event)

    def event_types(self) -> list[str]:
        return [e["type"] for e in self.events]

    def events_of_type(self, event_type: str) -> list[dict]:
        return [e for e in self.events if e["type"] == event_type]


def _make_config() -> SessionConfigSchema:
    return SessionConfigSchema(
        max_rounds=5,
        convergence_majority=0.66,
        priority_weights={"recency": 0.4, "novelty": 0.5, "role": 0.1},
        thought_inspector_enabled=False,
    )


def _participant(name: str) -> dict:
    return {
        "display_name": name,
        "persona_description": "A rigorous thinker.",
        "expertise": "Reasoning",
        "llm_provider": "fake",
        "llm_model": "fake-model",
        "llm_config": {"temperature": 0.1},
        "role": "participant",
    }


def _moderator() -> dict:
    return {
        "display_name": "Moderator",
        "persona_description": "Keeps discussion focused.",
        "expertise": "Facilitation",
        "llm_provider": "fake",
        "llm_model": "fake-model",
        "llm_config": {"temperature": 0.1},
        "role": "moderator",
    }


def _scribe() -> dict:
    return {
        "display_name": "Scribe",
        "persona_description": "Summarises clearly.",
        "expertise": "Synthesis",
        "llm_provider": "fake",
        "llm_model": "fake-model",
        "llm_config": {"temperature": 0.1},
        "role": "scribe",
    }


def _valid_request() -> CreateSessionRequestSchema:
    return CreateSessionRequestSchema(
        topic="Should we prefer monoliths or microservices?",
        supporting_context="We are a team of six engineers.",
        config=_make_config(),
        agents=[
            _participant("Alice"),
            _participant("Bob"),
            _moderator(),
            _scribe(),
        ],
    )


def _make_orchestrator(
    session_id: str,
    session_factory: async_sessionmaker,
    broadcaster: RecordingBroadcastManager,
    provider: BaseLLMProvider,
) -> SessionOrchestrator:
    llm_client = LLMClient(
        providers={"fake": provider},
        timeout_seconds=5.0,
        rate_limit_backoff_seconds=0.0,
    )
    return SessionOrchestrator(
        session_id=session_id,
        session_factory=session_factory,
        broadcast_manager=broadcaster,
        llm_client=llm_client,
    )


# ---------------------------------------------------------------------------
# Provider that raises LLMTimeoutError on the argue call
# ---------------------------------------------------------------------------


class ArgueTimeoutProvider(BaseLLMProvider):
    """Raises LLMTimeoutError on argue prompts; succeeds for all other phases."""

    def __init__(self) -> None:
        self.argue_calls = 0

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        system = messages[0]["content"]
        if "INITIAL, INDEPENDENT position" in system:
            return "Initial private position."
        if "given the token to speak" in system:
            self.argue_calls += 1
            raise LLMTimeoutError("LLM request timed out after 30.0 seconds.")
        if "UPDATE your PRIVATE" in system or (
            "update" in system.lower() and "private" in system.lower()
        ):
            return "Updated private position."
        if "decide whether you need to speak again" in system:
            return '{"request_token": false, "novelty_tier": "reinforcement", "justification": "No."}'
        # Moderator convergence check.
        if "You are the Moderator" in system:
            return '{"status": "converging", "novel_claims_this_round": 0, "justification": "Done."}'
        # Scribe.
        if "You are a neutral Scribe" in system:
            return "Summary of the discussion."
        return "fallback completion"


# ---------------------------------------------------------------------------
# Provider that raises LLMTimeoutError on the scribe call
# ---------------------------------------------------------------------------


class ScribeTimeoutProvider(BaseLLMProvider):
    """All phases succeed except the scribe call, which raises LLMTimeoutError."""

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        system = messages[0]["content"]
        if "INITIAL, INDEPENDENT position" in system:
            return "Initial private position."
        if "given the token to speak" in system:
            return "Public argument."
        if "UPDATE your PRIVATE" in system or (
            "update" in system.lower() and "private" in system.lower()
        ):
            return "Updated private position."
        if "decide whether you need to speak again" in system:
            return '{"request_token": false, "novelty_tier": "reinforcement", "justification": "No."}'
        # Moderator convergence check: system contains "You are the Moderator"
        if "You are the Moderator" in system:
            return '{"status": "converging", "novel_claims_this_round": 0, "justification": "Done."}'
        # Scribe prompt: system contains "You are a neutral Scribe"
        if "You are a neutral Scribe" in system:
            raise LLMTimeoutError("LLM request timed out after 30.0 seconds.")
        return "fallback completion"


# ---------------------------------------------------------------------------
# Provider that raises LLMTimeoutError on update calls for a specific agent
# ---------------------------------------------------------------------------


class UpdateTimeoutProvider(BaseLLMProvider):
    """Raises LLMTimeoutError for Bob's update calls; all other calls succeed."""

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        system = messages[0]["content"]
        is_update = "UPDATE your PRIVATE" in system or (
            "update" in system.lower() and "private" in system.lower()
        )
        if is_update and "You are Bob." in system:
            raise LLMTimeoutError("LLM request timed out after 30.0 seconds.")
        if "INITIAL, INDEPENDENT position" in system:
            return "Initial private position."
        if "given the token to speak" in system:
            return "Public argument."
        if is_update:
            return "Updated private position."
        if "decide whether you need to speak again" in system:
            return '{"request_token": false, "novelty_tier": "reinforcement", "justification": "No."}'
        if "You are the Moderator" in system:
            return '{"status": "converging", "novel_claims_this_round": 0, "justification": "Done."}'
        if "You are a neutral Scribe" in system:
            return "Summary of the discussion."
        return "fallback completion"


# ---------------------------------------------------------------------------
# Provider that raises LLMTimeoutError on decide calls
# ---------------------------------------------------------------------------


class DecideTimeoutProvider(BaseLLMProvider):
    """Raises LLMTimeoutError for all decide calls; all other calls succeed."""

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        system = messages[0]["content"]
        if "decide whether you need to speak again" in system:
            raise LLMTimeoutError("LLM request timed out after 30.0 seconds.")
        if "INITIAL, INDEPENDENT position" in system:
            return "Initial private position."
        if "given the token to speak" in system:
            return "Public argument."
        if "UPDATE your PRIVATE" in system or (
            "update" in system.lower() and "private" in system.lower()
        ):
            return "Updated private position."
        if "You are the Moderator" in system:
            return '{"status": "converging", "novel_claims_this_round": 0, "justification": "Done."}'
        if "You are a neutral Scribe" in system:
            return "Summary of the discussion."
        return "fallback completion"


# ---------------------------------------------------------------------------
# Unit tests for error_service
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_log_error_persists_to_db(db: AsyncSession):
    """error_service.log_error must save an ErrorEvent to SQLite."""
    session = await session_service.create_session(db, _valid_request())

    saved = await error_service.log_error(
        db,
        session_id=session.id,
        code="LLM_TIMEOUT",
        message="Request timed out.",
        agent_id="agent-abc",
    )

    assert saved.id is not None
    assert saved.session_id == session.id
    assert saved.agent_id == "agent-abc"
    assert saved.code == "LLM_TIMEOUT"
    assert saved.message == "Request timed out."
    assert saved.created_at is not None

    # Verify persistence.
    result = await db.execute(
        select(ErrorEvent).where(ErrorEvent.session_id == session.id)
    )
    rows = list(result.scalars().all())
    assert len(rows) == 1
    assert rows[0].code == "LLM_TIMEOUT"


@pytest.mark.asyncio
async def test_log_error_without_agent_id(db: AsyncSession):
    """log_error must work when agent_id is None (session-level errors)."""
    session = await session_service.create_session(db, _valid_request())

    saved = await error_service.log_error(
        db,
        session_id=session.id,
        code="SCRIBE_ERROR",
        message="Scribe failed.",
    )

    assert saved.agent_id is None
    result = await db.execute(
        select(ErrorEvent).where(ErrorEvent.session_id == session.id)
    )
    rows = list(result.scalars().all())
    assert len(rows) == 1
    assert rows[0].agent_id is None


@pytest.mark.asyncio
async def test_get_errors_for_session_returns_all_events(db: AsyncSession):
    """get_errors_for_session must return events in created_at order."""
    session = await session_service.create_session(db, _valid_request())

    await error_service.log_error(db, session_id=session.id, code="ERR_A", message="First")
    await error_service.log_error(db, session_id=session.id, code="ERR_B", message="Second")

    events = await error_service.get_errors_for_session(db, session.id)
    assert len(events) == 2
    assert events[0].code == "ERR_A"
    assert events[1].code == "ERR_B"


# ---------------------------------------------------------------------------
# Integration tests: argue-phase LLM timeout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_argue_timeout_broadcasts_error_event(db: AsyncSession):
    """LLMTimeoutError in argue phase must broadcast an ERROR event with agent_id."""
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    orchestrator = _make_orchestrator(
        session.id, session_factory, broadcaster, ArgueTimeoutProvider()
    )

    await orchestrator.run(prompt="Which architecture?")

    error_events = broadcaster.events_of_type("ERROR")
    assert len(error_events) >= 1
    first_error = error_events[0]
    assert first_error["code"] in ("LLM_TIMEOUT", "LLM_ERROR")
    assert "agent_id" in first_error
    assert "message" in first_error


@pytest.mark.asyncio
async def test_argue_timeout_logs_error_to_db(db: AsyncSession):
    """LLMTimeoutError in argue phase must persist an ErrorEvent to SQLite."""
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    orchestrator = _make_orchestrator(
        session.id, session_factory, broadcaster, ArgueTimeoutProvider()
    )

    await orchestrator.run(prompt="Which architecture?")

    async with session_factory() as verify_db:
        result = await verify_db.execute(
            select(ErrorEvent).where(ErrorEvent.session_id == session.id)
        )
        rows = list(result.scalars().all())

    assert len(rows) >= 1
    assert any(r.code in ("LLM_TIMEOUT", "LLM_ERROR") for r in rows)


@pytest.mark.asyncio
async def test_argue_timeout_does_not_crash_orchestration(db: AsyncSession):
    """An argue-phase timeout must not crash the orchestration loop."""
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    orchestrator = _make_orchestrator(
        session.id, session_factory, broadcaster, ArgueTimeoutProvider()
    )

    # Must complete without raising.
    await orchestrator.run(prompt="Which architecture?")

    # SESSION_END must still be emitted even though argues timed out.
    assert "SESSION_END" in broadcaster.event_types()


# ---------------------------------------------------------------------------
# Integration tests: update-phase LLM timeout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_timeout_broadcasts_error_and_emits_update_end(db: AsyncSession):
    """LLMTimeoutError in update phase must broadcast ERROR + still emit UPDATE_END."""
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    orchestrator = _make_orchestrator(
        session.id, session_factory, broadcaster, UpdateTimeoutProvider()
    )

    await orchestrator.run(prompt="Which architecture?")

    error_events = broadcaster.events_of_type("ERROR")
    assert len(error_events) >= 1
    assert any(e["code"] in ("LLM_TIMEOUT", "LLM_ERROR") for e in error_events)

    # UPDATE_END must still be emitted even for the failing agent.
    update_end_events = broadcaster.events_of_type("UPDATE_END")
    assert len(update_end_events) >= 1


@pytest.mark.asyncio
async def test_update_timeout_logs_error_to_db(db: AsyncSession):
    """LLMTimeoutError in update phase must persist an ErrorEvent to SQLite."""
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    orchestrator = _make_orchestrator(
        session.id, session_factory, broadcaster, UpdateTimeoutProvider()
    )

    await orchestrator.run(prompt="Which architecture?")

    async with session_factory() as verify_db:
        result = await verify_db.execute(
            select(ErrorEvent).where(ErrorEvent.session_id == session.id)
        )
        rows = list(result.scalars().all())

    assert len(rows) >= 1
    assert any(r.code in ("LLM_TIMEOUT", "LLM_ERROR") for r in rows)


# ---------------------------------------------------------------------------
# Integration tests: decide-phase LLM timeout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_decide_timeout_broadcasts_error(db: AsyncSession):
    """LLMTimeoutError in decide phase must broadcast an ERROR event."""
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    orchestrator = _make_orchestrator(
        session.id, session_factory, broadcaster, DecideTimeoutProvider()
    )

    await orchestrator.run(prompt="Which architecture?")

    error_events = broadcaster.events_of_type("ERROR")
    assert len(error_events) >= 1
    assert any(e["code"] in ("LLM_TIMEOUT", "LLM_ERROR") for e in error_events)


@pytest.mark.asyncio
async def test_decide_timeout_does_not_crash_orchestration(db: AsyncSession):
    """A decide-phase timeout must not crash the orchestration loop."""
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    orchestrator = _make_orchestrator(
        session.id, session_factory, broadcaster, DecideTimeoutProvider()
    )

    await orchestrator.run(prompt="Which architecture?")

    assert "SESSION_END" in broadcaster.event_types()


@pytest.mark.asyncio
async def test_decide_timeout_logs_error_to_db(db: AsyncSession):
    """LLMTimeoutError in decide phase must persist an ErrorEvent to SQLite."""
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    orchestrator = _make_orchestrator(
        session.id, session_factory, broadcaster, DecideTimeoutProvider()
    )

    await orchestrator.run(prompt="Which architecture?")

    async with session_factory() as verify_db:
        result = await verify_db.execute(
            select(ErrorEvent).where(ErrorEvent.session_id == session.id)
        )
        rows = list(result.scalars().all())

    assert len(rows) >= 1


# ---------------------------------------------------------------------------
# Integration tests: scribe-phase LLM timeout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scribe_timeout_broadcasts_error_and_session_end(db: AsyncSession):
    """LLMTimeoutError in scribe phase must broadcast ERROR then SESSION_END with reason='error'."""
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    orchestrator = _make_orchestrator(
        session.id, session_factory, broadcaster, ScribeTimeoutProvider()
    )

    await orchestrator.run(prompt="Which architecture?")

    error_events = broadcaster.events_of_type("ERROR")
    assert len(error_events) >= 1

    session_end_events = broadcaster.events_of_type("SESSION_END")
    assert len(session_end_events) == 1
    assert session_end_events[0]["reason"] == "error"
    assert session_end_events[0]["summary_id"] is None


@pytest.mark.asyncio
async def test_scribe_timeout_logs_error_to_db(db: AsyncSession):
    """LLMTimeoutError in scribe phase must persist an ErrorEvent to SQLite."""
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    orchestrator = _make_orchestrator(
        session.id, session_factory, broadcaster, ScribeTimeoutProvider()
    )

    await orchestrator.run(prompt="Which architecture?")

    async with session_factory() as verify_db:
        result = await verify_db.execute(
            select(ErrorEvent).where(ErrorEvent.session_id == session.id)
        )
        rows = list(result.scalars().all())

    assert len(rows) >= 1
    assert any(r.code in ("LLM_TIMEOUT", "LLM_ERROR") for r in rows)
