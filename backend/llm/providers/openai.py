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
    from openai import AsyncOpenAI
    from openai import RateLimitError as OpenAIRateLimitError
except ImportError:  # pragma: no cover - local fallback for missing dependency
    AsyncOpenAI = None

    class OpenAIRateLimitError(Exception):
        pass


class OpenAIProvider(BaseLLMProvider):
    def __init__(self, client: Any | None = None, api_key: str | None = None):
        if client is not None:
            self._client = client
            return

        if AsyncOpenAI is None:
            self._client = None
            return

        self._client = AsyncOpenAI(api_key=api_key or settings.OPENAI_API_KEY)

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        if self._client is None:
            raise LLMProviderError("OpenAI SDK is not available.")

        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": message["role"], "content": message["content"]}
                for message in messages
            ],
        }
        if config:
            payload.update({k: v for k, v in config.items() if v is not None})

        try:
            response = await self._client.chat.completions.create(**payload)
        except OpenAIRateLimitError as exc:
            raise LLMRateLimitError("OpenAI rate limited the request.") from exc
        except Exception as exc:
            raise LLMProviderError(f"OpenAI completion request failed: {exc}") from exc

        text = _extract_openai_text(response)
        if text is None:
            raise LLMInvalidResponseError(
                "OpenAI completion returned an empty response."
            )
        return text


def _extract_openai_text(response: Any) -> str | None:
    choices = getattr(response, "choices", None)
    if not choices:
        return None

    first_choice = choices[0]
    message = getattr(first_choice, "message", None)
    if message is None:
        return None

    content = getattr(message, "content", None)
    if isinstance(content, str):
        normalized = content.strip()
        return normalized or None

    if isinstance(content, list):
        text_parts: list[str] = []
        for part in content:
            part_type = getattr(part, "type", None)
            if part_type is None and isinstance(part, dict):
                part_type = part.get("type")
            if part_type != "text":
                continue

            text = getattr(part, "text", None)
            if text is None and isinstance(part, dict):
                text = part.get("text")
            if text:
                text_parts.append(str(text).strip())

        joined = "\n".join(t for t in text_parts if t).strip()
        return joined or None

    return None
