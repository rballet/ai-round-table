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


class OllamaProvider(BaseLLMProvider):
    """LLM provider for locally-running Ollama models.

    Ollama exposes an OpenAI-compatible REST API, so this provider reuses the
    ``openai`` SDK pointed at the Ollama base URL.  No API key is required.

    Set ``OLLAMA_BASE_URL`` in ``.env`` to override the default
    ``http://localhost:11434/v1``.
    """

    def __init__(self, client: Any | None = None, base_url: str | None = None):
        if client is not None:
            self._client = client
            return

        if AsyncOpenAI is None:
            self._client = None
            return

        self._client = AsyncOpenAI(
            base_url=base_url or settings.OLLAMA_BASE_URL,
            api_key="ollama",  # Ollama does not validate the key; any value works.
        )

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        if self._client is None:
            raise LLMProviderError("OpenAI SDK (required for Ollama) is not available.")

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
            raise LLMRateLimitError("Ollama rate limited the request.") from exc
        except Exception as exc:
            raise LLMProviderError("Ollama completion request failed.") from exc

        text = _extract_text(response)
        if text is None:
            raise LLMInvalidResponseError(
                "Ollama completion returned an empty response."
            )
        return text


def _extract_text(response: Any) -> str | None:
    choices = getattr(response, "choices", None)
    if not choices:
        return None
    message = getattr(choices[0], "message", None)
    if message is None:
        return None
    content = getattr(message, "content", None)
    if isinstance(content, str):
        normalized = content.strip()
        return normalized or None
    return None
