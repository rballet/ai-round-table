export type SessionStatus = 'configured' | 'running' | 'paused' | 'ended';

export type TerminationReason = 'consensus' | 'cap' | 'host' | 'error' | null;

export interface SessionConfig {
  max_rounds: number;
  convergence_majority: number;
  priority_weights: {
    recency: number;
    novelty: number;
    role: number;
  };
  thought_inspector_enabled: boolean;
}

export interface Session {
  id: string;
  topic: string;
  supporting_context?: string;
  status: SessionStatus;
  config: SessionConfig;
  created_at: string;
  ended_at: string | null;
  termination_reason: TerminationReason;
  // Included in some endpoint responses like GET /sessions/{id}
  rounds_elapsed?: number;
  agent_count?: number;
}
