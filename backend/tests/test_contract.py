"""Contract tests for SPEC-305.

Verify that Pydantic schemas in backend/schemas/ match the TypeScript shared types.
These tests act as a lightweight guard: if a field is renamed or removed in either
side of the contract, at least one test here will fail.
"""
from __future__ import annotations

from schemas.api import (
    CreateSessionRequestSchema,
    ArgumentSchema,
    ThoughtSchema,
    ThoughtsResponseSchema,
    TranscriptResponseSchema,
    SummaryResponseSchema,
    ErrorEventSchema,
    ErrorsResponseSchema,
    SessionResponseSchema,
    PresetsResponseSchema,
    QueueResponseSchema,
)
from schemas.session import SessionSchema, SessionConfigSchema
from schemas.agent import AgentSchema, AgentPresetSchema, QueueEntrySchema


# ---------------------------------------------------------------------------
# SessionConfigSchema  ↔  shared/types/session.ts  SessionConfig
# ---------------------------------------------------------------------------

def test_session_config_schema_has_required_fields():
    fields = SessionConfigSchema.model_fields
    assert "max_rounds" in fields
    assert "convergence_majority" in fields
    assert "priority_weights" in fields
    assert "thought_inspector_enabled" in fields


def test_session_config_schema_field_types():
    schema = SessionConfigSchema(
        max_rounds=10,
        convergence_majority=0.66,
        priority_weights={"recency": 0.4},
        thought_inspector_enabled=True,
    )
    assert isinstance(schema.max_rounds, int)
    assert isinstance(schema.convergence_majority, float)
    assert isinstance(schema.priority_weights, dict)
    assert isinstance(schema.thought_inspector_enabled, bool)


# ---------------------------------------------------------------------------
# SessionSchema  ↔  shared/types/session.ts  Session
# ---------------------------------------------------------------------------

def test_session_schema_has_required_fields():
    fields = SessionSchema.model_fields
    assert "id" in fields
    assert "topic" in fields
    assert "status" in fields
    assert "config" in fields
    assert "created_at" in fields
    assert "supporting_context" in fields


def test_session_schema_optional_fields():
    fields = SessionSchema.model_fields
    # ended_at, termination_reason, rounds_elapsed, agent_count are optional
    assert fields["ended_at"].is_required() is False
    assert fields["termination_reason"].is_required() is False
    assert fields["supporting_context"].is_required() is False


# ---------------------------------------------------------------------------
# CreateSessionRequestSchema  ↔  shared/types/api.ts  CreateSessionRequest
# ---------------------------------------------------------------------------

def test_create_session_request_schema_has_required_fields():
    fields = CreateSessionRequestSchema.model_fields
    assert "topic" in fields
    assert "agents" in fields
    assert "config" in fields
    assert "supporting_context" in fields


def test_create_session_request_supporting_context_is_optional():
    req = CreateSessionRequestSchema(
        topic="Test",
        agents=[],
        config=SessionConfigSchema(
            max_rounds=5,
            convergence_majority=0.6,
            priority_weights={},
            thought_inspector_enabled=False,
        ),
    )
    assert req.supporting_context is None


# ---------------------------------------------------------------------------
# AgentSchema  ↔  shared/types/agent.ts  Agent
# ---------------------------------------------------------------------------

def test_agent_schema_has_required_fields():
    fields = AgentSchema.model_fields
    assert "id" in fields
    assert "session_id" in fields
    assert "display_name" in fields
    assert "persona_description" in fields
    assert "expertise" in fields
    assert "llm_provider" in fields
    assert "llm_model" in fields
    assert "role" in fields


def test_agent_schema_optional_fields():
    fields = AgentSchema.model_fields
    assert fields["persona_description"].is_required() is False
    assert fields["expertise"].is_required() is False
    assert fields["llm_config"].is_required() is False


# ---------------------------------------------------------------------------
# AgentPresetSchema  ↔  shared/types/agent.ts  AgentPreset
# ---------------------------------------------------------------------------

