"""Tests for SPEC-305: End-to-End session lifecycle integration tests.

Covers the full pipeline from session creation through orchestration to completion,
using an in-memory SQLite database and mock LLM providers. No real HTTP server is
started — the orchestrator is invoked directly, exactly as the real start endpoint does.
"""
from __future__ import annotations

import json
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from engine.orchestrator import SessionOrchestrator
from llm.client import LLMClient
from llm.errors import LLMTimeoutError
from llm.providers.base import BaseLLMProvider
from llm.types import LLMConfig, Message
from models.argument import Argument
from models.summary import Summary
from models.error_event import ErrorEvent
from schemas.api import CreateSessionRequestSchema
from schemas.session import SessionConfigSchema
from services import session_service


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

    def events_of_type(self, t: str) -> list[dict]:
        return [e for e in self.events if e["type"] == t]


def _make_config(max_rounds: int = 3) -> SessionConfigSchema:
    return SessionConfigSchema(
        max_rounds=max_rounds,
        convergence_majority=0.66,
        priority_weights={"recency": 0.4, "novelty": 0.4, "role": 0.2},
        thought_inspector_enabled=False,
    )


def _participant(name: str, provider: str = "mock") -> dict:
    return {
        "display_name": name,
        "persona_description": f"{name} is a rigorous thinker.",
        "expertise": "Logic",
        "llm_provider": provider,
        "llm_model": "test-model",
        "role": "participant",
    }


def _moderator(provider: str = "mock") -> dict:
    return {
        "display_name": "Moderator",
        "persona_description": "Keeps discussion focused.",
        "expertise": "Facilitation",
        "llm_provider": provider,
        "llm_model": "test-model",
        "role": "moderator",
    }


def _scribe(provider: str = "mock") -> dict:
    return {
        "display_name": "Scribe",
        "persona_description": "Summarises concisely.",
        "expertise": "Synthesis",
        "llm_provider": provider,
        "llm_model": "test-model",
        "role": "scribe",
    }


def _make_session_request(max_rounds: int = 3, provider: str = "mock") -> CreateSessionRequestSchema:
    return CreateSessionRequestSchema(
        topic="Should autonomous AI be allowed to make medical decisions?",
        supporting_context="Recent advances make this question urgent.",
        config=_make_config(max_rounds),
        agents=[
            _participant("Alice", provider),
            _participant("Bob", provider),
            _moderator(provider),
            _scribe(provider),
        ],
    )


# ---------------------------------------------------------------------------
# Full-session mock provider — triggers cap termination after max_rounds
# ---------------------------------------------------------------------------

class FullSessionMockProvider(BaseLLMProvider):
    """Produces valid responses for every phase so the session runs to cap termination."""

    async def complete(
        self, model: str, messages: list[Message], config: LLMConfig | None = None
    ) -> str:
        system = messages[0]["content"]
        if "INITIAL, INDEPENDENT position" in system:
            return "My initial private position on the topic."
        if "given the token to speak" in system:
            return "This is my public argument. I believe we should proceed carefully."
        if "UPDATE your PRIVATE" in system or (
            "update" in system.lower() and "private" in system.lower()
        ):
            return "Updated private thought after hearing the argument."
        if "decide whether you need to speak again" in system:
            return json.dumps({
                "request_token": True,
                "novelty_tier": "reinforcement",
                "justification": "I have more to add.",
            })
        if "You are the Moderator" in system:
            return json.dumps({
                "status": "open",
                "novel_claims_this_round": 2,
                "justification": "Discussion is still evolving.",
            })
        if "You are a neutral Scribe" in system or "You are the Scribe" in system:
            return "## Summary\n\nThe discussion covered many angles.\n\n**Conclusion:** Proceed cautiously."
        return "Generic response."


# ---------------------------------------------------------------------------
# Test 1: Full session lifecycle — cap termination
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_full_session_lifecycle_cap_termination(db: AsyncSession):
    """A session with max_rounds=2 must terminate by cap and produce a summary."""
    request = _make_session_request(max_rounds=2)
    session = await session_service.create_session(db, request)

    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    provider = FullSessionMockProvider()
    llm_client = LLMClient(
        providers={"mock": provider},
        timeout_seconds=10.0,
        rate_limit_backoff_seconds=0.0,
    )
    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=session_factory,
        broadcast_manager=broadcaster,
        llm_client=llm_client,
    )

    await orchestrator.run("Begin the discussion.")

    types = broadcaster.event_types()

    # Core lifecycle events must all be present.
    assert "SESSION_START" in types
    assert "THINK_START" in types
    assert "THINK_END" in types
    assert "TOKEN_GRANTED" in types
    assert "ARGUMENT_POSTED" in types
    assert "QUEUE_UPDATED" in types
    assert "UPDATE_START" in types
    assert "UPDATE_END" in types
    assert "TOKEN_REQUEST" in types
    assert "CONVERGENCE_CHECK" in types
    assert "SUMMARY_POSTED" in types
    assert "SESSION_END" in types

    # Session must end with cap or consensus.
    session_end = broadcaster.events_of_type("SESSION_END")
    assert len(session_end) == 1
    assert session_end[0]["reason"] in ("cap", "consensus")

    # Summary must be persisted to SQLite.
    async with session_factory() as verify_db:
        result = await verify_db.execute(
            select(Summary).where(Summary.session_id == session.id)
        )
        summaries = list(result.scalars().all())
    assert len(summaries) == 1
    assert "Summary" in summaries[0].content or "summary" in summaries[0].content.lower()

    # At least one argument must be persisted.
    async with session_factory() as verify_db:
        result = await verify_db.execute(
            select(Argument).where(Argument.session_id == session.id)
        )
        arguments = list(result.scalars().all())
    assert len(arguments) >= 1


