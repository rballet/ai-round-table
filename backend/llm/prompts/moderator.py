from __future__ import annotations

import json

from collections.abc import Mapping
from typing import Any

from llm.types import Message


def _get_value(item: Any, key: str, default: Any = "") -> Any:
    if isinstance(item, Mapping):
        value = item.get(key, default)
    else:
        value = getattr(item, key, default)
    return value


def build_moderator_prompt(
    *,
    topic: str,
    supporting_context: str | None,
    transcript: list[Any],
) -> list[Message]:
    """
    Builds the prompt for the Moderator agent to evaluate discussion convergence.
    """
    system_prompt = (
        "You are the Moderator of an AI Round Table discussion.\n"
        "Your role is to evaluate whether the discussion is converging toward a consensus or if it remains open with new claims still being introduced.\n\n"
        "You MUST respond ONLY with a valid JSON object matching this schema exactly. Do not include markdown formatting like ```json:\n"
        "{\n"
        '  "status": "converging" | "open",\n'
        '  "novel_claims_this_round": 0 | 1 | 2 | ...,\n'
        '  "justification": "<brief explanation of your evaluation>"\n'
        "}\n\n"
        "Evaluation rules:\n"
        "- If the recent arguments are mostly reinforcing existing points or agreeing, the status is 'converging'.\n"
        "- If new arguments, perspectives, or significant disagreements are still being introduced, the status is 'open'.\n"
        "- 'novel_claims_this_round' should estimate how many distinctly new claims or viewpoints were introduced in the most recent round of arguments (typically the last N arguments where N is the number of participants). If the discussion is just rehashing, this should be 0.\n"
    )

    user_content = [
        f"Topic: {topic}\n",
    ]
    if supporting_context:
        user_content.append(f"Supporting Context:\n{supporting_context}\n")

    user_content.append("\nRecent Transcript (Focus on the latest arguments):\n")
    
    # We only really need the recent transcript to evaluate convergence, 
    # but providing the full transcript is fine if we want full context.
    # To save tokens, we could limit to the last ~10-20 turns.
    for entry in transcript:
        # entry can be a dictionary or an ORM/Pydantic model
        agent_name = str(_get_value(entry, "agent_name", "Unknown"))
        role = str(_get_value(entry, "role", "Participant"))
        content = str(_get_value(entry, "content", ""))
        turn = str(_get_value(entry, "turn_index", "?"))
        user_content.append(f"[Turn {turn}] {agent_name} ({role}): {content}\n")

    user_content.append(
        "\nBased on the above transcript, evaluate the convergence of the discussion and output the JSON."
    )

    messages: list[Message] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "".join(user_content)},
    ]
    return messages
