from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from engine.context import AgentContext, ContextBundle
from engine.moderator import ModeratorEngine, ModeratorState, QueueCandidate
from engine.orchestrator import SessionOrchestrator
from llm.client import LLMClient
from llm.prompts.argue import build_argue_messages
from llm.prompts.decide import build_decide_messages
from llm.providers.base import BaseLLMProvider
from llm.types import LLMConfig, Message
from models.argument import Argument
from models.queue_entry import QueueEntry
from models.session import Session
from models.thought import Thought
from schemas.api import CreateSessionRequestSchema
from schemas.session import SessionConfigSchema
from services import session_service


class RecordingBroadcastManager:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def broadcast(self, session_id: str, event: dict) -> None:
        self.events.append(event)


class Spec104Provider(BaseLLMProvider):
    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        system_message = messages[0]["content"]
        if "INITIAL, INDEPENDENT position" in system_message:
            return "Initial private position for this participant."
        if "given the token to speak" in system_message:
            return "A single, public argument from the selected speaker."
        if "decide whether you need to speak again" in system_message:
            return (
                '{"request_token": false, "novelty_tier": "reinforcement", '
                '"justification": "I have nothing new."}'
            )
        if "evaluate if the discussion is converging" in system_message:
            return '{"status": "converging", "novel_claims_this_round": 0, "justification": "Done."}'
        return "fallback completion"


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
        supporting_context="We are a team of six engineers and one designer.",
        config=_make_config(),
        agents=[
            _participant("Alice"),
            _participant("Bob"),
            _moderator(),
            _scribe(),
        ],
    )


def test_build_argue_messages_includes_position_and_transcript():
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
        supporting_context=None,
        agent=agent,
        current_thought="I currently lean monolith for team velocity.",
        transcript=[
            {
                "agent_name": "Bob",
                "round_index": 1,
                "turn_index": 1,
                "content": "Microservices are better for scaling teams.",
            }
        ],
        round_index=1,
        turn_index=2,
    )

    messages = build_argue_messages(bundle)

    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert "Maximum 200 words." in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert "I currently lean monolith for team velocity." in messages[1]["content"]
    assert "Bob" in messages[1]["content"]
    assert "Now give your argument." in messages[1]["content"]


def test_build_decide_messages_enforces_json_output_contract():
    agent = AgentContext(
        id="agent-2",
        display_name="Bob",
        persona_description="A skeptical architect.",
        expertise="Systems design",
        llm_provider="fake",
        llm_model="fake-model",
        llm_config={},
        role="participant",
    )
    bundle = ContextBundle(
        topic="Monolith vs microservices",
        prompt="Which gives better delivery speed over 18 months?",
        supporting_context=None,
        agent=agent,
        current_thought="I should only speak again if I can add new data.",
        transcript=[
            type(
                "TranscriptEntry",
                (),
                {
                    "agent_name": "Alice",
                    "round_index": 1,
                    "turn_index": 1,
                    "content": "Monolith improves operational simplicity early.",
                },
            )()
        ],
        round_index=1,
        turn_index=2,
    )

    messages = build_decide_messages(bundle)

    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert "Only request the token" in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert '"request_token": true | false' in messages[1]["content"]
    assert "Respond with ONLY valid JSON." in messages[1]["content"]
    assert "Last argument posted: Monolith improves operational simplicity early." in messages[1]["content"]


def test_compute_priority_score_uses_recency_novelty_and_role_weights():
    moderator = ModeratorEngine(
        priority_weights={"recency": 0.4, "novelty": 0.5, "role": 0.1}
    )
    state = ModeratorState(total_turns_elapsed=10, last_turn_by_agent={"agt-1": 5})
    entry = QueueCandidate(
        agent_id="agt-1",
        novelty_tier="new_information",
        role="participant",
    )

    score = moderator.compute_priority_score(entry, state)

    # recency=0.5, novelty=0.7, role=1.0 => 0.4*0.5 + 0.5*0.7 + 0.1*1.0 = 0.65
    assert score == pytest.approx(0.65)


@pytest.mark.asyncio
async def test_orchestrator_runs_think_then_single_argue_turn_with_queue_audit(
    db: AsyncSession,
):
    session = await session_service.create_session(db, _valid_request())

    provider = Spec104Provider()
    llm_client = LLMClient(
        providers={"fake": provider, "openai": provider},
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
        llm_client=llm_client,
    )

    await orchestrator.run(prompt="Given our team constraints, which architecture is best?")

    async with session_factory() as verify_db:
        thoughts_result = await verify_db.execute(
            select(Thought).where(Thought.session_id == session.id)
        )
        thoughts = list(thoughts_result.scalars().all())

        arguments_result = await verify_db.execute(
            select(Argument).where(Argument.session_id == session.id)
        )
        arguments = list(arguments_result.scalars().all())

        queue_result = await verify_db.execute(
            select(QueueEntry).where(QueueEntry.session_id == session.id)
        )
        queue_entries = list(queue_result.scalars().all())

        session_result = await verify_db.execute(
            select(Session).where(Session.id == session.id)
        )
        refreshed_session = session_result.scalar_one()

    # After think (2 thoughts) + 2 update phases (2 new thoughts for non-speakers): total = 4.
    assert len(thoughts) == 4
    assert len(arguments) == 2
    assert arguments[0].round_index == 1
    assert arguments[0].turn_index == 1
    # Initial queue: 2 entries. Decide phase may add more if agent requests token.
    assert len(queue_entries) >= 2
    assert sum(1 for entry in queue_entries if entry.processed_at is not None) == 2
    assert refreshed_session.status == "ended"

    event_types = [event["type"] for event in broadcaster.events]
    assert event_types.count("SESSION_START") == 1
    assert event_types.count("THINK_START") == 2
    assert event_types.count("THINK_END") == 2
    # QUEUE_UPDATED: once after init_queue, once after argue, once after decide_all = >= 3
    assert event_types.count("QUEUE_UPDATED") >= 2
    assert event_types.count("TOKEN_GRANTED") == 2
    assert event_types.count("ARGUMENT_POSTED") == 2
    # Update phase events for the non-speaking participant.
    assert event_types.count("UPDATE_START") == 2
    assert event_types.count("UPDATE_END") == 2

    first_queue_event = next(
        event for event in broadcaster.events if event["type"] == "QUEUE_UPDATED"
    )
    assert len(first_queue_event["queue"]) == 2

    token_event = next(
        event for event in broadcaster.events if event["type"] == "TOKEN_GRANTED"
    )
    argument_event = next(
        event for event in broadcaster.events if event["type"] == "ARGUMENT_POSTED"
    )
    assert token_event["agent_id"] == argument_event["argument"]["agent_id"]
    assert (
        argument_event["argument"]["content"]
        == "A single, public argument from the selected speaker."
    )
