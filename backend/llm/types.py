from __future__ import annotations

from typing import Any, Literal, TypedDict


class Message(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: str


LLMConfig = dict[str, Any]
