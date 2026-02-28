from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class BaseEventSchema(BaseModel):
    type: str
    session_id: str
    timestamp: str

class SessionStartEventSchema(BaseEventSchema):
    type: str = "SESSION_START"
    topic: str
    prompt: str
    agents: List[Dict[str, Any]]
    config: Optional[Dict[str, Any]] = None

class ThinkStartEventSchema(BaseEventSchema):
    type: str = "THINK_START"
    agent_id: str

class ThinkEndEventSchema(BaseEventSchema):
    type: str = "THINK_END"
    agent_id: str

class TokenGrantedEventSchema(BaseEventSchema):
    type: str = "TOKEN_GRANTED"
    agent_id: str
    round_index: int
    turn_index: int

class ArgumentPostedEventSchema(BaseEventSchema):
    type: str = "ARGUMENT_POSTED"
    argument: Dict[str, Any]

class UpdateStartEventSchema(BaseEventSchema):
    type: str = "UPDATE_START"
    agent_id: str

class UpdateEndEventSchema(BaseEventSchema):
    type: str = "UPDATE_END"
    agent_id: str

class ThoughtUpdatedEventSchema(BaseEventSchema):
    type: str = "THOUGHT_UPDATED"
    thought: Dict[str, Any]

class TokenRequestEventSchema(BaseEventSchema):
    type: str = "TOKEN_REQUEST"
    agent_id: str
    novelty_tier: str
    priority_score: float
    position_in_queue: int

class QueueUpdatedEventSchema(BaseEventSchema):
    type: str = "QUEUE_UPDATED"
    queue: List[Dict[str, Any]]

class ConvergenceCheckEventSchema(BaseEventSchema):
    type: str = "CONVERGENCE_CHECK"
    status: str
    rounds_elapsed: int
    novel_claims_this_round: int

class SessionPausedEventSchema(BaseEventSchema):
    type: str = "SESSION_PAUSED"

class SessionResumedEventSchema(BaseEventSchema):
    type: str = "SESSION_RESUMED"

class SessionEndEventSchema(BaseEventSchema):
    type: str = "SESSION_END"
    reason: str
    rounds_elapsed: int
    summary_id: Optional[str] = None

class SummaryPostedEventSchema(BaseEventSchema):
    type: str = "SUMMARY_POSTED"
    summary: Dict[str, Any]

class ErrorEventSchema(BaseEventSchema):
    type: str = "ERROR"
    code: str
    message: str
    agent_id: Optional[str] = None
