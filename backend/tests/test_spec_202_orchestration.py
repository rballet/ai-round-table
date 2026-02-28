from __future__ import annotations
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock
from engine.orchestrator import SessionOrchestrator
from engine.broadcast_manager import BroadcastManager
from schemas.api import CreateSessionRequestSchema
from schemas.session import SessionConfigSchema
from services import session_service
from models.session import Session

def _make_config(max_rounds=2) -> SessionConfigSchema:
    return SessionConfigSchema(
        max_rounds=max_rounds,
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

class MockSessionFactory:
    def __init__(self, db_session):
        self.db_session = db_session
    def __call__(self):
        return self
    async def __aenter__(self):
        return self.db_session
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
    def begin(self):
        class DummyBegin:
            async def __aenter__(self):
                return self
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
        return DummyBegin()
    async def commit(self):
        pass
    async def rollback(self):
        pass

@pytest.mark.asyncio
async def test_orchestrator_max_rounds_cap(db):
    # Setup session
    request = CreateSessionRequestSchema(
        topic="Is remote work better than office work?",
        supporting_context=None,
        config=_make_config(max_rounds=1),  # Stop after 1 round
        agents=[
            _participant("Alice"),
            _participant("Bob"),
            _moderator(),
            _scribe(),
        ],
    )
    session = await session_service.create_session(db, request)
    
    # The issue here is the mock_llm is just a MagicMock. LLMClient parses `providers` now.
    from llm.client import LLMClient
    from llm.providers.base import BaseLLMProvider
    from llm.types import Message, LLMConfig
    
    class CapMockProvider(BaseLLMProvider):
        def __init__(self):
            self.responses = [
                # Both agents think initially (round 0)
                "Alice's initial thought", 
                "Bob's initial thought",
                
                # Round 1 - Turn 0 (Alice)
                "Alice's argument", 
                "Bob's updated thought", # Bob evaluates Alice's point
                '{"request_token": false, "novelty_tier": "reinforcement", "justification": "I am done"}', # Bob decides
                
                # Round 1 - Turn 1 (Bob)
                "Bob's argument",        # Bob speaks next
                "Alice's updated thought", # Alice evaluates Bob's point
                '{"request_token": false, "novelty_tier": "reinforcement", "justification": "I am done"}', # Alice decides
                
                # Finally, the scribe phase cap happens after round 1 finishes
                "Summary content" # Scribe phase
            ]
            self.index = 0
            
        async def complete(self, model: str, messages: list[Message], config: LLMConfig | None = None) -> str:
            resp = self.responses[self.index]
            self.index += 1
            return resp
            
    test_provider = CapMockProvider()
    test_provider = CapMockProvider()
    llm_client = LLMClient(
        providers={"openai": test_provider},
        timeout_seconds=5.0,
        rate_limit_backoff_seconds=0.0,
    )
    
    broadcast_manager = BroadcastManager()

    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=MockSessionFactory(db),
        broadcast_manager=broadcast_manager,
        llm_client=llm_client
    )
    
    await orchestrator.run("Let's begin.")
    
    # Verify session and summary
    from models.summary import Summary
    from sqlalchemy import select
    result = await db.execute(select(Summary).where(Summary.session_id == session.id))
    summary = result.scalar_one_or_none()
    assert summary is not None
    assert summary.termination_reason == "cap"
    assert summary.content == "Summary content"

@pytest.mark.asyncio
async def test_orchestrator_pause_resume_end(db):
    # Setup session
    request = CreateSessionRequestSchema(
        topic="Test Pause/Resume",
        supporting_context=None,
        config=_make_config(max_rounds=10),
        agents=[
            _participant("Alice"),
            _participant("Bob"),
            _moderator(),
            _scribe(),
        ],
    )
    session = await session_service.create_session(db, request)
    
    mock_llm = MagicMock()
    mock_llm.complete = AsyncMock(return_value="Something")
    
    broadcast_manager = BroadcastManager()
    
    class MockSessionFactory:
        def __init__(self, db_session):
            self.db_session = db_session
        def __call__(self):
            return self
        async def __aenter__(self):
            return self.db_session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            # Do nothing to preserve the session for test asserts
            pass
            
    # Mock commit instead of actually committing the test fixture session
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    orchestrator = SessionOrchestrator(
        session_id=session.id,
        session_factory=MockSessionFactory(db),
        broadcast_manager=broadcast_manager,
        llm_client=mock_llm
    )
    
    orchestrator.pause()
    assert not orchestrator._pause_event.is_set()
    orchestrator.resume()
    assert orchestrator._pause_event.is_set()
    orchestrator.end()
    assert orchestrator._termination_flag == True
    assert orchestrator._termination_reason == "host"

@pytest.mark.asyncio
async def test_agent_runner_scribe(db):
    from engine.agent_runner import AgentRunner
    from engine.context import AgentContext, ContextBundle
    
    agent = AgentContext(id="scribe-1", display_name="Scribe", role="scribe", persona_description="", expertise="", llm_provider="openai", llm_model="gpt-4o", llm_config=None)
    context = ContextBundle(topic="Test", prompt="Test", supporting_context=None, agent=agent, current_thought=None, transcript=[], round_index=0, turn_index=0)
    
    mock_llm = MagicMock()
    mock_llm.complete = AsyncMock(return_value="Scribe summary content")
    
    runner = AgentRunner(
        session_id="session-1",
        db=db,
        llm_client=mock_llm,
        broadcast_manager=BroadcastManager()
    )
    
    summary = await runner.scribe(agent, context, "cap")
    assert summary.content == "Scribe summary content"
    assert summary.termination_reason == "cap"
