from __future__ import annotations

from types import SimpleNamespace

import pytest

from llm.errors import (
    LLMInvalidResponseError,
    LLMProviderError,
    LLMRateLimitError,
)
from llm.providers.anthropic import AnthropicProvider
from llm.providers.gemini import GeminiProvider
from llm.providers.ollama import OllamaProvider
from llm.providers.openai import OpenAIProvider


class FakeOpenAICompletions:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return self._response


class FakeOpenAIClient:
    def __init__(self, response=None, error=None):
        self.completions = FakeOpenAICompletions(response=response, error=error)
        self.chat = SimpleNamespace(completions=self.completions)


class FakeAnthropicMessages:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return self._response


class FakeAnthropicClient:
    def __init__(self, response=None, error=None):
        self.messages = FakeAnthropicMessages(response=response, error=error)


@pytest.mark.asyncio
async def test_openai_provider_returns_text_response():
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="  hello world  "))]
    )
    fake_client = FakeOpenAIClient(response=response)
    provider = OpenAIProvider(client=fake_client)

    result = await provider.complete(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hi"}],
        config={"temperature": 0.7},
    )

    assert result == "hello world"
    assert fake_client.completions.calls[0]["model"] == "gpt-4o"
    assert fake_client.completions.calls[0]["temperature"] == 0.7


@pytest.mark.asyncio
async def test_openai_provider_raises_invalid_response_on_empty_payload():
    response = SimpleNamespace(choices=[])
    provider = OpenAIProvider(client=FakeOpenAIClient(response=response))

    with pytest.raises(LLMInvalidResponseError):
        await provider.complete(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Hi"}],
        )


@pytest.mark.asyncio
async def test_openai_provider_maps_rate_limit_error(monkeypatch):
    import llm.providers.openai as openai_module

    class FakeRateLimitError(Exception):
        pass

    monkeypatch.setattr(openai_module, "OpenAIRateLimitError", FakeRateLimitError)

    provider = OpenAIProvider(
        client=FakeOpenAIClient(error=FakeRateLimitError("limited"))
    )

    with pytest.raises(LLMRateLimitError):
        await provider.complete(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Hi"}],
        )


@pytest.mark.asyncio
async def test_openai_provider_raises_provider_error_when_sdk_unavailable():
    provider = OpenAIProvider(client=None)
    provider._client = None

    with pytest.raises(LLMProviderError):
        await provider.complete(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Hi"}],
        )


@pytest.mark.asyncio
async def test_anthropic_provider_returns_text_and_splits_system_prompt():
    response = SimpleNamespace(
        content=[
            SimpleNamespace(type="text", text="First line"),
            SimpleNamespace(type="text", text="Second line"),
        ]
    )
    fake_client = FakeAnthropicClient(response=response)
    provider = AnthropicProvider(client=fake_client)

    result = await provider.complete(
        model="claude-sonnet-4-5",
        messages=[
            {"role": "system", "content": "Rules"},
            {"role": "user", "content": "Question"},
        ],
        config={"temperature": 0.2},
    )

    assert result == "First line\nSecond line"
    call = fake_client.messages.calls[0]
    assert call["system"] == "Rules"
    assert call["messages"] == [{"role": "user", "content": "Question"}]
    assert call["max_tokens"] == 1024
    assert call["temperature"] == 0.2


@pytest.mark.asyncio
async def test_anthropic_provider_raises_invalid_response_on_empty_payload():
    provider = AnthropicProvider(client=FakeAnthropicClient(response=SimpleNamespace(content=[])))

    with pytest.raises(LLMInvalidResponseError):
        await provider.complete(
            model="claude-sonnet-4-5",
            messages=[{"role": "user", "content": "Hi"}],
        )


@pytest.mark.asyncio
async def test_anthropic_provider_maps_rate_limit_error(monkeypatch):
    import llm.providers.anthropic as anthropic_module

    class FakeRateLimitError(Exception):
        pass

    monkeypatch.setattr(
        anthropic_module, "AnthropicRateLimitError", FakeRateLimitError
    )

    provider = AnthropicProvider(
        client=FakeAnthropicClient(error=FakeRateLimitError("limited"))
    )

    with pytest.raises(LLMRateLimitError):
        await provider.complete(
            model="claude-sonnet-4-5",
            messages=[{"role": "user", "content": "Hi"}],
        )


# ---------------------------------------------------------------------------
# GeminiProvider tests
# ---------------------------------------------------------------------------

class FakeGeminiModels:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error
        self.calls: list[dict] = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return self._response


