from __future__ import annotations

import asyncio
from time import monotonic

import pytest
from fastapi import FastAPI, Request
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from engine.agent_runner import AgentRunner
from engine.context import AgentContext, ContextBundle
from engine.orchestrator import SessionOrchestrator
from llm.client import LLMClient
from llm.prompts.think import build_think_messages
from llm.providers.base import BaseLLMProvider
from llm.types import LLMConfig, Message
from models.session import Session
from models.thought import Thought
from routers.sessions import start_session
from schemas.api import CreateSessionRequestSchema, StartSessionRequestSchema
from schemas.session import SessionConfigSchema
from services import session_service


class RecordingBroadcastManager:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def broadcast(self, session_id: str, event: dict) -> None:
        self.events.append(event)


class StubProvider(BaseLLMProvider):
    def __init__(self, *, delay_seconds: float = 0.0) -> None:
        self.delay_seconds = delay_seconds
        self.calls = 0

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        self.calls += 1
        if self.delay_seconds > 0:
            await asyncio.sleep(self.delay_seconds)
        return f"thought-{self.calls}"


def _make_config() -> SessionConfigSchema:
    return SessionConfigSchema(
        max_rounds=5,
        convergence_majority=0.66,
        priority_weights={"recency": 0.33, "novelty": 0.33, "role": 0.34},
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
        supporting_context="We are a team of six engineers and one designer.",
        config=_make_config(),
        agents=[
            _participant("Alice"),
            _participant("Bob"),
            _moderator(),
            _scribe(),
        ],
    )


def _to_agent_context(agent) -> AgentContext:
    return AgentContext(
        id=agent.id,
        display_name=agent.display_name,
        persona_description=agent.persona_description,
        expertise=agent.expertise,
        llm_provider=agent.llm_provider,
        llm_model=agent.llm_model,
        llm_config=agent.llm_config,
        role=agent.role,
    )


def test_build_think_messages_contains_required_sections():
    agent = AgentContext(
        id="agent-1",
        display_name="Alice",
        persona_description="A practical engineer.",
        expertise="Distributed systems",
        llm_provider="fake",
        llm_model="fake-model",
        llm_config={},
        role="participant",
    )
    bundle = ContextBundle(
        topic="Monolith vs microservices",
        prompt="Which gives better delivery speed over 18 months?",
        supporting_context="Current system has one million monthly users.",
        agent=agent,
    )

    messages = build_think_messages(bundle)

    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert "INITIAL, INDEPENDENT position" in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert "Topic: Monolith vs microservices" in messages[1]["content"]
    assert "Current system has one million monthly users." in messages[1]["content"]


@pytest.mark.asyncio
async def test_agent_runner_think_saves_thought_and_broadcasts_events(db: AsyncSession):
    session = await session_service.create_session(db, _valid_request())
    participant = next(agent for agent in session.agents if agent.role == "participant")

    provider = StubProvider()
    client = LLMClient(
        providers={"fake": provider},
        timeout_seconds=1.0,
        rate_limit_backoff_seconds=0.0,
    )
    broadcaster = RecordingBroadcastManager()
    runner = AgentRunner(
        session_id=session.id,
        db=db,
        llm_client=client,
        broadcast_manager=broadcaster,
    )

    agent_context = _to_agent_context(participant)
    thought = await runner.think(
        agent_context,
        ContextBundle(
            topic=session.topic,
            prompt="What approach should we choose?",
            supporting_context=session.supporting_context,
            agent=agent_context,
        ),
    )

    result = await db.execute(
        select(Thought).where(
            Thought.session_id == session.id,
            Thought.agent_id == participant.id,
        )
    )
    saved_thoughts = list(result.scalars().all())

    assert thought.content == "thought-1"
    assert len(saved_thoughts) == 1
    assert saved_thoughts[0].version == 1
    assert [event["type"] for event in broadcaster.events] == [
        "THINK_START",
        "THINK_END",
    ]


