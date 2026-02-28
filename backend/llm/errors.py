from __future__ import annotations


class LLMError(Exception):
    """Base error for all LLM client/provider failures."""


class LLMProviderNotFoundError(LLMError):
    """Raised when a provider key is not registered."""


class LLMProviderError(LLMError):
    """Raised for provider-side failures that are not timeout/rate-limit."""


class LLMTimeoutError(LLMError):
    """Raised when an LLM completion exceeds the timeout budget."""


class LLMRateLimitError(LLMError):
    """Raised when an LLM provider responds with rate-limit errors."""


class LLMInvalidResponseError(LLMError):
    """Raised when an LLM provider returns no usable text output."""
