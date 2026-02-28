from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class AgentContext:
    id: str
    display_name: str
    persona_description: str | None
    expertise: str | None
    llm_provider: str
    llm_model: str
    llm_config: dict[str, Any] | None
    role: str


@dataclass(frozen=True)
class ContextBundle:
    topic: str
    prompt: str
    supporting_context: str | None
    agent: AgentContext
    current_thought: str | None = None
    transcript: list[Any] = field(default_factory=list)
    round_index: int = 1
    turn_index: int = 0