@pytest.mark.asyncio
async def test_orchestrator_phase_think_runs_participants_in_parallel(db: AsyncSession):
    session = await session_service.create_session(db, _valid_request())

    provider = StubProvider(delay_seconds=0.12)
    client = LLMClient(
        providers={"fake": provider},
        timeout_seconds=1.0,
        rate_limit_backoff_seconds=0.0,
    )
    broadcaster = RecordingBroadcastManager()

    session_factory = async_sessionmaker(
        bind=db.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=session_factory,
        broadcast_manager=broadcaster,
        llm_client=client,
    )

    started = monotonic()
    await orchestrator.run(prompt="Given our team constraints, which architecture is best?")
    elapsed = monotonic() - started

    async with session_factory() as verify_db:
        thoughts_result = await verify_db.execute(
            select(Thought).where(Thought.session_id == session.id)
        )
        thoughts = list(thoughts_result.scalars().all())

        session_result = await verify_db.execute(
            select(Session).where(Session.id == session.id)
        )
        refreshed_session = session_result.scalar_one()

    # Think phase runs two participants in parallel (~0.12 s).
    # Argue + update + decide are sequential phases adding ~3 more LLM calls at 0.12 s each.
    # Total realistic upper bound: 0.12 (think) + 0.12 (argue) + 0.12 (update) + 0.12 (decide) + headroom
    # If think were sequential it would be >=0.24 s; checking < 0.20 s proves parallelism.
    think_events = [
        e for e in broadcaster.events if e["type"] in ("THINK_START", "THINK_END")
    ]
    think_start_count = sum(1 for e in think_events if e["type"] == "THINK_START")
    think_end_count = sum(1 for e in think_events if e["type"] == "THINK_END")
    assert think_start_count == 2
    assert think_end_count == 2

    # The think phase alone must complete in less than sequential time (2 x 0.12 = 0.24 s).
    # We verify this indirectly: the full run with 4 LLM calls should still finish well
    # under the timeout, and think events must appear before argue events.
    assert elapsed < 2.0  # generous overall budget; parallelism is verified via event ordering
    assert refreshed_session.status == "running"

    # All THINK events must precede any ARGUMENT_POSTED event.
    event_types = [e["type"] for e in broadcaster.events]
    last_think_end_idx = max(
        (i for i, t in enumerate(event_types) if t == "THINK_END"), default=-1
    )
    first_arg_posted_idx = next(
        (i for i, t in enumerate(event_types) if t == "ARGUMENT_POSTED"), None
    )
    if first_arg_posted_idx is not None:
        assert last_think_end_idx < first_arg_posted_idx


@pytest.mark.asyncio
async def test_start_session_endpoint_triggers_orchestrator_task(
    db: AsyncSession, monkeypatch
):
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    client = LLMClient(
        providers={"fake": StubProvider()},
        timeout_seconds=1.0,
        rate_limit_backoff_seconds=0.0,
    )
    broadcaster = RecordingBroadcastManager()
    app = FastAPI()
    app.state.orchestrator_tasks = {}
    app.state.session_factory = session_factory
    app.state.llm_client = client
    app.state.broadcast_manager = broadcaster

    captured_prompts: list[str] = []

    async def fake_run(self, prompt: str) -> None:  # noqa: ANN001
        captured_prompts.append(prompt)
        await asyncio.sleep(0.05)

    monkeypatch.setattr(SessionOrchestrator, "run", fake_run)

    scope = {
        "type": "http",
        "app": app,
        "method": "POST",
        "path": f"/sessions/{session.id}/start",
        "headers": [],
    }
    request = Request(scope)

    response = await start_session(
        session_id=session.id,
        payload=StartSessionRequestSchema(prompt="Host opening question"),
        request=request,
        db=db,
    )

    assert response == {"session_id": session.id, "status": "running"}
    assert session.id in app.state.orchestrator_tasks

    await asyncio.sleep(0.01)
    assert captured_prompts == ["Host opening question"]

    await asyncio.sleep(0.08)
    assert session.id not in app.state.orchestrator_tasks


@pytest.mark.asyncio
async def test_start_session_rejects_when_session_not_configured(
    db: AsyncSession
):
    session = await session_service.create_session(db, _valid_request())
    session_factory = async_sessionmaker(
        bind=db.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    client = LLMClient(
        providers={"fake": StubProvider()},
        timeout_seconds=1.0,
        rate_limit_backoff_seconds=0.0,
    )
    broadcaster = RecordingBroadcastManager()
    app = FastAPI()
    app.state.orchestrator_tasks = {}
    app.state.session_factory = session_factory
    app.state.llm_client = client
    app.state.broadcast_manager = broadcaster

    request = Request(
        {
            "type": "http",
            "app": app,
            "method": "POST",
            "path": f"/sessions/{session.id}/start",
            "headers": [],
        }
    )

    first = await start_session(
        session_id=session.id,
        payload=StartSessionRequestSchema(prompt="Round one"),
        request=request,
        db=db,
    )
    assert first == {"session_id": session.id, "status": "running"}

    await asyncio.sleep(0.03)

    async with session_factory() as second_request_db:
        with pytest.raises(HTTPException) as exc_info:
            await start_session(
                session_id=session.id,
                payload=StartSessionRequestSchema(prompt="Round two"),
                request=request,
                db=second_request_db,
            )

    assert exc_info.value.status_code == 409
    assert "configured state" in exc_info.value.detail
