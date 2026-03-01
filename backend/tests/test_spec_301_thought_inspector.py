"""Tests for SPEC-301: Thought Inspector backend implementation.

Covers:
1. GET /sessions/{id}/thoughts?agent_id=X  returns full version history for one agent.
2. GET /sessions/{id}/thoughts             still returns latest-per-agent (existing behaviour).
3. GET /sessions/{id}/thoughts?version=N   still returns all agents at version N.
4. THOUGHT_UPDATED is emitted during _phase_think when thought_inspector_enabled=True.
5. THOUGHT_UPDATED is NOT emitted during _phase_think when thought_inspector_enabled=False.
6. THOUGHT_UPDATED is emitted during _phase_update_all when thought_inspector_enabled=True.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from engine.broadcast_manager import BroadcastManager
from engine.context import AgentContext, ContextBundle
from engine.orchestrator import SessionOrchestrator
from llm.client import LLMClient
from llm.providers.base import BaseLLMProvider
from llm.types import LLMConfig, Message
from models.thought import Thought
from schemas.api import CreateSessionRequestSchema
from schemas.session import SessionConfigSchema
from services import session_service, thought_service


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


class RecordingBroadcastManager:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def broadcast(self, session_id: str, event: dict) -> None:
        self.events.append(event)


class SequentialProvider(BaseLLMProvider):
    """Returns pre-set responses in order; returns empty JSON decide by default."""

    def __init__(self, responses: list[str]) -> None:
        self._responses = responses
        self._index = 0

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        resp = self._responses[self._index % len(self._responses)]
        self._index += 1
        return resp


def _make_config(thought_inspector_enabled: bool = False, max_rounds: int = 1) -> SessionConfigSchema:
    return SessionConfigSchema(
        max_rounds=max_rounds,
        convergence_majority=0.66,
        priority_weights={"recency": 0.33, "novelty": 0.33, "role": 0.34},
        thought_inspector_enabled=thought_inspector_enabled,
    )


def _participant(name: str) -> dict:
    return {
        "display_name": name,
        "persona_description": "A thinker.",
        "expertise": "General reasoning",
        "llm_provider": "fake",
        "llm_model": "fake-model",
        "llm_config": None,
        "role": "participant",
    }


def _moderator() -> dict:
    return {
        "display_name": "Moderator",
        "persona_description": "Keeps things on track.",
        "expertise": "Facilitation",
        "llm_provider": "fake",
        "llm_model": "fake-model",
        "llm_config": None,
        "role": "moderator",
    }


def _scribe() -> dict:
    return {
        "display_name": "Scribe",
        "persona_description": "Takes notes.",
        "expertise": "Summarisation",
        "llm_provider": "fake",
        "llm_model": "fake-model",
        "llm_config": None,
        "role": "scribe",
    }


def _valid_request(thought_inspector_enabled: bool = False, max_rounds: int = 1) -> CreateSessionRequestSchema:
    return CreateSessionRequestSchema(
        topic="Is remote work better than office work?",
        supporting_context=None,
        config=_make_config(thought_inspector_enabled=thought_inspector_enabled, max_rounds=max_rounds),
        agents=[
            _participant("Alice"),
            _participant("Bob"),
            _moderator(),
            _scribe(),
        ],
    )


async def _seed_thoughts(
    db: AsyncSession,
    *,
    session_id: str,
    agent_id: str,
    contents: list[str],
) -> list[Thought]:
    """Save multiple thought versions for a single agent and return them."""
    saved: list[Thought] = []
    for content in contents:
        t = await thought_service.save_thought(
            db,
            session_id=session_id,
            agent_id=agent_id,
            content=content,
        )
        saved.append(t)
    return saved


# ---------------------------------------------------------------------------
# Task 1 — get_thoughts() with agent_id filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_thoughts_agent_id_returns_full_history(db: AsyncSession) -> None:
    """When agent_id is supplied, all versions for that agent are returned in order."""
    session = await session_service.create_session(db, _valid_request())
    participant = next(a for a in session.agents if a.role == "participant")

    await _seed_thoughts(
        db,
        session_id=session.id,
        agent_id=participant.id,
        contents=["first thought", "second thought", "third thought"],
    )

    from services import session_service as svc

    thoughts = await svc.get_thoughts(db, session.id, agent_id=participant.id)

    assert len(thoughts) == 3
    versions = [t.version for t in thoughts]
    assert versions == sorted(versions), "Thoughts must be ordered by version ASC"
    assert thoughts[0].content == "first thought"
    assert thoughts[2].content == "third thought"


@pytest.mark.asyncio
async def test_get_thoughts_agent_id_only_returns_that_agent(db: AsyncSession) -> None:
    """History for agent_id=X must not include thoughts from other agents."""
    session = await session_service.create_session(db, _valid_request())
    participants = [a for a in session.agents if a.role == "participant"]
    alice, bob = participants[0], participants[1]

    await _seed_thoughts(db, session_id=session.id, agent_id=alice.id, contents=["alice-v1"])
    await _seed_thoughts(db, session_id=session.id, agent_id=bob.id, contents=["bob-v1", "bob-v2"])

    from services import session_service as svc

    thoughts = await svc.get_thoughts(db, session.id, agent_id=alice.id)

    assert len(thoughts) == 1
    assert thoughts[0].agent_id == alice.id


@pytest.mark.asyncio
async def test_get_thoughts_no_filter_returns_latest_per_agent(db: AsyncSession) -> None:
    """Without filters the existing de-duplication logic (latest per agent) is preserved."""
    session = await session_service.create_session(db, _valid_request())
    participants = [a for a in session.agents if a.role == "participant"]
    alice, bob = participants[0], participants[1]

    await _seed_thoughts(db, session_id=session.id, agent_id=alice.id, contents=["a-v1", "a-v2"])
    await _seed_thoughts(db, session_id=session.id, agent_id=bob.id, contents=["b-v1"])

    from services import session_service as svc

    thoughts = await svc.get_thoughts(db, session.id)

    # One thought per agent
    agent_ids = [t.agent_id for t in thoughts]
    assert len(agent_ids) == len(set(agent_ids)), "Must return one entry per agent"

    alice_thought = next(t for t in thoughts if t.agent_id == alice.id)
    assert alice_thought.version == 2, "Should return the latest version"


@pytest.mark.asyncio
async def test_get_thoughts_version_filter_unchanged(db: AsyncSession) -> None:
    """The existing version= filter still returns all agents at that version."""
    session = await session_service.create_session(db, _valid_request())
    participants = [a for a in session.agents if a.role == "participant"]
    alice, bob = participants[0], participants[1]

    await _seed_thoughts(db, session_id=session.id, agent_id=alice.id, contents=["a-v1", "a-v2"])
    await _seed_thoughts(db, session_id=session.id, agent_id=bob.id, contents=["b-v1", "b-v2"])

    from services import session_service as svc

    thoughts_v1 = await svc.get_thoughts(db, session.id, version=1)
    assert len(thoughts_v1) == 2
    assert all(t.version == 1 for t in thoughts_v1)

    thoughts_v2 = await svc.get_thoughts(db, session.id, version=2)
    assert len(thoughts_v2) == 2
    assert all(t.version == 2 for t in thoughts_v2)


@pytest.mark.asyncio
async def test_get_thoughts_agent_id_empty_when_no_thoughts(db: AsyncSession) -> None:
    """When an agent has no thoughts, agent_id filter returns an empty list."""
    session = await session_service.create_session(db, _valid_request())
    participant = next(a for a in session.agents if a.role == "participant")

    from services import session_service as svc

    thoughts = await svc.get_thoughts(db, session.id, agent_id=participant.id)
    assert thoughts == []


# ---------------------------------------------------------------------------
# Task 2 — THOUGHT_UPDATED events during _phase_think
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_thought_inspector_emits_thought_updated_during_think(db: AsyncSession) -> None:
    """When thought_inspector_enabled=True, THOUGHT_UPDATED is emitted after each
    agent completes the think phase (one per participant)."""
    session = await session_service.create_session(
        db, _valid_request(thought_inspector_enabled=True)
    )

    # Provide enough responses for: think×2, argue×1, update×1, decide×1,
    # convergence-check×1, scribe×1.  The important check is the think phase.
    responses = [
        "alice-initial-thought",                                              # think Alice
        "bob-initial-thought",                                                # think Bob
        "alice-argument",                                                     # argue Alice
        "bob-update",                                                         # update Bob
        '{"request_token": false, "novelty_tier": "reinforcement", "justification": "done"}',  # decide Bob
        '{"status": "open", "novel_claims_this_round": 1, "justification": ""}',               # convergence
        "bob-argument",                                                       # argue Bob
        "alice-update",                                                       # update Alice
        '{"request_token": false, "novelty_tier": "reinforcement", "justification": "done"}',  # decide Alice
        '{"status": "open", "novel_claims_this_round": 1, "justification": ""}',               # convergence
        "summary content",                                                    # scribe
    ]
    provider = SequentialProvider(responses)
    llm_client = LLMClient(
        providers={"fake": provider},
        timeout_seconds=5.0,
        rate_limit_backoff_seconds=0.0,
    )
    broadcaster = RecordingBroadcastManager()
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=session_factory,
        broadcast_manager=broadcaster,
        llm_client=llm_client,
    )

    await orchestrator.run("Let's discuss remote work.")

    thought_updated_events = [
        e for e in broadcaster.events if e["type"] == "THOUGHT_UPDATED"
    ]

    # There should be at least 2 THOUGHT_UPDATED events (one per participant) from the think phase.
    think_related = [
        e for e in thought_updated_events if e["thought"]["version"] == 1
    ]
    assert len(think_related) >= 2, (
        f"Expected at least 2 THOUGHT_UPDATED with version=1 from think phase, "
        f"got {len(think_related)}"
    )

    # Each event must carry the expected keys.
    for event in think_related:
        thought_payload = event["thought"]
        assert "id" in thought_payload
        assert "agent_id" in thought_payload
        assert "version" in thought_payload
        assert "content" in thought_payload


@pytest.mark.asyncio
async def test_thought_inspector_disabled_no_thought_updated_during_think(db: AsyncSession) -> None:
    """When thought_inspector_enabled=False, THOUGHT_UPDATED must NOT be emitted
    during the think phase."""
    session = await session_service.create_session(
        db, _valid_request(thought_inspector_enabled=False)
    )

    responses = [
        "alice-initial-thought",
        "bob-initial-thought",
        "alice-argument",
        "bob-update",
        '{"request_token": false, "novelty_tier": "reinforcement", "justification": "done"}',
        '{"status": "open", "novel_claims_this_round": 1, "justification": ""}',
        "bob-argument",
        "alice-update",
        '{"request_token": false, "novelty_tier": "reinforcement", "justification": "done"}',
        '{"status": "open", "novel_claims_this_round": 1, "justification": ""}',
        "summary content",
    ]
    provider = SequentialProvider(responses)
    llm_client = LLMClient(
        providers={"fake": provider},
        timeout_seconds=5.0,
        rate_limit_backoff_seconds=0.0,
    )
    broadcaster = RecordingBroadcastManager()
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=session_factory,
        broadcast_manager=broadcaster,
        llm_client=llm_client,
    )

    await orchestrator.run("Let's discuss remote work.")

    # With inspector disabled, we expect NO THOUGHT_UPDATED events from the think phase.
    think_updated = [
        e for e in broadcaster.events
        if e["type"] == "THOUGHT_UPDATED" and e["thought"]["version"] == 1
    ]
    assert think_updated == [], (
        "No THOUGHT_UPDATED with version=1 should be emitted when inspector is disabled"
    )


@pytest.mark.asyncio
async def test_thought_inspector_update_phase_emits_thought_updated(db: AsyncSession) -> None:
    """When thought_inspector_enabled=True, THOUGHT_UPDATED is also emitted during
    _phase_update_all (version > 1 thoughts)."""
    session = await session_service.create_session(
        db, _valid_request(thought_inspector_enabled=True)
    )

    responses = [
        "alice-initial-thought",
        "bob-initial-thought",
        "alice-argument",
        "bob-update",
        '{"request_token": false, "novelty_tier": "reinforcement", "justification": "done"}',
        '{"status": "open", "novel_claims_this_round": 1, "justification": ""}',
        "bob-argument",
        "alice-update",
        '{"request_token": false, "novelty_tier": "reinforcement", "justification": "done"}',
        '{"status": "open", "novel_claims_this_round": 1, "justification": ""}',
        "summary content",
    ]
    provider = SequentialProvider(responses)
    llm_client = LLMClient(
        providers={"fake": provider},
        timeout_seconds=5.0,
        rate_limit_backoff_seconds=0.0,
    )
    broadcaster = RecordingBroadcastManager()
    session_factory = async_sessionmaker(
        bind=db.bind, class_=AsyncSession, expire_on_commit=False
    )
    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=session_factory,
        broadcast_manager=broadcaster,
        llm_client=llm_client,
    )

    await orchestrator.run("Let's discuss remote work.")

    thought_updated_events = [
        e for e in broadcaster.events if e["type"] == "THOUGHT_UPDATED"
    ]

    # There should be both version=1 (think phase) and version>1 (update phase) events.
    versions_seen = {e["thought"]["version"] for e in thought_updated_events}
    assert 1 in versions_seen, "Version 1 (think phase) THOUGHT_UPDATED events must be present"
    assert any(v > 1 for v in versions_seen), (
        "Version >1 (update phase) THOUGHT_UPDATED events must be present"
    )
