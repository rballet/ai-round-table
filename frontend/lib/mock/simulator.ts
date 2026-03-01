import { Agent } from 'shared/types/agent';
import { RoundTableEvent } from 'shared/types/events';

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
    const base = (offsetMs: number) => ({ session_id: sessionId, timestamp: timestamp(offsetMs) });

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

    const sequence: Array<{ delayMs: number; event: RoundTableEvent }> = [
      {
        delayMs: 300,
        event: {
          type: 'SESSION_START',
          ...base(300),
          topic: 'Should we split our API into microservices?',
          prompt: 'Debate the trade-offs given a 4-engineer team and current monolith.',
          agents,
          config: {
            max_rounds: 2,
            convergence_majority: 0.7,
            priority_weights: { recency: 1.0, novelty: 1.0, role: 1.0 },
            thought_inspector_enabled: true,
          },
        },
      },
      { delayMs: 700, event: { type: 'THINK_START', ...base(700), agent_id: 'agt_part_1' } },
      { delayMs: 850, event: { type: 'THINK_START', ...base(850), agent_id: 'agt_part_2' } },
      { delayMs: 1000, event: { type: 'THINK_START', ...base(1000), agent_id: 'agt_part_3' } },
      { delayMs: 1300, event: { type: 'THINK_END', ...base(1300), agent_id: 'agt_part_1' } },
      { delayMs: 1450, event: { type: 'THINK_END', ...base(1450), agent_id: 'agt_part_2' } },
      { delayMs: 1600, event: { type: 'THINK_END', ...base(1600), agent_id: 'agt_part_3' } },

      {
        delayMs: 1800,
        event: {
          type: 'TOKEN_REQUEST',
          ...base(1800),
          agent_id: 'agt_part_1',
          novelty_tier: 'first_argument',
          priority_score: 0.91,
          position_in_queue: 1,
        },
      },
      {
        delayMs: 1950,
        event: {
          type: 'TOKEN_REQUEST',
          ...base(1950),
          agent_id: 'agt_part_2',
          novelty_tier: 'new_information',
          priority_score: 0.83,
          position_in_queue: 2,
        },
      },
      {
        delayMs: 2100,
        event: {
          type: 'TOKEN_REQUEST',
          ...base(2100),
          agent_id: 'agt_part_3',
          novelty_tier: 'reinforcement',
          priority_score: 0.66,
          position_in_queue: 3,
        },
      },
      {
        delayMs: 2250,
        event: {
          type: 'QUEUE_UPDATED',
          ...base(2250),
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
              priority_score: 0.83,
              novelty_tier: 'new_information',
              position: 2,
            },
            {
              agent_id: 'agt_part_3',
              agent_name: 'Ravi',
              priority_score: 0.66,
              novelty_tier: 'reinforcement',
              position: 3,
            },
          ],
        },
      },
      {
        delayMs: 2550,
        event: {
          type: 'TOKEN_GRANTED',
          ...base(2550),
          agent_id: 'agt_part_1',
          round_index: 1,
          turn_index: 1,
        },
      },
      {
        delayMs: 2850,
        event: {
          type: 'ARGUMENT_POSTED',
          ...base(2850),
          argument: {
            id: 'arg_mock_1',
            agent_id: 'agt_part_1',
            agent_name: 'Alex',
            round_index: 1,
            turn_index: 1,
            content:
              'With a 4-engineer team, modularizing the monolith gives us most benefits without premature operational burden.',
          },
        },
      },
      {
        delayMs: 2950,
        event: {
          type: 'ERROR',
          ...base(2950),
          code: 'LLM_TIMEOUT',
          message: 'Agent response timed out after 30s',
          agent_id: 'agt_mod_1',
        },
      },
      { delayMs: 3000, event: { type: 'UPDATE_START', ...base(3000), agent_id: 'agt_part_2' } },
      { delayMs: 3060, event: { type: 'UPDATE_START', ...base(3060), agent_id: 'agt_part_3' } },
      { delayMs: 3360, event: { type: 'UPDATE_END', ...base(3360), agent_id: 'agt_part_2' } },
      { delayMs: 3420, event: { type: 'UPDATE_END', ...base(3420), agent_id: 'agt_part_3' } },
      {
        delayMs: 3450,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(3450),
          thought: {
            id: 'thought_nia_v1',
            agent_id: 'agt_part_2',
            version: 1,
            content: 'Alex makes a fair point about operational burden. A modular monolith might be the pragmatic choice, but I want to push on whether one isolated service could prove out the pattern.',
          },
        },
      },
      {
        delayMs: 3480,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(3480),
          thought: {
            id: 'thought_ravi_v1',
            agent_id: 'agt_part_3',
            version: 1,
            content: 'Reliability perspective: splitting without clear SLO ownership is dangerous. I need data on where incidents actually come from before recommending extraction.',
          },
        },
      },
      {
        delayMs: 3600,
        event: {
          type: 'TOKEN_REQUEST',
          ...base(3600),
          agent_id: 'agt_part_2',
          novelty_tier: 'disagreement',
          priority_score: 0.89,
          position_in_queue: 1,
        },
      },
      {
        delayMs: 3720,
        event: {
          type: 'TOKEN_REQUEST',
          ...base(3720),
          agent_id: 'agt_part_3',
          novelty_tier: 'synthesis',
          priority_score: 0.74,
          position_in_queue: 2,
        },
      },
      {
        delayMs: 3870,
        event: {
          type: 'QUEUE_UPDATED',
          ...base(3870),
          queue: [
            {
              agent_id: 'agt_part_2',
              agent_name: 'Nia',
              priority_score: 0.89,
              novelty_tier: 'disagreement',
              position: 1,
            },
            {
              agent_id: 'agt_part_3',
              agent_name: 'Ravi',
              priority_score: 0.74,
              novelty_tier: 'synthesis',
              position: 2,
            },
          ],
        },
      },
      {
        delayMs: 4020,
        event: {
          type: 'CONVERGENCE_CHECK',
          ...base(4020),
          status: 'open',
          rounds_elapsed: 1,
          novel_claims_this_round: 2,
        },
      },

      {
        delayMs: 4260,
        event: {
          type: 'TOKEN_GRANTED',
          ...base(4260),
          agent_id: 'agt_part_2',
          round_index: 1,
          turn_index: 2,
        },
      },
      {
        delayMs: 4560,
        event: {
          type: 'ARGUMENT_POSTED',
          ...base(4560),
          argument: {
            id: 'arg_mock_2',
            agent_id: 'agt_part_2',
            agent_name: 'Nia',
            round_index: 1,
            turn_index: 2,
            content:
              'A service split could still make sense for user-facing APIs if we isolate one high-change domain first and measure incident load.',
          },
        },
      },
      { delayMs: 4710, event: { type: 'UPDATE_START', ...base(4710), agent_id: 'agt_part_1' } },
      { delayMs: 4770, event: { type: 'UPDATE_START', ...base(4770), agent_id: 'agt_part_3' } },
      { delayMs: 5070, event: { type: 'UPDATE_END', ...base(5070), agent_id: 'agt_part_1' } },
      { delayMs: 5130, event: { type: 'UPDATE_END', ...base(5130), agent_id: 'agt_part_3' } },
      {
        delayMs: 5160,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(5160),
          thought: {
            id: 'thought_alex_v1',
            agent_id: 'agt_part_1',
            version: 1,
            content: 'Nia is right that a single high-change domain extraction could be a good experiment. I should propose concrete measurable gates so this stays bounded.',
          },
        },
      },
      {
        delayMs: 5190,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(5190),
          thought: {
            id: 'thought_ravi_v2',
            agent_id: 'agt_part_3',
            version: 2,
            content: 'Nia\'s point about isolating one high-change domain resonates. Reliability gates before extraction — that\'s my next argument. Need specific thresholds though.',
          },
        },
      },
      {
        delayMs: 5310,
        event: {
          type: 'TOKEN_REQUEST',
          ...base(5310),
          agent_id: 'agt_part_3',
          novelty_tier: 'correction',
          priority_score: 0.87,
          position_in_queue: 1,
        },
      },
      {
        delayMs: 5430,
        event: {
          type: 'TOKEN_REQUEST',
          ...base(5430),
          agent_id: 'agt_part_1',
          novelty_tier: 'reinforcement',
          priority_score: 0.71,
          position_in_queue: 2,
        },
      },
      {
        delayMs: 5580,
        event: {
          type: 'QUEUE_UPDATED',
          ...base(5580),
          queue: [
            {
              agent_id: 'agt_part_3',
              agent_name: 'Ravi',
              priority_score: 0.87,
              novelty_tier: 'correction',
              position: 1,
            },
            {
              agent_id: 'agt_part_1',
              agent_name: 'Alex',
              priority_score: 0.71,
              novelty_tier: 'reinforcement',
              position: 2,
            },
          ],
        },
      },
      {
        delayMs: 5730,
        event: {
          type: 'CONVERGENCE_CHECK',
          ...base(5730),
          status: 'converging',
          rounds_elapsed: 1,
          novel_claims_this_round: 1,
        },
      },

      {
        delayMs: 5970,
        event: {
          type: 'TOKEN_GRANTED',
          ...base(5970),
          agent_id: 'agt_part_3',
          round_index: 1,
          turn_index: 3,
        },
      },
      {
        delayMs: 6270,
        event: {
          type: 'ARGUMENT_POSTED',
          ...base(6270),
          argument: {
            id: 'arg_mock_3',
            agent_id: 'agt_part_3',
            agent_name: 'Ravi',
            round_index: 1,
            turn_index: 3,
            content:
              'Let us set explicit reliability gates first; if one domain fails those gates repeatedly, that domain becomes the only candidate for extraction.',
          },
        },
      },
      { delayMs: 6420, event: { type: 'UPDATE_START', ...base(6420), agent_id: 'agt_part_1' } },
      { delayMs: 6480, event: { type: 'UPDATE_START', ...base(6480), agent_id: 'agt_part_2' } },
      { delayMs: 6780, event: { type: 'UPDATE_END', ...base(6780), agent_id: 'agt_part_1' } },
      { delayMs: 6840, event: { type: 'UPDATE_END', ...base(6840), agent_id: 'agt_part_2' } },
      {
        delayMs: 6870,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(6870),
          thought: {
            id: 'thought_alex_v2',
            agent_id: 'agt_part_1',
            version: 2,
            content: 'Ravi\'s reliability gate framing is exactly what I needed. I can synthesise this: modular monolith with explicit ownership and measurable extraction thresholds.',
          },
        },
      },
      {
        delayMs: 6900,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(6900),
          thought: {
            id: 'thought_nia_v2',
            agent_id: 'agt_part_2',
            version: 2,
            content: 'I\'m moving closer to agreeing. The reliability gates idea addresses my concern about premature extraction. Convergence feels near.',
          },
        },
      },
      {
        delayMs: 7050,
        event: {
          type: 'QUEUE_UPDATED',
          ...base(7050),
          queue: [
            {
              agent_id: 'agt_part_1',
              agent_name: 'Alex',
              priority_score: 0.82,
              novelty_tier: 'synthesis',
              position: 1,
            },
            {
              agent_id: 'agt_part_2',
              agent_name: 'Nia',
              priority_score: 0.75,
              novelty_tier: 'reinforcement',
              position: 2,
            },
          ],
        },
      },
      {
        delayMs: 7170,
        event: {
          type: 'CONVERGENCE_CHECK',
          ...base(7170),
          status: 'open',
          rounds_elapsed: 1,
          novel_claims_this_round: 1,
        },
      },
      {
        delayMs: 7420,
        event: {
          type: 'TOKEN_GRANTED',
          ...base(7420),
          agent_id: 'agt_part_1',
          round_index: 2,
          turn_index: 4,
        },
      },
      {
        delayMs: 7720,
        event: {
          type: 'ARGUMENT_POSTED',
          ...base(7720),
          argument: {
            id: 'arg_mock_4',
            agent_id: 'agt_part_1',
            agent_name: 'Alex',
            round_index: 2,
            turn_index: 4,
            content:
              'Round two proposal: keep one deployable unit, enforce strict internal module contracts, and assign explicit team ownership per boundary. That keeps coordination overhead low for a small team while making extraction paths measurable when change velocity, incident load, and handoff friction cross predefined thresholds.',
          },
        },
      },
      { delayMs: 7870, event: { type: 'UPDATE_START', ...base(7870), agent_id: 'agt_part_2' } },
      { delayMs: 7930, event: { type: 'UPDATE_START', ...base(7930), agent_id: 'agt_part_3' } },
      { delayMs: 8230, event: { type: 'UPDATE_END', ...base(8230), agent_id: 'agt_part_2' } },
      { delayMs: 8290, event: { type: 'UPDATE_END', ...base(8290), agent_id: 'agt_part_3' } },
      {
        delayMs: 8320,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(8320),
          thought: {
            id: 'thought_nia_v3',
            agent_id: 'agt_part_2',
            version: 3,
            content: 'Alex\'s round 2 proposal is strong. I want to add that product guardrails are non-negotiable — the team must not extract purely for technical reasons without user-outcome evidence.',
          },
        },
      },
      {
        delayMs: 8350,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(8350),
          thought: {
            id: 'thought_ravi_v3',
            agent_id: 'agt_part_3',
            version: 3,
            content: 'The proposal is almost right. I still think we need a quarterly checkpoint mechanism baked in, not just thresholds. Will push for that in my next turn.',
          },
        },
      },
      {
        delayMs: 8470,
        event: {
          type: 'TOKEN_REQUEST',
          ...base(8470),
          agent_id: 'agt_part_2',
          novelty_tier: 'new_information',
          priority_score: 0.85,
          position_in_queue: 1,
        },
      },
      {
        delayMs: 8590,
        event: {
          type: 'TOKEN_REQUEST',
          ...base(8590),
          agent_id: 'agt_part_3',
          novelty_tier: 'disagreement',
          priority_score: 0.72,
          position_in_queue: 2,
        },
      },
      {
        delayMs: 8740,
        event: {
          type: 'QUEUE_UPDATED',
          ...base(8740),
          queue: [
            {
              agent_id: 'agt_part_2',
              agent_name: 'Nia',
              priority_score: 0.85,
              novelty_tier: 'new_information',
              position: 1,
            },
            {
              agent_id: 'agt_part_3',
              agent_name: 'Ravi',
              priority_score: 0.72,
              novelty_tier: 'disagreement',
              position: 2,
            },
          ],
        },
      },
      {
        delayMs: 8890,
        event: {
          type: 'CONVERGENCE_CHECK',
          ...base(8890),
          status: 'converging',
          rounds_elapsed: 2,
          novel_claims_this_round: 1,
        },
      },
      {
        delayMs: 9130,
        event: {
          type: 'TOKEN_GRANTED',
          ...base(9130),
          agent_id: 'agt_part_2',
          round_index: 2,
          turn_index: 5,
        },
      },
      {
        delayMs: 9430,
        event: {
          type: 'ARGUMENT_POSTED',
          ...base(9430),
          argument: {
            id: 'arg_mock_5',
            agent_id: 'agt_part_2',
            agent_name: 'Nia',
            round_index: 2,
            turn_index: 5,
            content:
              'I agree if we add explicit product guardrails: extraction starts only after sustained cross-team coordination cost and reliability pain.',
          },
        },
      },
      { delayMs: 9580, event: { type: 'UPDATE_START', ...base(9580), agent_id: 'agt_part_1' } },
      { delayMs: 9640, event: { type: 'UPDATE_START', ...base(9640), agent_id: 'agt_part_3' } },
      { delayMs: 9940, event: { type: 'UPDATE_END', ...base(9940), agent_id: 'agt_part_1' } },
      { delayMs: 10000, event: { type: 'UPDATE_END', ...base(10000), agent_id: 'agt_part_3' } },
      {
        delayMs: 10030,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(10030),
          thought: {
            id: 'thought_alex_v3',
            agent_id: 'agt_part_1',
            version: 3,
            content: 'Nia\'s product guardrail condition feels right. I\'m nearly ready to converge. Just need Ravi\'s synthesis to close the loop.',
          },
        },
      },
      {
        delayMs: 10060,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(10060),
          thought: {
            id: 'thought_ravi_v4',
            agent_id: 'agt_part_3',
            version: 4,
            content: 'This is it. Modular monolith, explicit gates, quarterly checkpoint. I can synthesise all three positions. Ready for final argument.',
          },
        },
      },
      {
        delayMs: 10180,
        event: {
          type: 'TOKEN_REQUEST',
          ...base(10180),
          agent_id: 'agt_part_3',
          novelty_tier: 'synthesis',
          priority_score: 0.78,
          position_in_queue: 1,
        },
      },
      {
        delayMs: 10330,
        event: {
          type: 'QUEUE_UPDATED',
          ...base(10330),
          queue: [
            {
              agent_id: 'agt_part_3',
              agent_name: 'Ravi',
              priority_score: 0.78,
              novelty_tier: 'synthesis',
              position: 1,
            },
          ],
        },
      },
      {
        delayMs: 10480,
        event: {
          type: 'CONVERGENCE_CHECK',
          ...base(10480),
          status: 'converging',
          rounds_elapsed: 2,
          novel_claims_this_round: 1,
        },
      },
      {
        delayMs: 10720,
        event: {
          type: 'TOKEN_GRANTED',
          ...base(10720),
          agent_id: 'agt_part_3',
          round_index: 2,
          turn_index: 6,
        },
      },
      {
        delayMs: 11020,
        event: {
          type: 'ARGUMENT_POSTED',
          ...base(11020),
          argument: {
            id: 'arg_mock_6',
            agent_id: 'agt_part_3',
            agent_name: 'Ravi',
            round_index: 2,
            turn_index: 6,
            content:
              'Final synthesis: modular monolith now, clear extraction gates, and a quarterly architecture checkpoint with reliability and delivery metrics.',
          },
        },
      },
      { delayMs: 11170, event: { type: 'UPDATE_START', ...base(11170), agent_id: 'agt_part_1' } },
      { delayMs: 11230, event: { type: 'UPDATE_START', ...base(11230), agent_id: 'agt_part_2' } },
      { delayMs: 11530, event: { type: 'UPDATE_END', ...base(11530), agent_id: 'agt_part_1' } },
      { delayMs: 11590, event: { type: 'UPDATE_END', ...base(11590), agent_id: 'agt_part_2' } },
      {
        delayMs: 11620,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(11620),
          thought: {
            id: 'thought_alex_v4',
            agent_id: 'agt_part_1',
            version: 4,
            content: 'Ravi\'s synthesis captured it perfectly. I agree with the final framing. No further arguments needed from me.',
          },
        },
      },
      {
        delayMs: 11650,
        event: {
          type: 'THOUGHT_UPDATED',
          ...base(11650),
          thought: {
            id: 'thought_nia_v4',
            agent_id: 'agt_part_2',
            version: 4,
            content: 'Consensus reached in my view. Modular monolith with product and reliability guardrails, reviewed quarterly. This is actionable.',
          },
        },
      },
      {
        delayMs: 11740,
        event: {
          type: 'QUEUE_UPDATED',
          ...base(11740),
          queue: [],
        },
      },
      {
        delayMs: 11890,
        event: {
          type: 'CONVERGENCE_CHECK',
          ...base(11890),
          status: 'converging',
          rounds_elapsed: 2,
          novel_claims_this_round: 0,
        },
      },
      {
        delayMs: 12120,
        event: {
          type: 'SUMMARY_POSTED',
          ...base(12120),
          summary: {
            id: 'sum_mock_204',
            content:
              '## Session Summary\n\nConsensus: keep a modular monolith now, add objective extraction gates, and revisit service boundaries after measurable pressure.',
            termination_reason: 'consensus',
          },
        },
      },
      {
        delayMs: 12310,
        event: {
          type: 'SESSION_END',
          ...base(12310),
          reason: 'consensus',
          rounds_elapsed: 2,
          summary_id: 'sum_mock_204',
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
