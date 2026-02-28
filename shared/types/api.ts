import { Session, SessionConfig } from './session';
import { Agent, AgentPreset, QueueEntry } from './agent';

// API Requests
export interface CreateSessionRequest {
    topic: string;
    supporting_context?: string;
    config: SessionConfig;
    agents: Omit<Agent, 'id' | 'session_id'>[];
}

export interface StartSessionRequest {
    prompt: string;
}

// API Responses
export interface SessionResponse extends Session {
    agents: Agent[];
}

export interface SessionsListResponse {
    sessions: Session[];
}

export interface TranscriptResponse {
    session_id: string;
    arguments: {
        id: string;
        agent_id: string;
        agent_name: string;
        round_index: number;
        turn_index: number;
        content: string;
        created_at: string;
    }[];
}

export interface ThoughtsResponse {
    session_id: string;
    thoughts: {
        id: string;
        agent_id: string;
        agent_name: string;
        version: number;
        content: string;
        created_at: string;
    }[];
}

export interface QueueResponse {
    session_id: string;
    queue: QueueEntry[];
}

export interface SummaryResponse {
    id: string;
    session_id: string;
    termination_reason: string;
    content: string;
    created_at: string;
}

export interface PresetsResponse {
    presets: AgentPreset[];
}