# ---------------------------------------------------------------------------
# Test 2: Full session lifecycle — convergence termination
# ---------------------------------------------------------------------------

class ConvergingMockProvider(BaseLLMProvider):
    """Moderator immediately reports convergence, all other phases succeed."""

    async def complete(
        self, model: str, messages: list[Message], config: LLMConfig | None = None
    ) -> str:
        system = messages[0]["content"]
        if "INITIAL, INDEPENDENT position" in system:
            return "My initial private position."
        if "given the token to speak" in system:
            return "Public argument for convergence test."
        if "UPDATE your PRIVATE" in system or (
            "update" in system.lower() and "private" in system.lower()
        ):
            return "Updated private thought."
        if "decide whether you need to speak again" in system:
            return json.dumps({
                "request_token": False,
                "novelty_tier": "reinforcement",
                "justification": "We have converged.",
            })
        if "You are the Moderator" in system:
            # Report converging from the first check — after 2 consecutive converging
            # turns (participant count = 2), the orchestrator terminates.
            return json.dumps({
                "status": "converging",
                "novel_claims_this_round": 0,
                "justification": "Consensus reached.",
            })
        if "You are a neutral Scribe" in system or "You are the Scribe" in system:
            return "## Consensus Summary\n\nThe group reached agreement."
        return "Generic response."


@pytest.mark.asyncio
async def test_full_session_lifecycle_convergence_termination(db: AsyncSession):
    """A session must terminate with 'consensus' when the moderator detects convergence."""
    request = _make_session_request(max_rounds=10)
    session = await session_service.create_session(db, request)

    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    provider = ConvergingMockProvider()
    llm_client = LLMClient(
        providers={"mock": provider},
        timeout_seconds=10.0,
        rate_limit_backoff_seconds=0.0,
    )
    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=session_factory,
        broadcast_manager=broadcaster,
        llm_client=llm_client,
    )

    await orchestrator.run("Begin the discussion.")

    session_end = broadcaster.events_of_type("SESSION_END")
    assert len(session_end) == 1
    assert session_end[0]["reason"] == "consensus"

    async with session_factory() as verify_db:
        result = await verify_db.execute(
            select(Summary).where(Summary.session_id == session.id)
        )
        summaries = list(result.scalars().all())
    assert len(summaries) == 1
    assert summaries[0].termination_reason == "consensus"


# ---------------------------------------------------------------------------
# Test 3: Error in argue phase does not crash the loop
# ---------------------------------------------------------------------------

class ArgueTimeoutMockProvider(BaseLLMProvider):
    """Raises timeout on the first argue call; all other phases succeed."""

    def __init__(self) -> None:
        self._argue_count = 0

    async def complete(
        self, model: str, messages: list[Message], config: LLMConfig | None = None
    ) -> str:
        system = messages[0]["content"]
        if "INITIAL, INDEPENDENT position" in system:
            return "My initial private position."
        if "given the token to speak" in system:
            self._argue_count += 1
            if self._argue_count == 1:
                raise LLMTimeoutError("LLM request timed out after 30.0 seconds.")
            return "Public argument (second attempt)."
        if "UPDATE your PRIVATE" in system or (
            "update" in system.lower() and "private" in system.lower()
        ):
            return "Updated private thought."
        if "decide whether you need to speak again" in system:
            return json.dumps({
                "request_token": False,
                "novelty_tier": "reinforcement",
                "justification": "Done.",
            })
        if "You are the Moderator" in system:
            return json.dumps({
                "status": "converging",
                "novel_claims_this_round": 0,
                "justification": "Converging.",
            })
        if "You are a neutral Scribe" in system or "You are the Scribe" in system:
            return "Summary after error recovery."
        return "Generic response."


