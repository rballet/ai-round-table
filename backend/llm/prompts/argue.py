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


def _format_transcript(transcript: list[Any]) -> str:
    if not transcript:
        return "No public arguments yet."

    chunks: list[str] = []
    for argument in transcript:
        agent_name = _get_value(
            argument, "agent_name", _get_value(argument, "agent_id", "Unknown")
        )
        round_index = _get_value(argument, "round_index", "?")
        turn_index = _get_value(argument, "turn_index", "?")
        content = _get_value(argument, "content", "").strip()
        chunks.append(
            f"**{agent_name}** (Round {round_index}, Turn {turn_index}):\n{content}"
        )
    return "\n\n".join(chunks)


def build_argue_messages(context_bundle: ContextBundle) -> list[Message]:
    agent = context_bundle.agent
    persona_description = (
        agent.persona_description
        or "You communicate clearly and defend your reasoning with evidence."
    )
    current_thought = (context_bundle.current_thought or "").strip()
    if not current_thought:
        current_thought = "No current thought is available. Argue from your expertise."

    system_message = (
        f"You are {agent.display_name}. {persona_description}\n\n"
        "You have been given the token to speak. Argue from your current position.\n"
        "Be direct, specific, and concise. Do not repeat what others have already said.\n"
        "Maximum 200 words."
    )

    user_message = (
        f"Topic: {context_bundle.topic}\n"
        f"Human question: {context_bundle.prompt}\n\n"
        "Your current private position (use this as your basis):\n"
        f"{current_thought}\n\n"
        "Discussion so far:\n"
        f"{_format_transcript(context_bundle.transcript)}\n\n"
        "Now give your argument."
    )

    return [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]
