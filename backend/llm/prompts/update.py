from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from engine.context import ContextBundle
from llm.types import Message


def _get_value(item: Any, key: str, default: str = "") -> str:
    if isinstance(item, Mapping):
        value = item.get(key, default)
    else:
        value = getattr(item, key, default)
    return str(value)


def _format_latest_argument(transcript: list[Any]) -> str:
    if not transcript:
        return "No arguments have been posted yet."
    last = transcript[-1]
    agent_name = _get_value(
        last, "agent_name", _get_value(last, "agent_id", "Unknown")
    )
    content = _get_value(last, "content", "").strip()
    round_index = _get_value(last, "round_index", "?")
    turn_index = _get_value(last, "turn_index", "?")
    return (
        f"**{agent_name}** (Round {round_index}, Turn {turn_index}):\n{content}"
    )


def build_update_messages(context_bundle: ContextBundle) -> list[Message]:
    agent = context_bundle.agent
    persona_description = (
        agent.persona_description
        or "You reason rigorously and revise your views when new evidence demands it."
    )
    expertise = agent.expertise or "General reasoning"
    current_thought = (context_bundle.current_thought or "").strip()
    if not current_thought:
        current_thought = "No prior position recorded. Form one from your expertise."

    system_message = (
        f"You are {agent.display_name}. {persona_description}\n"
        f"Your area of expertise is: {expertise}\n\n"
        "You are participating in a structured round table discussion.\n"
        "Another participant has just made a public argument.\n"
        "Your task is to UPDATE your PRIVATE internal position in response.\n"
        "This is not a public statement — it is your honest revised thinking.\n"
        "Incorporate what is valid, push back on what is wrong, and refine where appropriate.\n"
        "Keep your revised position focused and concise (under 150 words)."
    )

    user_message = (
        f"Topic: {context_bundle.topic}\n"
        f"Human question: {context_bundle.prompt}\n\n"
        "Your current private position:\n"
        f"{current_thought}\n\n"
        "Most recent argument you just heard:\n"
        f"{_format_latest_argument(context_bundle.transcript)}\n\n"
        "Now write your UPDATED private position. "
        "You may agree, disagree, or synthesise — but be honest and specific. "
        "Do not address the other speaker directly; write for yourself."
    )

    return [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]
