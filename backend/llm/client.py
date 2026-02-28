from __future__ import annotations

import asyncio
from typing import Mapping

from llm.errors import LLMProviderNotFoundError, LLMRateLimitError, LLMTimeoutError
from llm.providers import AnthropicProvider, BaseLLMProvider, MockProvider, OpenAIProvider
from llm.types import LLMConfig, Message


class LLMClient:
    def __init__(
        self,
        providers: Mapping[str, BaseLLMProvider] | None = None,
        timeout_seconds: float = 30.0,
        rate_limit_backoff_seconds: float = 1.0,
    ):
        if providers is None:
            providers = {
                "openai": OpenAIProvider(),
                "anthropic": AnthropicProvider(),
                "mock": MockProvider(),
            }

        self._providers: dict[str, BaseLLMProvider] = {
            key.lower(): provider for key, provider in providers.items()
        }
        self._timeout_seconds = timeout_seconds
        self._rate_limit_backoff_seconds = rate_limit_backoff_seconds

    def register_provider(self, name: str, provider: BaseLLMProvider) -> None:
        self._providers[name.lower()] = provider

    async def complete(
        self,
        provider: str,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        provider_impl = self._providers.get(provider.lower())
        if provider_impl is None:
            raise LLMProviderNotFoundError(
                f"LLM provider '{provider}' is not registered."
            )

        for attempt in range(2):
            try:
                return await asyncio.wait_for(
                    provider_impl.complete(model, messages, config or {}),
                    timeout=self._timeout_seconds,
                )
            except asyncio.TimeoutError as exc:
                raise LLMTimeoutError(
                    f"LLM request timed out after {self._timeout_seconds} seconds."
                ) from exc
            except LLMRateLimitError:
                if attempt == 0:
                    await asyncio.sleep(self._rate_limit_backoff_seconds)
                    continue
                raise

        raise RuntimeError("Unreachable state in LLMClient.complete.")
