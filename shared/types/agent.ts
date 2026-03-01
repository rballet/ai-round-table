export type AgentRole = 'moderator' | 'scribe' | 'participant';
export type NoveltyTier = 'first_argument' | 'correction' | 'new_information' | 'disagreement' | 'synthesis' | 'reinforcement';

export interface Agent {
    id: string;
    session_id: string;
    display_name: string;
    persona_description?: string;
    expertise?: string;
    llm_provider: string;
    llm_model: string;
    llm_config?: Record<string, any>;
    role: AgentRole;
}

export interface AgentPreset {
    id: string;
    display_name: string;
    persona_description: string;
    expertise: string;
    suggested_model: string;
    llm_provider: string;
    category: string;
    is_system: boolean;
}

export interface QueueEntry {
    agent_id: string;
    agent_name?: string;
    priority_score: number;
    novelty_tier: NoveltyTier;
    justification?: string;
    position: number;
}
