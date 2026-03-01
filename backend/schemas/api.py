from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from .session import SessionSchema, SessionConfigSchema, SessionTemplateSchema
from .agent import AgentSchema, AgentPresetSchema, QueueEntrySchema

class CreateSessionRequestSchema(BaseModel):
    topic: str
    supporting_context: Optional[str] = None
    config: SessionConfigSchema
    agents: List[Dict[str, Any]]  # Omit id, session_id handled in endpoint

class StartSessionRequestSchema(BaseModel):
    prompt: str

class SessionResponseSchema(SessionSchema):
    agents: List[AgentSchema]

class SessionsListResponseSchema(BaseModel):
    sessions: List[SessionSchema]

class ArgumentSchema(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    round_index: int
    turn_index: int
    content: str
    created_at: str

class TranscriptResponseSchema(BaseModel):
    session_id: str
    arguments: List[ArgumentSchema]

class ThoughtSchema(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    version: int
    content: str
    created_at: str

class ThoughtsResponseSchema(BaseModel):
    session_id: str
    thoughts: List[ThoughtSchema]

class QueueResponseSchema(BaseModel):
    session_id: str
    queue: List[QueueEntrySchema]

class SummaryResponseSchema(BaseModel):
    id: str
    session_id: str
    termination_reason: str
    content: str
    created_at: str

class PresetsResponseSchema(BaseModel):
    presets: List[AgentPresetSchema]

class CreatePresetRequestSchema(BaseModel):
    display_name: str
    persona_description: str
    expertise: str
    suggested_model: str
    llm_provider: str
    category: str

class ErrorEventSchema(BaseModel):
    id: str
    session_id: str
    agent_id: Optional[str] = None
    code: str
    message: str
    created_at: str

class ErrorsResponseSchema(BaseModel):
    session_id: str
    errors: List[ErrorEventSchema]

class CreateTemplateRequestSchema(BaseModel):
    name: str
    description: Optional[str] = None
    agents: List[Dict[str, Any]]
    config: SessionConfigSchema

class TemplatesResponseSchema(BaseModel):
    templates: List[SessionTemplateSchema]

class SaveAsTemplateRequestSchema(BaseModel):
    name: str
    description: Optional[str] = None
