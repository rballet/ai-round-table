from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.agent_preset import AgentPreset
from schemas.api import CreatePresetRequestSchema


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

_SYSTEM_PRESETS: list[dict] = [
    # --- General ---
    {
        "id": "preset-socratic-questioner",
        "display_name": "Socratic Questioner",
        "persona_description": "A philosopher who questions assumptions through structured inquiry",
        "expertise": "Logic and argumentation",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "general",
    },
    {
        "id": "preset-devils-advocate",
        "display_name": "Devil's Advocate",
        "persona_description": "Systematically challenges proposals to expose weaknesses",
        "expertise": "Critical thinking",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "general",
    },
    {
        "id": "preset-data-scientist",
        "display_name": "Data Scientist",
        "persona_description": "Grounds arguments in evidence and statistical reasoning",
        "expertise": "Data analysis and statistics",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "general",
    },
    {
        "id": "preset-ethicist",
        "display_name": "Ethicist",
        "persona_description": "Evaluates moral and social implications of proposals",
        "expertise": "Applied ethics and philosophy",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "general",
    },
    {
        "id": "preset-systems-thinker",
        "display_name": "Systems Thinker",
        "persona_description": "Analyzes complex interdependencies and emergent effects",
        "expertise": "Systems theory and complexity",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "general",
    },
    {
        "id": "preset-futurist",
        "display_name": "Futurist",
        "persona_description": "Projects long-term trends and second-order consequences",
        "expertise": "Forecasting and scenario planning",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "general",
    },
    {
        "id": "preset-domain-expert",
        "display_name": "Domain Expert",
        "persona_description": "Applies deep specialist knowledge to evaluate proposals",
        "expertise": "Domain-specific technical knowledge",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "general",
    },
    # --- Business ---
    {
        "id": "preset-ceo",
        "display_name": "CEO",
        "persona_description": "Strategic leader focused on vision, execution, and stakeholder value",
        "expertise": "Corporate strategy and leadership",
        "suggested_model": "gpt-5-mini",
        "llm_provider": "openai",
        "category": "business",
    },
    {
        "id": "preset-cfo",
        "display_name": "CFO",
        "persona_description": "Financial guardian who evaluates risk, ROI, and capital allocation",
        "expertise": "Finance and accounting",
        "suggested_model": "gpt-5-mini",
        "llm_provider": "openai",
        "category": "business",
    },
    {
        "id": "preset-cto",
        "display_name": "CTO",
        "persona_description": "Technology architect balancing innovation with maintainability",
        "expertise": "Software architecture and engineering",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "business",
    },
    {
        "id": "preset-product-manager",
        "display_name": "Product Manager",
        "persona_description": "Voice of the customer, balancing user needs with business goals",
        "expertise": "Product development and UX",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "business",
    },
    {
        "id": "preset-investor-vc",
        "display_name": "Investor/VC",
        "persona_description": "Evaluates market opportunity, defensibility, and return potential",
        "expertise": "Venture capital and market analysis",
        "suggested_model": "gpt-5-mini",
        "llm_provider": "openai",
        "category": "business",
    },
    {
        "id": "preset-legal-counsel",
        "display_name": "Legal Counsel",
        "persona_description": "Identifies regulatory risk, liability, and compliance requirements",
        "expertise": "Corporate law and regulation",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "business",
    },
    {
        "id": "preset-strategic-advisor",
        "display_name": "Strategic Advisor",
        "persona_description": "Pattern-matches across industries to identify strategic options",
        "expertise": "Business strategy and competitive analysis",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "business",
    },
    # --- Science & Research ---
    {
        "id": "preset-principal-investigator",
        "display_name": "Principal Investigator",
        "persona_description": "Leads research with rigorous methodology and peer standards",
        "expertise": "Research design and scientific method",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "science",
    },
    {
        "id": "preset-peer-reviewer",
        "display_name": "Peer Reviewer",
        "persona_description": "Critically evaluates claims for validity, reproducibility, and bias",
        "expertise": "Scientific review and epistemology",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "science",
    },
    {
        "id": "preset-statistician",
        "display_name": "Statistician",
        "persona_description": "Audits data quality, sample sizes, and statistical inference",
        "expertise": "Statistics and experimental design",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "science",
    },
    {
        "id": "preset-grant-writer",
        "display_name": "Grant Writer",
        "persona_description": "Frames research impact for funders and policy audiences",
        "expertise": "Science communication and funding",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "science",
    },
    # --- Policy ---
    {
        "id": "preset-policy-analyst",
        "display_name": "Policy Analyst",
        "persona_description": "Evaluates public policy options using evidence and stakeholder impact",
        "expertise": "Policy analysis and governance",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "policy",
    },
    {
        "id": "preset-economist",
        "display_name": "Economist",
        "persona_description": "Models incentives, market dynamics, and distributional effects",
        "expertise": "Economics and public finance",
        "suggested_model": "gpt-5-mini",
        "llm_provider": "openai",
        "category": "policy",
    },
    {
        "id": "preset-lobbyist",
        "display_name": "Lobbyist",
        "persona_description": "Advocates for specific interest groups with persuasion and framing",
        "expertise": "Advocacy and stakeholder engagement",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "policy",
    },
    {
        "id": "preset-civil-servant",
        "display_name": "Civil Servant",
        "persona_description": "Implements policy with operational realism and institutional knowledge",
        "expertise": "Government operations and compliance",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "policy",
    },
    # --- Engineering ---
    {
        "id": "preset-tech-lead",
        "display_name": "Tech Lead",
        "persona_description": "Drives technical decisions balancing quality, speed, and team capacity",
        "expertise": "Software engineering and team leadership",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "engineering",
    },
    {
        "id": "preset-security-engineer",
        "display_name": "Security Engineer",
        "persona_description": "Identifies vulnerabilities, threat models, and security trade-offs",
        "expertise": "Cybersecurity and threat analysis",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "engineering",
    },
    {
        "id": "preset-qa-engineer",
        "display_name": "QA Engineer",
        "persona_description": "Stress-tests assumptions and identifies edge cases and failure modes",
        "expertise": "Quality assurance and testing",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "engineering",
    },
    {
        "id": "preset-devops-engineer",
        "display_name": "DevOps Engineer",
        "persona_description": "Evaluates operational feasibility, deployment risk, and scalability",
        "expertise": "Infrastructure and reliability",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "engineering",
    },
    {
        "id": "preset-architect",
        "display_name": "Architect",
        "persona_description": "Designs systems for long-term maintainability and evolution",
        "expertise": "Software architecture and system design",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "engineering",
    },
    # --- Creative ---
    {
        "id": "preset-art-director",
        "display_name": "Art Director",
        "persona_description": "Evaluates aesthetic coherence, brand alignment, and visual impact",
        "expertise": "Visual design and creative direction",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "creative",
    },
    {
        "id": "preset-writer",
        "display_name": "Writer",
        "persona_description": "Refines narrative clarity, voice, and audience resonance",
        "expertise": "Writing and storytelling",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "creative",
    },
    {
        "id": "preset-critic",
        "display_name": "Critic",
        "persona_description": "Provides rigorous cultural and aesthetic critique",
        "expertise": "Critical theory and analysis",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "creative",
    },
    {
        "id": "preset-producer",
        "display_name": "Producer",
        "persona_description": "Manages creative projects balancing vision with constraints",
        "expertise": "Creative production and project management",
        "suggested_model": "claude-sonnet-4-6",
        "llm_provider": "anthropic",
        "category": "creative",
    },
]


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------

