"""
MockProvider — a zero-dependency LLM provider for local testing.

Detects the prompt type from message content and returns canned-but-plausible
responses so the full orchestration loop (think → argue → decide) runs without
real API keys.
"""

from __future__ import annotations

import asyncio
import json
import random

from llm.providers.base import BaseLLMProvider
from llm.types import LLMConfig, Message

# Rotating think/argue lines keyed by agent display-name initial so different
# agents produce visibly distinct output.
_THINK_LINES = [
    "The core issue here is whether the proposed change creates more value than the disruption it causes. My preliminary position is cautiously in favour, provided the transition is managed incrementally.",
    "I am sceptical of the framing. The benefits are often overstated and the second-order costs — coordination overhead, skill gaps, cultural friction — are routinely underestimated.",
    "Evidence from comparable contexts suggests this is a nuanced question. I intend to push for empirical grounding rather than ideological stances on either side.",
    "My position is that the status quo has hidden costs that only become visible at scale. Change is necessary, but the sequencing matters enormously.",
    "I will advocate for a pilot-first approach: gather real data before committing to a direction. Reversibility should be a first-class design constraint.",
]

_ARGUE_LINES = [
    "The argument in favour rests on three pillars: efficiency gains, improved stakeholder satisfaction, and reduced long-term technical debt. Each of these is well-supported by case studies across similar contexts, and I would challenge anyone to produce counter-evidence of comparable weight.",
    "I must respectfully disagree with the previous speaker. The efficiency gains are real but narrow. They apply only to a subset of workflows and do not account for the onboarding cost imposed on new team members or the cognitive overhead of managing the transition period.",
    "What has been missing from this discussion is an honest accounting of opportunity cost. Every resource committed here is a resource not committed elsewhere. Before we proceed, we need a clearer picture of the trade-offs against competing priorities.",
    "The empirical record here is actually quite clear: organisations that adopted this approach iteratively outperformed those that did so in a single large change. The data suggest incremental rollout is not merely safer — it is more effective in absolute terms.",
    "I want to synthesise what has been said so far. We agree on the goal; the disagreement is about timing and sequencing. That is a much narrower gap than it first appeared, and I think there is a path to consensus if we focus on the first six months rather than the full roadmap.",
]

_DECIDE_TIERS = [
    ("new_information", "I have a data point that directly addresses the last argument and has not been raised."),
    ("disagreement", "I believe there is a factual error in the last argument that I need to correct."),
    ("synthesis", "I can bridge the positions already expressed and move the group toward resolution."),
    ("reinforcement", "I want to add supporting evidence to the point already made."),
]


def _is_decide_prompt(messages: list[Message]) -> bool:
    """Return True if the message list is a decide prompt for a participant."""
    for msg in messages:
        content = msg.get("content", "") if isinstance(msg, dict) else getattr(msg, "content", "")
        if "request_token" in content:
            return True
    return False


def _is_moderator_prompt(messages: list[Message]) -> bool:
    """Return True if the message list is a moderator convergence prompt."""
    for msg in messages:
        content = msg.get("content", "") if isinstance(msg, dict) else getattr(msg, "content", "")
        if "status\": \"converging\" | \"open\"" in content or "novel_claims_this_round" in content:
            return True
    return False

def _agent_name_from_messages(messages: list[Message]) -> str:
    """Extract agent display name from the system message, or return empty string."""
    for msg in messages:
        role = msg.get("role", "") if isinstance(msg, dict) else getattr(msg, "role", "")
        content = msg.get("content", "") if isinstance(msg, dict) else getattr(msg, "content", "")
        if role == "system" and content.startswith("You are "):
            # "You are Aria. ..."
            after = content[len("You are "):]
            name = after.split(".")[0].strip()
            return name
    return ""


class MockProvider(BaseLLMProvider):
    """
    A deterministic-but-varied mock LLM provider.

    Uses a small delay (configurable via the ``mock_latency_ms`` model string
    prefix, e.g. ``mock:500``) to simulate network latency so think/argue
    spinners are visible in the UI.

    Default latency: 800 ms.
    """

    DEFAULT_LATENCY_MS = 800

    async def complete(
        self,
        model: str,
        messages: list[Message],
        config: LLMConfig | None = None,
    ) -> str:
        # Parse optional latency from model name: "mock:1200" → 1200 ms
        latency_ms = self.DEFAULT_LATENCY_MS
        if ":" in model:
            try:
                latency_ms = int(model.split(":", 1)[1])
            except ValueError:
                pass

        await asyncio.sleep(latency_ms / 1000)

        if _is_decide_prompt(messages):
            return self._decide_response(messages)
        if _is_moderator_prompt(messages):
            return self._moderator_response(messages)
        return self._text_response(messages)

    def _text_response(self, messages: list[Message]) -> str:
        name = _agent_name_from_messages(messages)
        # Use name initial as a stable seed so the same agent always picks a
        # consistent line, making the demo feel more characterful.
        seed = ord(name[0].lower()) if name else 0
        lines = _THINK_LINES + _ARGUE_LINES
        return lines[seed % len(lines)]

    def _decide_response(self, messages: list[Message]) -> str:
        name = _agent_name_from_messages(messages)
        seed = ord(name[0].lower()) if name else random.randint(0, 3)
        tier, justification = _DECIDE_TIERS[seed % len(_DECIDE_TIERS)]
        return json.dumps({
            "request_token": True,
            "novelty_tier": tier,
            "justification": justification,
        })
        
    def _moderator_response(self, messages: list[Message]) -> str:
        # Simulate convergence if the discussion has gone on for a few turns
        # The moderator always receives exactly 2 messages (system + user), 
        # so we check the character length of the content payload which grows 
        # as the transcript gets longer.
        total_content_len = sum(
            len(msg.get("content", "") if isinstance(msg, dict) else getattr(msg, "content", ""))
            for msg in messages
        )
                
        # A typical starting prompt with 1 round of arguments is around 2000-3000 chars.
        # The threshold must exceed the max supporting_context size (10000 chars) so a
        # large context input does not trigger premature convergence on the first check.
        if total_content_len > 8000:
            return json.dumps({
                "status": "converging",
                "novel_claims_this_round": 0,
                "justification": "The group has reached a consensus as simulated by the mock provider."
            })
            
        return json.dumps({
            "status": "open",
            "novel_claims_this_round": 1,
            "justification": "Mock ongoing discussion. Not enough history to converge yet."
        })
