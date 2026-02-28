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

    return "\n\n".join(
        (
            f"**{_get_value(argument, 'agent_name', _get_value(argument, 'agent_id', 'Unknown'))}** "
            f"(Round {_get_value(argument, 'round_index', '?')}, "
            f"Turn {_get_value(argument, 'turn_index', '?')}):\n"
            f"{_get_value(argument, 'content', '').strip()}"
        )
        for argument in transcript
    )


def build_decide_messages(context_bundle: ContextBundle) -> list[Message]:
    agent = context_bundle.agent
    persona_description = (
        agent.persona_description
        or "You reason rigorously and only request to speak when it is warranted."
    )
    current_thought = (context_bundle.current_thought or "").strip() or "N/A"
    last_argument = "None"
    if context_bundle.transcript:
        last_argument = _get_value(context_bundle.transcript[-1], "content", "None")

    system_message = (
        f"You are {agent.display_name}. {persona_description}\n\n"
        "After hearing the last argument, decide whether you need to speak again.\n"
        "Only request the token if you have:\n"
        "(a) A material factual error to correct, OR\n"
        "(b) Genuinely new information not yet in the discussion.\n\n"
        "Do NOT request the token to repeat, rephrase, or lightly reinforce."
    )

    user_message = (
        f"Your updated position: {current_thought}\n"
        f"Last argument posted: {last_argument}\n"
        f"Full transcript:\n{_format_transcript(context_bundle.transcript)}\n\n"
        "Respond with ONLY a JSON object:\n"
        "{\n"
        '  "request_token": true | false,\n'
        '  "novelty_tier": "first_argument" | "correction" | '
        '"new_information" | "disagreement" | "synthesis" | "reinforcement",\n'
        '  "justification": "One sentence explaining why you need to speak."\n'
        "}\n\n"
        "Respond with ONLY valid JSON. No preamble, no explanation, no markdown fences."
    )

    return [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]
