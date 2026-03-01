from pydantic import BaseModel
from typing import Dict, Literal, Optional

AgentRole = Literal['moderator', 'scribe', 'participant']
NoveltyTier = Literal[
    'first_argument', 'correction', 'new_information',
    'disagreement', 'synthesis', 'reinforcement',
]

class AgentSchema(BaseModel):
    id: str
    session_id: str
    display_name: str
    persona_description: Optional[str] = None
    expertise: Optional[str] = None
    llm_provider: str
    llm_model: str
    llm_config: Optional[Dict] = None
    role: AgentRole

class AgentPresetSchema(BaseModel):
    id: str
    display_name: str
    persona_description: str
    expertise: str
    suggested_model: str

class QueueEntrySchema(BaseModel):
    agent_id: str
    agent_name: Optional[str] = None
    priority_score: float
    novelty_tier: NoveltyTier
    justification: Optional[str] = None
    position: int