class FakeGeminiAio:
    def __init__(self, response=None, error=None):
        self.models = FakeGeminiModels(response=response, error=error)


class FakeGeminiClient:
    def __init__(self, response=None, error=None):
        self.aio = FakeGeminiAio(response=response, error=error)


@pytest.mark.asyncio
async def test_gemini_provider_returns_text_response():
    response = SimpleNamespace(text="  Gemini reply  ")
    fake_client = FakeGeminiClient(response=response)
    provider = GeminiProvider(client=fake_client)

    result = await provider.complete(
        model="gemini-2.0-flash",
        messages=[
            {"role": "system", "content": "Be helpful"},
            {"role": "user", "content": "Hello"},
        ],
    )

    assert result == "Gemini reply"
    call = fake_client.aio.models.calls[0]
    assert call["model"] == "gemini-2.0-flash"
    # System message should be in config, not in contents
    assert any(
        part["text"] == "Hello"
        for item in call["contents"]
        for part in item.get("parts", [])
    )


@pytest.mark.asyncio
async def test_gemini_provider_maps_assistant_role_to_model():
    response = SimpleNamespace(text="reply")
    fake_client = FakeGeminiClient(response=response)
    provider = GeminiProvider(client=fake_client)

    await provider.complete(
        model="gemini-2.0-flash",
        messages=[
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello"},
            {"role": "user", "content": "Follow up"},
        ],
    )

    contents = fake_client.aio.models.calls[0]["contents"]
    roles = [item["role"] for item in contents]
    assert roles == ["user", "model", "user"]


@pytest.mark.asyncio
async def test_gemini_provider_raises_invalid_response_on_empty_text():
    response = SimpleNamespace(text=None)
    provider = GeminiProvider(client=FakeGeminiClient(response=response))

    with pytest.raises(LLMInvalidResponseError):
        await provider.complete(
            model="gemini-2.0-flash",
            messages=[{"role": "user", "content": "Hi"}],
        )


@pytest.mark.asyncio
async def test_gemini_provider_maps_rate_limit_error(monkeypatch):
    import llm.providers.gemini as gemini_module

    class FakeRateLimitError(Exception):
        pass

    monkeypatch.setattr(gemini_module, "GeminiRateLimitError", FakeRateLimitError)

    provider = GeminiProvider(client=FakeGeminiClient(error=FakeRateLimitError("limited")))

    with pytest.raises(LLMRateLimitError):
        await provider.complete(
            model="gemini-2.0-flash",
            messages=[{"role": "user", "content": "Hi"}],
        )


@pytest.mark.asyncio
async def test_gemini_provider_raises_provider_error_when_client_unavailable():
    provider = GeminiProvider(client=None)
    provider._client = None

    with pytest.raises(LLMProviderError):
        await provider.complete(
            model="gemini-2.0-flash",
            messages=[{"role": "user", "content": "Hi"}],
        )


# ---------------------------------------------------------------------------
# OllamaProvider tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ollama_provider_returns_text_response():
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="  ollama reply  "))]
    )
    fake_client = FakeOpenAIClient(response=response)
    provider = OllamaProvider(client=fake_client)

    result = await provider.complete(
        model="llama3.2",
        messages=[{"role": "user", "content": "Hi"}],
    )

    assert result == "ollama reply"
    assert fake_client.completions.calls[0]["model"] == "llama3.2"


@pytest.mark.asyncio
async def test_ollama_provider_raises_invalid_response_on_empty_choices():
    response = SimpleNamespace(choices=[])
    provider = OllamaProvider(client=FakeOpenAIClient(response=response))

    with pytest.raises(LLMInvalidResponseError):
        await provider.complete(
            model="llama3.2",
            messages=[{"role": "user", "content": "Hi"}],
        )


@pytest.mark.asyncio
async def test_ollama_provider_maps_rate_limit_error(monkeypatch):
    import llm.providers.ollama as ollama_module

    class FakeRateLimitError(Exception):
        pass

    monkeypatch.setattr(ollama_module, "OpenAIRateLimitError", FakeRateLimitError)

    provider = OllamaProvider(client=FakeOpenAIClient(error=FakeRateLimitError("limited")))

    with pytest.raises(LLMRateLimitError):
        await provider.complete(
            model="llama3.2",
            messages=[{"role": "user", "content": "Hi"}],
        )


@pytest.mark.asyncio
async def test_ollama_provider_raises_provider_error_when_client_unavailable():
    provider = OllamaProvider(client=None)
    provider._client = None

    with pytest.raises(LLMProviderError):
        await provider.complete(
            model="llama3.2",
            messages=[{"role": "user", "content": "Hi"}],
        )
