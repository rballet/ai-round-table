from __future__ import annotations

from typing import Any

from core.config import settings
from llm.errors import (
    LLMInvalidResponseError,
    LLMProviderError,
    LLMRateLimitError,
)
from llm.providers.base import BaseLLMProvider
from llm.types import LLMConfig, Message

try:  # pragma: no cover - exercised indirectly when dependency is installed
    from anthropic import AsyncAnthropic
    from anthropic import RateLimitError as AnthropicRateLimitError
except ImportError:  # pragma: no cover - local fallback for missing dependency
    AsyncAnthropic = None

    class AnthropicRateLimitError(Exception):
        pass


class AnthropicProvider(BaseLLMProvider):
    def __init__(self, client: Any | None = None, api_key: str | None = None):
        if client is not None:
            self._client = client
            return

        if AsyncAnthropic is None:
            self._client = None
            return

        self._client = AsyncAnthropic(
            api_key=api_key or settings.ANTHROPIC_API_KEY
        )

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        if self._client is None:
            raise LLMProviderError("Anthropic SDK is not available.")

        system_prompt, anthropic_messages = _split_messages(messages)
        if not anthropic_messages:
            raise LLMProviderError(
                "Anthropic completion requires at least one user/assistant message."
            )

        payload: dict[str, Any] = {
            "model": model,
            "messages": anthropic_messages,
            "max_tokens": 1024,
        }
        if config:
            payload.update({k: v for k, v in config.items() if v is not None})
        if system_prompt:
            payload["system"] = system_prompt

        try:
            response = await self._client.messages.create(**payload)
        except AnthropicRateLimitError as exc:
            raise LLMRateLimitError("Anthropic rate limited the request.") from exc
        except Exception as exc:
            raise LLMProviderError(f"Anthropic completion request failed: {exc}") from exc

        text = _extract_anthropic_text(response)
        if text is None:
            raise LLMInvalidResponseError(
                "Anthropic completion returned an empty response."
            )
        return text


def _split_messages(messages: list[Message]) -> tuple[str | None, list[dict[str, str]]]:
    system_messages: list[str] = []
    conversation: list[dict[str, str]] = []

    for message in messages:
        role = message.get("role")
        content = message.get("content", "")
        if role == "system":
            system_messages.append(content)
            continue
        if role not in ("user", "assistant"):
            continue
        conversation.append({"role": role, "content": content})

    system_prompt = "\n\n".join(s for s in system_messages if s).strip()
    return system_prompt or None, conversation


def _extract_anthropic_text(response: Any) -> str | None:
    content_blocks = getattr(response, "content", None)
    if not content_blocks:
        return None

    texts: list[str] = []
    for block in content_blocks:
        block_type = getattr(block, "type", None)
        if block_type is None and isinstance(block, dict):
            block_type = block.get("type")
        if block_type != "text":
            continue

        text = getattr(block, "text", None)
        if text is None and isinstance(block, dict):
            text = block.get("text")
        if text:
            texts.append(str(text).strip())

    joined = "\n".join(t for t in texts if t).strip()
    return joined or None
