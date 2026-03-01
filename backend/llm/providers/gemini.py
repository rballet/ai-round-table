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
    from google import genai
    from google.genai import types as genai_types
    from google.api_core.exceptions import ResourceExhausted as GeminiRateLimitError
except ImportError:  # pragma: no cover - local fallback for missing dependency
    genai = None
    genai_types = None

    class GeminiRateLimitError(Exception):
        pass


class GeminiProvider(BaseLLMProvider):
    def __init__(self, client: Any | None = None, api_key: str | None = None):
        if client is not None:
            self._client = client
            return

        if genai is None:
            self._client = None
            return

        self._client = genai.Client(
            api_key=api_key or settings.GOOGLE_API_KEY
        )

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        if self._client is None:
            raise LLMProviderError("Google Gemini SDK (google-genai) is not available.")

        system_instruction, contents = _split_messages(messages)

        if not contents:
            raise LLMProviderError(
                "Gemini completion requires at least one user message."
            )

        generate_config: dict[str, Any] = {"max_output_tokens": 1024}
        if system_instruction:
            generate_config["system_instruction"] = system_instruction
        if config:
            generate_config.update({k: v for k, v in config.items() if v is not None})

        # Use GenerateContentConfig when the SDK is available; fall back to a plain
        # dict so that tests injecting a fake client work without the SDK installed.
        config_arg = (
            genai_types.GenerateContentConfig(**generate_config)
            if genai_types is not None
            else generate_config
        )

        try:
            response = await self._client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=config_arg,
            )
        except GeminiRateLimitError as exc:
            raise LLMRateLimitError("Gemini rate limited the request.") from exc
        except Exception as exc:
            raise LLMProviderError("Gemini completion request failed.") from exc

        text = _extract_text(response)
        if text is None:
            raise LLMInvalidResponseError(
                "Gemini completion returned an empty response."
            )
        return text


def _split_messages(
    messages: list[Message],
) -> tuple[str | None, list[dict[str, Any]]]:
    """Split messages into a system instruction string and Gemini-format contents."""
    system_parts: list[str] = []
    contents: list[dict[str, Any]] = []

    for message in messages:
        role = message.get("role")
        content = message.get("content", "")
        if role == "system":
            system_parts.append(content)
            continue
        # Gemini uses 'user' and 'model' roles (not 'assistant')
        gemini_role = "model" if role == "assistant" else "user"
        contents.append({"role": gemini_role, "parts": [{"text": content}]})

    system_instruction = "\n\n".join(s for s in system_parts if s).strip()
    return system_instruction or None, contents


def _extract_text(response: Any) -> str | None:
    text = getattr(response, "text", None)
    if isinstance(text, str):
        normalized = text.strip()
        return normalized or None
    return None
