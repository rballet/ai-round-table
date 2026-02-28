from __future__ import annotations

from abc import ABC, abstractmethod

from llm.types import LLMConfig, Message


class BaseLLMProvider(ABC):
    @abstractmethod
    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        """Return a plain-text completion for the provided message list."""
