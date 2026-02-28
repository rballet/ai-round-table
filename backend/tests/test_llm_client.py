from __future__ import annotations

import asyncio

import pytest

from llm.client import LLMClient
from llm.errors import (
    LLMInvalidResponseError,
    LLMProviderNotFoundError,
    LLMRateLimitError,
    LLMTimeoutError,
)
from llm.providers.base import BaseLLMProvider
from llm.types import LLMConfig, Message


class StubProvider(BaseLLMProvider):
    def __init__(self, outcomes):
        self._outcomes = list(outcomes)
        self.calls = 0

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        self.calls += 1
        outcome = self._outcomes[self.calls - 1]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class SlowProvider(BaseLLMProvider):
    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        await asyncio.sleep(0.05)
        return "done"


@pytest.mark.asyncio
async def test_complete_dispatches_to_registered_provider():
    provider = StubProvider(["ok"])
    client = LLMClient(
        providers={"fake": provider},
        timeout_seconds=1.0,
        rate_limit_backoff_seconds=0.0,
    )

    result = await client.complete(
        provider="fake",
        model="fake-model",
        messages=[{"role": "user", "content": "Hello"}],
        config={"temperature": 0.1},
    )

    assert result == "ok"
    assert provider.calls == 1


@pytest.mark.asyncio
async def test_complete_raises_for_unknown_provider():
    client = LLMClient(providers={})

    with pytest.raises(LLMProviderNotFoundError):
        await client.complete(
            provider="missing",
            model="fake-model",
            messages=[{"role": "user", "content": "Hello"}],
        )


@pytest.mark.asyncio
async def test_complete_raises_timeout_error_after_30s_budget():
    client = LLMClient(
        providers={"slow": SlowProvider()},
        timeout_seconds=0.01,
        rate_limit_backoff_seconds=0.0,
    )

    with pytest.raises(LLMTimeoutError):
        await client.complete(
            provider="slow",
            model="fake-model",
            messages=[{"role": "user", "content": "Hello"}],
        )


@pytest.mark.asyncio
async def test_complete_retries_once_on_rate_limit_then_succeeds():
    provider = StubProvider([LLMRateLimitError("limited"), "ok-after-retry"])
    client = LLMClient(
        providers={"fake": provider},
        timeout_seconds=1.0,
        rate_limit_backoff_seconds=0.0,
    )

    result = await client.complete(
        provider="fake",
        model="fake-model",
        messages=[{"role": "user", "content": "Hello"}],
    )

    assert result == "ok-after-retry"
    assert provider.calls == 2


@pytest.mark.asyncio
async def test_complete_retries_once_on_rate_limit_then_raises():
    provider = StubProvider([LLMRateLimitError("limited"), LLMRateLimitError("still-limited")])
    client = LLMClient(
        providers={"fake": provider},
        timeout_seconds=1.0,
        rate_limit_backoff_seconds=0.0,
    )

    with pytest.raises(LLMRateLimitError):
        await client.complete(
            provider="fake",
            model="fake-model",
            messages=[{"role": "user", "content": "Hello"}],
        )

    assert provider.calls == 2


@pytest.mark.asyncio
async def test_complete_surfaces_invalid_response_error():
    provider = StubProvider([LLMInvalidResponseError("bad payload")])
    client = LLMClient(
        providers={"fake": provider},
        timeout_seconds=1.0,
        rate_limit_backoff_seconds=0.0,
    )

    with pytest.raises(LLMInvalidResponseError):
        await client.complete(
            provider="fake",
            model="fake-model",
            messages=[{"role": "user", "content": "Hello"}],
        )