@pytest.mark.asyncio
async def test_session_argue_error_does_not_crash_loop(db: AsyncSession):
    """An LLM timeout in the argue phase must emit ERROR and continue to SESSION_END."""
    request = _make_session_request(max_rounds=5)
    session = await session_service.create_session(db, request)

    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    provider = ArgueTimeoutMockProvider()
    llm_client = LLMClient(
        providers={"mock": provider},
        timeout_seconds=10.0,
        rate_limit_backoff_seconds=0.0,
    )
    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=session_factory,
        broadcast_manager=broadcaster,
        llm_client=llm_client,
    )

    await orchestrator.run("Begin the discussion.")

    # ERROR event must have been broadcast.
    error_events = broadcaster.events_of_type("ERROR")
    assert len(error_events) >= 1
    assert error_events[0]["code"] in ("LLM_TIMEOUT", "LLM_ERROR")

    # Session must still reach SESSION_END — the loop must not crash.
    assert "SESSION_END" in broadcaster.event_types()

    # Error must be persisted to SQLite.
    async with session_factory() as verify_db:
        result = await verify_db.execute(
            select(ErrorEvent).where(ErrorEvent.session_id == session.id)
        )
        rows = list(result.scalars().all())
    assert len(rows) >= 1


# ---------------------------------------------------------------------------
# Test 4: supporting_context validation (max 4000 chars)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_supporting_context_validation_max_4000_chars(db: AsyncSession):
    """session_service must not raise for 4000-char context; the HTTP layer enforces the cap.

    The 422 validation is done in the router (not the service), so we test that the
    service itself accepts a 4000-char value without error, and separately confirm that
    a context within limit is stored correctly.
    """
    long_context = "x" * 4000
    request = CreateSessionRequestSchema(
        topic="Boundary test",
        supporting_context=long_context,
        config=_make_config(),
        agents=[
            _participant("A"),
            _participant("B"),
            _moderator(),
            _scribe(),
        ],
    )
    session = await session_service.create_session(db, request)
    assert session.supporting_context == long_context


@pytest.mark.asyncio
async def test_supporting_context_is_injected_into_think_phase(db: AsyncSession):
    """The supporting_context must appear in LLM prompts sent during the think phase."""
    seen_prompts: list[str] = []

    class CapturingProvider(BaseLLMProvider):
        async def complete(
            self, model: str, messages: list[Message], config: LLMConfig | None = None
        ) -> str:
            for msg in messages:
                seen_prompts.append(msg["content"])
            system = messages[0]["content"]
            if "decide whether you need to speak again" in system:
                return json.dumps({
                    "request_token": False,
                    "novelty_tier": "reinforcement",
                    "justification": "Done.",
                })
            if "You are the Moderator" in system:
                return json.dumps({
                    "status": "converging",
                    "novel_claims_this_round": 0,
                    "justification": "Done.",
                })
            if "You are a neutral Scribe" in system or "You are the Scribe" in system:
                return "Summary."
            return "Response."

    request = CreateSessionRequestSchema(
        topic="Context injection test",
        supporting_context="UNIQUE_CONTEXT_MARKER_XYZ",
        config=_make_config(max_rounds=1),
        agents=[
            _participant("A"),
            _participant("B"),
            _moderator(),
            _scribe(),
        ],
    )
    session = await session_service.create_session(db, request)
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    provider = CapturingProvider()
    llm_client = LLMClient(
        providers={"mock": provider},
        timeout_seconds=10.0,
        rate_limit_backoff_seconds=0.0,
    )
    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=session_factory,
        broadcast_manager=broadcaster,
        llm_client=llm_client,
    )

    await orchestrator.run("Start.")

    assert any("UNIQUE_CONTEXT_MARKER_XYZ" in p for p in seen_prompts), (
        "supporting_context was not injected into any LLM prompt"
    )


# ---------------------------------------------------------------------------
# Test 5: Thought inspector events emitted during full lifecycle
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_thought_updated_events_emitted_with_inspector_enabled(db: AsyncSession):
    """With thought_inspector_enabled=True, THOUGHT_UPDATED must be emitted for every
    think and update phase turn."""
    request = CreateSessionRequestSchema(
        topic="Thought inspector e2e test",
        supporting_context=None,
        config=SessionConfigSchema(
            max_rounds=1,
            convergence_majority=0.66,
            priority_weights={},
            thought_inspector_enabled=True,
        ),
        agents=[
            _participant("A"),
            _participant("B"),
            _moderator(),
            _scribe(),
        ],
    )
    session = await session_service.create_session(db, request)
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    broadcaster = RecordingBroadcastManager()
    provider = ConvergingMockProvider()
    llm_client = LLMClient(
        providers={"mock": provider},
        timeout_seconds=10.0,
        rate_limit_backoff_seconds=0.0,
    )
    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=session_factory,
        broadcast_manager=broadcaster,
        llm_client=llm_client,
    )

    await orchestrator.run("Start.")

    thought_events = broadcaster.events_of_type("THOUGHT_UPDATED")
    # 2 participants → 2 think-phase events (version=1)
    # After the first argue turn, 1 non-speaker updates → 1 update-phase event (version>1)
    # Total ≥ 2
    assert len(thought_events) >= 2

    # Every event must carry the required fields.
    for evt in thought_events:
        assert "thought" in evt
        thought = evt["thought"]
        assert "id" in thought
        assert "agent_id" in thought
        assert "version" in thought
        assert "content" in thought