async def seed_system_presets(db: AsyncSession) -> None:
    """Insert system presets if none exist yet. Idempotent."""
    result = await db.execute(
        select(func.count()).select_from(AgentPreset).where(AgentPreset.is_system == True)  # noqa: E712
    )
    count = result.scalar_one()
    if count > 0:
        return

    for data in _SYSTEM_PRESETS:
        preset = AgentPreset(
            id=data["id"],
            display_name=data["display_name"],
            persona_description=data["persona_description"],
            expertise=data["expertise"],
            suggested_model=data["suggested_model"],
            llm_provider=data["llm_provider"],
            category=data["category"],
            is_system=True,
        )
        db.add(preset)

    await db.commit()


async def list_presets(db: AsyncSession) -> list[AgentPreset]:
    """Return all presets ordered by is_system DESC, display_name ASC."""
    result = await db.execute(
        select(AgentPreset).order_by(
            AgentPreset.is_system.desc(),
            AgentPreset.display_name.asc(),
        )
    )
    return list(result.scalars().all())


async def create_preset(
    db: AsyncSession, data: CreatePresetRequestSchema
) -> AgentPreset:
    """Insert a user-created preset (is_system=False) and return it."""
    preset = AgentPreset(
        id=str(uuid.uuid4()),
        display_name=data.display_name,
        persona_description=data.persona_description,
        expertise=data.expertise,
        suggested_model=data.suggested_model,
        llm_provider=data.llm_provider,
        category=data.category,
        is_system=False,
    )
    db.add(preset)
    await db.commit()
    return preset


async def delete_preset(
    db: AsyncSession, preset_id: str
) -> AgentPreset | None:
    """Delete a user preset and return it, or None if not found.

    Raises ValueError if the preset is a system preset.
    """
    result = await db.execute(
        select(AgentPreset).where(AgentPreset.id == preset_id)
    )
    preset = result.scalar_one_or_none()

    if preset is None:
        return None

    if preset.is_system:
        raise ValueError(f"Cannot delete system preset '{preset_id}'")

    await db.delete(preset)
    await db.commit()
    return preset
