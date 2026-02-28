from __future__ import annotations

import asyncio
import json
import pytest

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from engine.orchestrator import SessionOrchestrator
from llm.client import LLMClient
from llm.providers import MockProvider
from models.agent import Agent
from models.session import Session
from schemas.api import CreateSessionRequestSchema
from schemas.session import SessionConfigSchema
from services import session_service

class RecordingBroadcastManager:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def broadcast(self, session_id: str, event: dict) -> None:
        self.events.append(event)


class MockConvergenceProvider(MockProvider):
    def __init__(self, responses: list[str]):
        super().__init__()
        self.responses = responses
        self.call_count = 0

    async def complete(self, model: str, messages: list[dict], config: dict | None = None) -> str:
        # We need to distinguish between think/argue/update/decide and moderator
        # Based on the system prompt we can try to guess
        system_prompt = next((m["content"] for m in messages if m["role"] == "system"), "")
        
        if "Moderator of an AI Round Table" in system_prompt:
            if self.call_count < len(self.responses):
                resp = self.responses[self.call_count]
                self.call_count += 1
                return resp
            return json.dumps({"status": "converging", "novel_claims_this_round": 0, "justification": "default"})
            
        if "decide whether you need to speak again" in system_prompt:
            return json.dumps({"request_token": True, "novelty_tier": "reinforcement", "justification": "test"})
            
        if "update your private thoughts" in system_prompt:
            return "updated thought"
            
        if "You are the Scribe" in system_prompt:
            return "Test summary"

        return "Test argument or thought"

@pytest.mark.asyncio
async def test_convergence_early_termination(db: AsyncSession):
    # Setup session with 2 participants
    request = CreateSessionRequestSchema(
        topic="Should we use tabs or spaces?",
        supporting_context=None,
        config=SessionConfigSchema(
            max_rounds=10,
            convergence_majority=1.0,
            priority_weights={},
            thought_inspector_enabled=False,
        ),
        agents=[
            {
                "display_name": "Tabs Fan",
                "persona_description": "Tabs only.",
                "expertise": "Coding",
                "llm_provider": "mock_convergence",
                "llm_model": "test",
                "role": "participant",
            },
            {
                "display_name": "Spaces Fan",
                "persona_description": "Spaces only.",
                "expertise": "Coding",
                "llm_provider": "mock_convergence",
                "llm_model": "test",
                "role": "participant",
            },
            {
                "display_name": "Moderator",
                "persona_description": "Moderator",
                "expertise": "Facilitation",
                "llm_provider": "mock_convergence",
                "llm_model": "test",
                "role": "moderator",
            },
            {
                "display_name": "Scribe",
                "persona_description": "Scribe",
                "expertise": "Typing",
                "llm_provider": "mock_convergence",
                "llm_model": "test",
                "role": "scribe",
            }
        ]
    )
    
    session = await session_service.create_session(db, request)
    db_session_factory = async_sessionmaker(bind=db.bind, class_=AsyncSession, expire_on_commit=False)
    broadcast_manager = RecordingBroadcastManager()

    # We expect termination when consecutive_converging_turns >= participant_count (2)
    # Turn 1: open
    # Turn 2: converging (consecutive=1)
    # Turn 3: converging (consecutive=2) -> should_terminate=True
    
    mock_responses = [
        json.dumps({"status": "open", "novel_claims_this_round": 2, "justification": "still arguing"}),
        json.dumps({"status": "converging", "novel_claims_this_round": 0, "justification": "agreeing"}),
        json.dumps({"status": "converging", "novel_claims_this_round": 0, "justification": "agreeing"}),
    ]
    
    provider = MockConvergenceProvider(mock_responses)
    llm_client = LLMClient(
        providers={"mock_convergence": provider, "mock": provider, "openai": provider},
        timeout_seconds=5.0,
        rate_limit_backoff_seconds=0.0
    )

    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=db_session_factory,
        broadcast_manager=broadcast_manager,
        llm_client=llm_client,
    )

    await orchestrator.run("Start the discussion")

    # Verify that the session actually ended early due to consensus
    events = broadcast_manager.events
    
    convergence_events = [e for e in events if e["type"] == "CONVERGENCE_CHECK"]
    
    print("\n--- EVENTS ---")
    for e in events:
        print(e["type"], getattr(e, "get", lambda x: e)("status", ""), getattr(e, "get", lambda x: e)("termination_reason", ""))
    print("--------------\n")
    
    assert len(convergence_events) == 3
    assert convergence_events[0]["status"] == "open"
    assert convergence_events[1]["status"] == "converging" 
    # The last one emits "capped" under the hood if it triggers termination
    assert convergence_events[2]["status"] == "capped"

    session_end_events = [e for e in events if e["type"] == "SESSION_END"]
    assert len(session_end_events) == 1
    assert session_end_events[0]["termination_reason"] == "consensus"
