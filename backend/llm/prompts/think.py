from __future__ import annotations

from engine.context import ContextBundle
from llm.types import Message


def build_think_messages(context_bundle: ContextBundle) -> list[Message]:
    agent = context_bundle.agent
    persona_description = (
        agent.persona_description
        or "You reason from first principles and articulate tradeoffs."
    )
    expertise = agent.expertise or "General reasoning"

    supporting_context_block = ""
    if context_bundle.supporting_context:
        supporting_context_block = (
            f"\n<supporting_context>\n{context_bundle.supporting_context.strip()}\n</supporting_context>\n"
        )

    system_message = (
        f"You are {agent.display_name}. {persona_description}\n"
        f"Your area of expertise is: {expertise}\n\n"
        "You are participating in a structured round table discussion.\n"
        "Your task is to form your INITIAL, INDEPENDENT position on the topic.\n"
        "You have NOT yet heard what other participants think.\n"
        "Do not be influenced by others - reason purely from your expertise."
    )

    user_message = (
        f"Topic: {context_bundle.topic}\n"
        f"Human question: {context_bundle.prompt}\n"
        f"{supporting_context_block}\n"
        "Provide your initial thought: your position, the 2-3 strongest "
        "arguments supporting it, and the counterarguments you anticipate.\n"
        "Format: structured paragraphs, no bullet points."
    )

    return [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]
