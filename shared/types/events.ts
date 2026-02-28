import { Agent, QueueEntry } from './agent';
import { SessionConfig } from './session';

export interface BaseEvent {
    type: string;
    session_id: string;
    timestamp: string;
}

export interface SessionStartEvent extends BaseEvent {
    type: 'SESSION_START';
    topic: string;
    prompt: string;
    agents: Agent[];
    config?: SessionConfig;
}

export interface ThinkStartEvent extends BaseEvent {
    type: 'THINK_START';
    agent_id: string;
}

export interface ThinkEndEvent extends BaseEvent {
    type: 'THINK_END';
    agent_id: string;
}

export interface TokenGrantedEvent extends BaseEvent {
    type: 'TOKEN_GRANTED';
    agent_id: string;
    round_index: number;
    turn_index: number;
}

export interface ArgumentPostedEvent extends BaseEvent {
    type: 'ARGUMENT_POSTED';
    argument: {
        id: string;
        agent_id: string;
        agent_name: string;
        round_index: number;
        turn_index: number;
        content: string;
    };
}

export interface UpdateStartEvent extends BaseEvent {
    type: 'UPDATE_START';
    agent_id: string;
}

export interface UpdateEndEvent extends BaseEvent {
    type: 'UPDATE_END';
    agent_id: string;
}

export interface ThoughtUpdatedEvent extends BaseEvent {
    type: 'THOUGHT_UPDATED';
    thought: {
        id: string;
        agent_id: string;
        version: number;
        content: string;
    };
}

export interface TokenRequestEvent extends BaseEvent {
    type: 'TOKEN_REQUEST';
    agent_id: string;
    novelty_tier: string;
    priority_score: number;
    position_in_queue: number;
}

export interface QueueUpdatedEvent extends BaseEvent {
    type: 'QUEUE_UPDATED';
    queue: QueueEntry[];
}

export interface ConvergenceCheckEvent extends BaseEvent {
    type: 'CONVERGENCE_CHECK';
    status: 'converging' | 'open' | 'capped';
    rounds_elapsed: number;
    novel_claims_this_round: number;
}

export interface SessionPausedEvent extends BaseEvent {
    type: 'SESSION_PAUSED';
}

export interface SessionResumedEvent extends BaseEvent {
    type: 'SESSION_RESUMED';
}

export interface SessionEndEvent extends BaseEvent {
    type: 'SESSION_END';
    reason: 'consensus' | 'cap' | 'host';
    rounds_elapsed: number;
    summary_id?: string;
}

export interface SummaryPostedEvent extends BaseEvent {
    type: 'SUMMARY_POSTED';
    summary: {
        id: string;
        content: string;
        termination_reason: 'consensus' | 'cap' | 'host';
    };
}

export interface ErrorEvent extends BaseEvent {
    type: 'ERROR';
    code: string;
    message: string;
    agent_id?: string;
}

export type RoundTableEvent =
    | SessionStartEvent
    | ThinkStartEvent
    | ThinkEndEvent
    | TokenGrantedEvent
    | ArgumentPostedEvent
    | UpdateStartEvent
    | UpdateEndEvent
    | ThoughtUpdatedEvent
    | TokenRequestEvent
    | QueueUpdatedEvent
    | ConvergenceCheckEvent
    | SessionPausedEvent
    | SessionResumedEvent
    | SessionEndEvent
    | SummaryPostedEvent
    | ErrorEvent;
