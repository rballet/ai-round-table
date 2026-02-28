from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Any
import json

from llm.client import LLMClient
from llm.prompts.moderator import build_moderator_prompt


NOVELTY_SCORES: dict[str, float] = {
    "first_argument": 1.0,
    "correction": 0.9,
    "new_information": 0.7,
    "disagreement": 0.5,
    "synthesis": 0.4,
    "reinforcement": 0.1,
}

EARLY_ROLE_WEIGHTS: dict[str, float] = {
    "challenger": 1.2,
    "sme": 1.1,
    "practitioner": 1.1,
    "decision-maker": 1.0,
    "connector": 1.0,
}

LATE_ROLE_WEIGHTS: dict[str, float] = {
    "challenger": 1.0,
    "sme": 1.0,
    "practitioner": 1.0,
    "decision-maker": 1.0,
    "connector": 1.1,
}


@dataclass(frozen=True)
class QueueCandidate:
    agent_id: str
    novelty_tier: str
    role: str = "participant"
    justification: str | None = None


@dataclass
class ModeratorState:
    total_turns_elapsed: int = 0
    last_turn_by_agent: dict[str, int] = field(default_factory=dict)
    consecutive_converging_turns: int = 0

@dataclass
class ConvergenceCheckResult:
    status: str
    novel_claims_this_round: int
    justification: str
    should_terminate: bool


class ModeratorEngine:
    def __init__(self, *, priority_weights: Mapping[str, float] | None = None) -> None:
        priority_weights = priority_weights or {}
        self._weight_recency = float(priority_weights.get("recency", 0.4))
        self._weight_novelty = float(priority_weights.get("novelty", 0.5))
        self._weight_role = float(priority_weights.get("role", 0.1))

    async def evaluate_convergence(
        self,
        *,
        topic: str,
        supporting_context: str | None,
        transcript: list[Any],
        llm_client: LLMClient,
        participant_count: int,
        state: ModeratorState,
        config: dict,
    ) -> ConvergenceCheckResult:
        messages = build_moderator_prompt(
            topic=topic,
            supporting_context=supporting_context,
            transcript=transcript,
        )
        
        # Try to use openai gpt-4o-mini by default since the user's config may not specify one for the moderator
        provider = config.get("moderator_provider", "openai")
        model = config.get("moderator_model", "gpt-4o-mini")

        response = await llm_client.complete(
            provider=provider,
            model=model,
            messages=messages,
        )

        try:
            cleaned_response = response.strip()
            if cleaned_response.startswith("```json"):
                cleaned_response = cleaned_response[7:]
            if cleaned_response.endswith("```"):
                cleaned_response = cleaned_response[:-3]
            parsed = json.loads(cleaned_response)
        except json.JSONDecodeError:
            parsed = {
                "status": "open",
                "novel_claims_this_round": 1,
                "justification": "Failed to parse moderator response.",
            }

        status = str(parsed.get("status", "open"))
        try:
            novel_claims_this_round = int(parsed.get("novel_claims_this_round", 1))
        except (ValueError, TypeError):
            novel_claims_this_round = 1
        justification = str(parsed.get("justification", ""))

        if status == "converging" and novel_claims_this_round == 0:
            state.consecutive_converging_turns += 1
        else:
            state.consecutive_converging_turns = 0

        convergence_threshold = max(participant_count, 1)
        should_terminate = state.consecutive_converging_turns >= convergence_threshold

        return ConvergenceCheckResult(
            status=status,
            novel_claims_this_round=novel_claims_this_round,
            justification=justification,
            should_terminate=should_terminate,
        )

    def compute_priority_score(
        self,
        entry: QueueCandidate,
        state: ModeratorState,
    ) -> float:
        recency_score = self._compute_recency_score(entry.agent_id, state)
        novelty_score = NOVELTY_SCORES.get(entry.novelty_tier, 0.1)
        role_weight = self._compute_role_weight(entry.role, state.total_turns_elapsed)
        return (
            (self._weight_recency * recency_score)
            + (self._weight_novelty * novelty_score)
            + (self._weight_role * role_weight)
        )

    @staticmethod
    def _compute_recency_score(agent_id: str, state: ModeratorState) -> float:
        if state.total_turns_elapsed <= 0:
            return 1.0

        last_turn = state.last_turn_by_agent.get(agent_id)
        if last_turn is None:
            return 1.0

        turns_since_last_argument = max(state.total_turns_elapsed - last_turn, 0)
        recency = turns_since_last_argument / state.total_turns_elapsed
        return max(0.0, min(1.0, recency))

    @staticmethod
    def _compute_role_weight(role: str, total_turns_elapsed: int) -> float:
        normalized_role = role.strip().lower()
        if total_turns_elapsed < 3:
            return EARLY_ROLE_WEIGHTS.get(normalized_role, 1.0)
        return LATE_ROLE_WEIGHTS.get(normalized_role, 1.0)