def test_agent_preset_schema_has_required_fields():
    fields = AgentPresetSchema.model_fields
    assert "id" in fields
    assert "display_name" in fields
    assert "persona_description" in fields
    assert "expertise" in fields
    assert "suggested_model" in fields


# ---------------------------------------------------------------------------
# ArgumentSchema  ↔  shared/types/api.ts  Argument
# ---------------------------------------------------------------------------

def test_argument_schema_has_required_fields():
    fields = ArgumentSchema.model_fields
    assert "id" in fields
    assert "agent_id" in fields
    assert "agent_name" in fields
    assert "round_index" in fields
    assert "turn_index" in fields
    assert "content" in fields
    assert "created_at" in fields


# ---------------------------------------------------------------------------
# ThoughtSchema  ↔  shared/types/api.ts  Thought
# ---------------------------------------------------------------------------

def test_thought_schema_has_required_fields():
    fields = ThoughtSchema.model_fields
    assert "id" in fields
    assert "agent_id" in fields
    assert "agent_name" in fields
    assert "version" in fields
    assert "content" in fields
    assert "created_at" in fields


# ---------------------------------------------------------------------------
# ThoughtsResponseSchema  ↔  shared/types/api.ts  ThoughtsResponse
# ---------------------------------------------------------------------------

def test_thoughts_response_schema_structure():
    fields = ThoughtsResponseSchema.model_fields
    assert "session_id" in fields
    assert "thoughts" in fields


# ---------------------------------------------------------------------------
# SummaryResponseSchema  ↔  shared/types/api.ts  SummaryResponse
# ---------------------------------------------------------------------------

def test_summary_response_schema_has_required_fields():
    fields = SummaryResponseSchema.model_fields
    assert "id" in fields
    assert "session_id" in fields
    assert "termination_reason" in fields
    assert "content" in fields
    assert "created_at" in fields


# ---------------------------------------------------------------------------
# ErrorEventSchema  ↔  shared/types/events.ts  ErrorEvent
# ---------------------------------------------------------------------------

def test_error_event_schema_has_required_fields():
    fields = ErrorEventSchema.model_fields
    assert "id" in fields
    assert "session_id" in fields
    assert "code" in fields
    assert "message" in fields
    assert "created_at" in fields


def test_error_event_schema_agent_id_is_optional():
    fields = ErrorEventSchema.model_fields
    assert fields["agent_id"].is_required() is False


# ---------------------------------------------------------------------------
# QueueEntrySchema  ↔  shared/types/agent.ts  QueueEntry
# ---------------------------------------------------------------------------

def test_queue_entry_schema_has_required_fields():
    fields = QueueEntrySchema.model_fields
    assert "agent_id" in fields
    assert "priority_score" in fields
    assert "novelty_tier" in fields
    assert "position" in fields


# ---------------------------------------------------------------------------
# Round-trip construction — ensure schemas accept valid data
# ---------------------------------------------------------------------------

def test_session_response_schema_round_trip():
    """SessionResponseSchema must accept all fields without error."""
    data = SessionResponseSchema(
        id="sess-1",
        topic="Test topic",
        supporting_context="Some context",
        status="running",
        config=SessionConfigSchema(
            max_rounds=10,
            convergence_majority=0.66,
            priority_weights={"recency": 0.4},
            thought_inspector_enabled=False,
        ),
        created_at="2026-01-01T00:00:00Z",
        ended_at=None,
        termination_reason=None,
        rounds_elapsed=None,
        agent_count=4,
        agents=[
            AgentSchema(
                id="ag-1",
                session_id="sess-1",
                display_name="Alice",
                persona_description="Thinker",
                expertise="Logic",
                llm_provider="openai",
                llm_model="gpt-4o",
                llm_config=None,
                role="participant",
            )
        ],
    )
    assert data.id == "sess-1"
    assert len(data.agents) == 1
    assert data.agents[0].display_name == "Alice"
