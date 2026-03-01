from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, List, Any

class SessionConfigSchema(BaseModel):
    max_rounds: int
    convergence_majority: float
    priority_weights: Dict[str, float]
    thought_inspector_enabled: bool

class SessionSchema(BaseModel):
    id: str
    topic: str
    supporting_context: Optional[str] = None
    status: str
    config: SessionConfigSchema
    created_at: str
    ended_at: Optional[str] = None
    termination_reason: Optional[str] = None
    rounds_elapsed: Optional[int] = None
    agent_count: Optional[int] = None

class SessionTemplateSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None
    agents: List[Dict[str, Any]]
    config: SessionConfigSchema
    created_at: str
