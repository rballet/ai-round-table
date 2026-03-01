from __future__ import annotations

from fastapi import APIRouter

from schemas.api import PresetsResponseSchema
from schemas.agent import AgentPresetSchema

router = APIRouter(prefix="/agents", tags=["agents"])

_PRESETS: list[AgentPresetSchema] = [
    AgentPresetSchema(
        id="preset-socratic-questioner",
        display_name="Socratic Questioner",
        persona_description=(
            "A philosopher who probes assumptions by asking deep, clarifying questions. "
            "Refuses to accept claims at face value and guides discussion toward "
            "foundational truths through structured inquiry."
        ),
        expertise="Critical thinking, epistemology, philosophical dialogue",
        suggested_model="claude-opus-4-6",
    ),
    AgentPresetSchema(
        id="preset-devils-advocate",
        display_name="Devil's Advocate",
        persona_description=(
            "A rigorous contrarian who challenges every position regardless of personal "
            "belief. Finds weaknesses in arguments, surfaces hidden risks, and forces "
            "the group to stress-test its conclusions."
        ),
        expertise="Argumentation, risk analysis, stress testing ideas",
        suggested_model="gpt-5.2",
    ),
    AgentPresetSchema(
        id="preset-data-scientist",
        display_name="Data Scientist",
        persona_description=(
            "An empiricist who anchors every claim to evidence. Demands data, "
            "quantifies uncertainty, calls out logical fallacies, and distinguishes "
            "correlation from causation."
        ),
        expertise="Statistics, empirical research, data-driven reasoning",
        suggested_model="gpt-5.2",
    ),
    AgentPresetSchema(
        id="preset-ethicist",
        display_name="Ethicist",
        persona_description=(
            "A moral philosopher who evaluates proposals through multiple ethical "
            "frameworks — utilitarian, deontological, and virtue-based. Surfaces "
            "unintended consequences and questions of fairness and justice."
        ),
        expertise="Moral philosophy, applied ethics, stakeholder impact analysis",
        suggested_model="claude-opus-4-6",
    ),
    AgentPresetSchema(
        id="preset-systems-thinker",
        display_name="Systems Thinker",
        persona_description=(
            "An analyst focused on emergent properties, feedback loops, and "
            "second-order effects. Maps how components interact and warns against "
            "local optimisations that harm the whole system."
        ),
        expertise="Systems theory, complexity science, feedback dynamics",
        suggested_model="claude-sonnet-4-6",
    ),
    AgentPresetSchema(
        id="preset-futurist",
        display_name="Futurist",
        persona_description=(
            "A long-horizon strategist who reasons about technological trajectories, "
            "societal shifts, and low-probability high-impact events. Challenges "
            "short-term thinking and champions scenario planning."
        ),
        expertise="Trend analysis, scenario planning, technology forecasting",
        suggested_model="gemini-3.1-pro-preview",
    ),
    AgentPresetSchema(
        id="preset-domain-expert",
        display_name="Domain Expert",
        persona_description=(
            "A deep specialist who contributes precise technical knowledge and "
            "corrects misconceptions. Grounds abstract discussions in practical "
            "constraints and established best practices."
        ),
        expertise="Domain-specific technical knowledge, applied research",
        suggested_model="gpt-5.2",
    ),
]


@router.get("/presets", response_model=PresetsResponseSchema)
async def get_presets() -> PresetsResponseSchema:
    return PresetsResponseSchema(presets=_PRESETS)
