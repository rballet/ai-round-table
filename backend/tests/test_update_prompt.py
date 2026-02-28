"""Unit tests for the update prompt builder (SPEC-201)."""
from __future__ import annotations

from engine.context import AgentContext, ContextBundle
from llm.prompts.update import build_update_messages


def _make_agent(name: str = "Alice") -> AgentContext:
    return AgentContext(
        id="agent-1",
        display_name=name,
        persona_description="A rigorous, independent thinker.",
        expertise="Distributed systems",
        llm_provider="fake",
        llm_model="fake-model",
        llm_config={},
        role="participant",
    )


def _make_bundle(
    agent: AgentContext,
    *,
    current_thought: str | None = "I lean toward monoliths for small teams.",
    transcript: list | None = None,
) -> ContextBundle:
    if transcript is None:
        transcript = [
            {
                "agent_name": "Bob",
                "round_index": 1,
                "turn_index": 1,
                "content": "Microservices reduce coupling and allow independent deploys.",
            }
        ]
    return ContextBundle(
        topic="Monolith vs microservices",
        prompt="Which gives better delivery speed over 18 months?",
        supporting_context=None,
        agent=agent,
        current_thought=current_thought,
        transcript=transcript,
        round_index=1,
        turn_index=1,
    )


def test_build_update_messages_returns_two_messages():
    agent = _make_agent()
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    assert len(messages) == 2


def test_build_update_messages_first_message_is_system():
    agent = _make_agent()
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    assert messages[0]["role"] == "system"


def test_build_update_messages_second_message_is_user():
    agent = _make_agent()
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    assert messages[1]["role"] == "user"


def test_build_update_messages_system_contains_agent_name():
    agent = _make_agent("Alice")
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    assert "Alice" in messages[0]["content"]


def test_build_update_messages_system_explains_private_update():
    agent = _make_agent()
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    system = messages[0]["content"]
    assert "PRIVATE" in system or "private" in system
    assert "UPDATE" in system or "update" in system or "Update" in system


def test_build_update_messages_user_contains_topic():
    agent = _make_agent()
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    assert "Monolith vs microservices" in messages[1]["content"]


def test_build_update_messages_user_contains_current_thought():
    agent = _make_agent()
    bundle = _make_bundle(agent, current_thought="I lean toward monoliths for small teams.")
    messages = build_update_messages(bundle)

    assert "I lean toward monoliths for small teams." in messages[1]["content"]


def test_build_update_messages_user_contains_last_argument():
    agent = _make_agent()
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    # The most recent transcript entry should appear in the user message.
    assert "Microservices reduce coupling" in messages[1]["content"]
    assert "Bob" in messages[1]["content"]


def test_build_update_messages_user_contains_human_question():
    agent = _make_agent()
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    assert "Which gives better delivery speed" in messages[1]["content"]


def test_build_update_messages_handles_empty_transcript():
    agent = _make_agent()
    bundle = _make_bundle(agent, transcript=[])
    messages = build_update_messages(bundle)

    # Should not raise; should indicate no arguments yet.
    assert len(messages) == 2
    assert "No arguments" in messages[1]["content"]


def test_build_update_messages_handles_missing_current_thought():
    agent = _make_agent()
    bundle = _make_bundle(agent, current_thought=None)
    messages = build_update_messages(bundle)

    # Should not raise; should include a fallback.
    assert len(messages) == 2
    user_msg = messages[1]["content"]
    # The fallback text or the field must still appear.
    assert "No prior position" in user_msg or "expertise" in messages[0]["content"]


def test_build_update_messages_uses_persona_description():
    agent = _make_agent()
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    assert "A rigorous, independent thinker." in messages[0]["content"]


def test_build_update_messages_uses_expertise():
    agent = _make_agent()
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    assert "Distributed systems" in messages[0]["content"]


def test_build_update_messages_system_uses_fallback_persona_when_none():
    agent = AgentContext(
        id="agent-2",
        display_name="Bob",
        persona_description=None,
        expertise=None,
        llm_provider="fake",
        llm_model="fake-model",
        llm_config={},
        role="participant",
    )
    bundle = _make_bundle(agent)
    messages = build_update_messages(bundle)

    # Should not raise; fallback persona and expertise should appear.
    assert "Bob" in messages[0]["content"]
    assert len(messages[0]["content"]) > 10


def test_build_update_messages_transcript_uses_object_attributes():
    """Transcript entries may be ORM objects with attributes (not just dicts)."""
    agent = _make_agent()

    class FakeArgument:
        agent_name = "Charlie"
        round_index = 2
        turn_index = 3
        content = "We need observability tooling before splitting services."

    bundle = ContextBundle(
        topic="Monolith vs microservices",
        prompt="Which is better?",
        supporting_context=None,
        agent=agent,
        current_thought="My current view is monolith-first.",
        transcript=[FakeArgument()],
        round_index=2,
        turn_index=3,
    )
    messages = build_update_messages(bundle)

    assert "Charlie" in messages[1]["content"]
    assert "observability tooling" in messages[1]["content"]
