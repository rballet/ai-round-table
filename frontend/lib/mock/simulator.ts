import { RoundTableEvent } from 'shared/types/events';
import { Agent } from 'shared/types/agent';

export class WSSimulator {
    private timers: NodeJS.Timeout[] = [];

    private clearTimers() {
        for (const timer of this.timers) {
            clearTimeout(timer);
        }
        this.timers = [];
    }

    start(sessionId: string, onEvent: (event: RoundTableEvent) => void): void {
        this.stop();

        const now = Date.now();
        const timestamp = (offsetMs: number) => new Date(now + offsetMs).toISOString();
        const agents: Agent[] = [
            {
                id: 'agt_mod_1',
                session_id: sessionId,
                display_name: 'Moderator Maya',
                persona_description: 'Maintains structure and fairness.',
                expertise: 'Facilitation',
                llm_provider: 'openai',
                llm_model: 'gpt-4.1',
                role: 'moderator',
            },
            {
                id: 'agt_scribe_1',
                session_id: sessionId,
                display_name: 'Scribe Sol',
                persona_description: 'Summarizes points and decisions.',
                expertise: 'Synthesis',
                llm_provider: 'anthropic',
                llm_model: 'claude-4.5-sonnet',
                role: 'scribe',
            },
            {
                id: 'agt_part_1',
                session_id: sessionId,
                display_name: 'Alex',
                persona_description: 'Pragmatic backend specialist.',
                expertise: 'Backend architecture',
                llm_provider: 'openai',
                llm_model: 'gpt-4.1',
                role: 'participant',
            },
            {
                id: 'agt_part_2',
                session_id: sessionId,
                display_name: 'Nia',
                persona_description: 'Product and user-outcome advocate.',
                expertise: 'Product strategy',
                llm_provider: 'anthropic',
                llm_model: 'claude-4.5-sonnet',
                role: 'participant',
            },
            {
                id: 'agt_part_3',
                session_id: sessionId,
                display_name: 'Ravi',
                persona_description: 'Reliability and scaling expert.',
                expertise: 'SRE',
                llm_provider: 'openai',
                llm_model: 'gpt-4.1-mini',
                role: 'participant',
            },
        ];

        const thinkAgents = agents.filter((agent) => agent.role === 'participant');

        const sequence: Array<{ delayMs: number; event: RoundTableEvent }> = [
            {
                delayMs: 300,
                event: {
                    type: 'SESSION_START',
                    session_id: sessionId,
                    timestamp: timestamp(300),
                    topic: 'Should we split our API into microservices?',
                    prompt: 'Debate the trade-offs given a 4-engineer team and current monolith.',
                    agents,
                    config: {
                        max_rounds: 3,
                        convergence_majority: 0.7,
                        priority_weights: { recency: 1.0, novelty: 1.0, role: 1.0 },
                        thought_inspector_enabled: false,
                    },
                },
            },
            ...thinkAgents.map((agent, index) => ({
                delayMs: 900 + index * 250,
                event: {
                    type: 'THINK_START' as const,
                    session_id: sessionId,
                    timestamp: timestamp(900 + index * 250),
                    agent_id: agent.id,
                },
            })),
            ...thinkAgents.map((agent, index) => ({
                delayMs: 1900 + index * 250,
                event: {
                    type: 'THINK_END' as const,
                    session_id: sessionId,
                    timestamp: timestamp(1900 + index * 250),
                    agent_id: agent.id,
                },
            })),
            {
                delayMs: 2800,
                event: {
                    type: 'QUEUE_UPDATED',
                    session_id: sessionId,
                    timestamp: timestamp(2800),
                    queue: [
                        {
                            agent_id: 'agt_part_1',
                            agent_name: 'Alex',
                            priority_score: 0.91,
                            novelty_tier: 'first_argument',
                            position: 1,
                        },
                        {
                            agent_id: 'agt_part_2',
                            agent_name: 'Nia',
                            priority_score: 0.76,
                            novelty_tier: 'new_information',
                            position: 2,
                        },
                        {
                            agent_id: 'agt_part_3',
                            agent_name: 'Ravi',
                            priority_score: 0.63,
                            novelty_tier: 'reinforcement',
                            position: 3,
                        },
                    ],
                },
            },
            {
                delayMs: 3300,
                event: {
                    type: 'TOKEN_GRANTED',
                    session_id: sessionId,
                    timestamp: timestamp(3300),
                    agent_id: 'agt_part_1',
                    round_index: 1,
                    turn_index: 1,
                },
            },
            {
                delayMs: 3900,
                event: {
                    type: 'ARGUMENT_POSTED',
                    session_id: sessionId,
                    timestamp: timestamp(3900),
                    argument: {
                        id: 'arg_mock_1',
                        agent_id: 'agt_part_1',
                        agent_name: 'Alex',
                        round_index: 1,
                        turn_index: 1,
                        content:
                            'With a 4-engineer team, keeping the monolith and improving internal modularity is lower risk than introducing microservice operational overhead now.',
                    },
                },
            },
            {
                delayMs: 4400,
                event: {
                    type: 'QUEUE_UPDATED',
                    session_id: sessionId,
                    timestamp: timestamp(4400),
                    queue: [
                        {
                            agent_id: 'agt_part_2',
                            agent_name: 'Nia',
                            priority_score: 0.79,
                            novelty_tier: 'disagreement',
                            position: 1,
                        },
                        {
                            agent_id: 'agt_part_3',
                            agent_name: 'Ravi',
                            priority_score: 0.68,
                            novelty_tier: 'synthesis',
                            position: 2,
                        },
                    ],
                },
            },
        ];

        for (const item of sequence) {
            const timer = setTimeout(() => {
                onEvent(item.event);
            }, item.delayMs);
            this.timers.push(timer);
        }
    }

    stop(): void {
        this.clearTimers();
    }
}
