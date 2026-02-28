from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping


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


class ModeratorEngine:
    def __init__(self, *, priority_weights: Mapping[str, float] | None = None) -> None:
        priority_weights = priority_weights or {}
        self._weight_recency = float(priority_weights.get("recency", 0.4))
        self._weight_novelty = float(priority_weights.get("novelty", 0.5))
        self._weight_role = float(priority_weights.get("role", 0.1))

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
