import { http, HttpResponse } from 'msw';
import { Agent } from 'shared/types/agent';

// ---------------------------------------------------------------------------
// Fixture data (used by SPEC-101-FE session list + detail pages)
// ---------------------------------------------------------------------------

const MOCK_SESSIONS = [
  {
    id: 'sess_mock_001',
    topic: 'Should AI systems be regulated by governments?',
    supporting_context: 'Recent EU AI Act proposal and US executive orders on AI safety.',
    status: 'running',
    config: {
      max_rounds: 10,
      convergence_majority: 0.6,
      priority_weights: { recency: 0.4, novelty: 0.4, role: 0.2 },
      thought_inspector_enabled: true,
    },
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    ended_at: null,
    termination_reason: null,
    rounds_elapsed: 3,
    agent_count: 4,
  },
  {
    id: 'sess_mock_002',
    topic: 'Is universal basic income a viable economic policy?',
    supporting_context: '',
    status: 'configured',
    config: {
      max_rounds: 8,
      convergence_majority: 0.7,
      priority_weights: { recency: 0.3, novelty: 0.5, role: 0.2 },
      thought_inspector_enabled: false,
    },
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    ended_at: null,
    termination_reason: null,
    rounds_elapsed: 0,
    agent_count: 5,
  },
  {
    id: 'sess_mock_003',
    topic: 'Open source vs closed source AI: which approach benefits society more?',
    supporting_context: '',
    status: 'ended',
    config: {
      max_rounds: 6,
      convergence_majority: 0.6,
      priority_weights: { recency: 0.4, novelty: 0.4, role: 0.2 },
      thought_inspector_enabled: false,
    },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    ended_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    termination_reason: 'consensus',
    rounds_elapsed: 5,
    agent_count: 4,
  },
];

const MOCK_AGENTS: Agent[] = [
  {
    id: 'agent_mod_001',
    session_id: 'sess_mock_001',
    display_name: 'Aria',
    persona_description: 'A balanced, structured moderator who ensures all voices are heard.',
    expertise: 'Facilitation and structured debate',
    llm_provider: 'anthropic',
    llm_model: 'claude-opus-4-5',
    role: 'moderator',
  },
  {
    id: 'agent_scr_001',
    session_id: 'sess_mock_001',
    display_name: 'Scribe',
    persona_description: 'Impartial note-taker who captures the key points of the discussion.',
    expertise: 'Summarisation and synthesis',
    llm_provider: 'anthropic',
    llm_model: 'claude-sonnet-4-6',
    role: 'scribe',
  },
  {
    id: 'agent_par_001',
    session_id: 'sess_mock_001',
    display_name: 'The Challenger',
    persona_description: 'You actively contest prevailing positions, seeking logical weaknesses.',
    expertise: 'Critical analysis',
    llm_provider: 'anthropic',
    llm_model: 'claude-opus-4-5',
    role: 'participant',
  },
  {
    id: 'agent_par_002',
    session_id: 'sess_mock_001',
    display_name: 'The Pragmatist',
    persona_description: 'Grounds the discussion in practical implications and real-world constraints.',
    expertise: 'Policy and implementation',
    llm_provider: 'openai',
    llm_model: 'gpt-4o',
    role: 'participant',
  },
  // Agents for the completed session (sess_mock_003)
  {
    id: 'agent_mod_003',
    session_id: 'sess_mock_003',
    display_name: 'Nova',
    persona_description: 'A neutral moderator who structures the debate and keeps it on track.',
    expertise: 'Facilitation and structured debate',
    llm_provider: 'anthropic',
    llm_model: 'claude-opus-4-5',
    role: 'moderator',
  },
  {
    id: 'agent_scr_003',
    session_id: 'sess_mock_003',
    display_name: 'Lumen',
    persona_description: 'Captures the key points and synthesises conclusions.',
    expertise: 'Summarisation and synthesis',
    llm_provider: 'anthropic',
    llm_model: 'claude-sonnet-4-6',
    role: 'scribe',
  },
  {
    id: 'agent_par_003',
    session_id: 'sess_mock_003',
    display_name: 'The Open Advocate',
    persona_description: 'Strongly believes open source AI leads to better outcomes for humanity.',
    expertise: 'Open source software and collaborative development',
    llm_provider: 'openai',
    llm_model: 'gpt-4o',
    role: 'participant',
  },
  {
    id: 'agent_par_004',
    session_id: 'sess_mock_003',
    display_name: 'The Realist',
    persona_description: 'Argues that closed source AI allows for better safety and quality control.',
    expertise: 'Enterprise software and AI safety',
    llm_provider: 'anthropic',
    llm_model: 'claude-opus-4-5',
    role: 'participant',
  },
];

// ---------------------------------------------------------------------------
// Transcript fixture for the completed session (sess_mock_003)
// ---------------------------------------------------------------------------

const MOCK_TRANSCRIPT_003 = [
  {
    id: 'arg_003_001',
    agent_id: 'agent_mod_003',
    agent_name: 'Nova',
    round_index: 1,
    turn_index: 1,
    content:
      "Welcome to today's debate on open source versus closed source AI development. We'll explore both sides rigorously. The Realist will open, followed by The Open Advocate. Let us begin.",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 1).toISOString(),
  },
  {
    id: 'arg_003_002',
    agent_id: 'agent_par_004',
    agent_name: 'The Realist',
    round_index: 1,
    turn_index: 2,
    content:
      'Closed source AI allows organisations to invest heavily in safety measures, alignment research, and quality control without the risk of bad actors exploiting published model weights. The dual-use risk of open weights is not theoretical — we have already seen misuse of open models for disinformation and harmful content generation. Responsible release requires keeping sensitive capabilities behind controlled access.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 5).toISOString(),
  },
  {
    id: 'arg_003_003',
    agent_id: 'agent_par_003',
    agent_name: 'The Open Advocate',
    round_index: 1,
    turn_index: 3,
    content:
      "Open source AI democratises access to powerful tools, enabling researchers at underfunded institutions, independent developers, and civil society to audit, improve, and build upon frontier capabilities. History shows that open source software — from Linux to the web stack — enabled far more innovation than any closed alternative. The safety argument is weak because security through obscurity has never proven robust; adversaries will find exploits regardless.",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 10).toISOString(),
  },
  {
    id: 'arg_003_004',
    agent_id: 'agent_par_004',
    agent_name: 'The Realist',
    round_index: 2,
    turn_index: 1,
    content:
      "The Linux comparison is flawed. Operating system kernels don't carry the same dual-use risk as a model capable of generating bioweapon synthesis routes or targeted propaganda at scale. Closed source isn't security through obscurity — it's access control. You can audit safety practices without publishing weights. Responsible labs publish research, red-team findings, and safety evaluations. The weights themselves are a different matter.",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 15).toISOString(),
  },
  {
    id: 'arg_003_005',
    agent_id: 'agent_par_003',
    agent_name: 'The Open Advocate',
    round_index: 2,
    turn_index: 2,
    content:
      "That distinction is fair. I'll concede that frontier models with bioweapon-relevant knowledge deserve a different treatment. However, the vast majority of AI capability — language understanding, reasoning, coding assistance — does not fall into that category. A tiered approach could preserve open access for general-purpose models while imposing access controls on genuinely dangerous specialised capabilities. The debate shouldn't be binary.",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 20).toISOString(),
  },
  {
    id: 'arg_003_006',
    agent_id: 'agent_scr_003',
    agent_name: 'Lumen',
    round_index: 3,
    turn_index: 1,
    content:
      "I'm noting an emerging area of agreement: both participants accept that a binary open/closed dichotomy may be inadequate. The Realist acknowledges the value of open publication of safety research; The Open Advocate concedes that frontier dual-use models may warrant restricted access. The debate is converging towards a capability-tiered licensing framework.",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 25).toISOString(),
  },
  {
    id: 'arg_003_007',
    agent_id: 'agent_mod_003',
    agent_name: 'Nova',
    round_index: 3,
    turn_index: 2,
    content:
      'I concur with Lumen\'s synthesis. Both positions have converged on the principle that governance of AI development should be proportional to risk. I am declaring consensus on this core principle. Final remarks from each participant before Lumen produces the summary.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3 + 1000 * 60 * 30).toISOString(),
  },
];

const MOCK_PRESETS = [
  {
    id: 'preset_challenger',
    display_name: 'The Challenger',
    persona_description:
      'You actively contest prevailing positions, seeking logical weaknesses. You are rigorous and direct.',
    expertise: 'Critical analysis and logical argumentation',
    suggested_model: 'claude-opus-4-5',
  },
  {
    id: 'preset_pragmatist',
    display_name: 'The Pragmatist',
    persona_description:
      'You ground every argument in real-world constraints and practical feasibility. You push for actionable conclusions.',
    expertise: 'Policy, implementation, and systems thinking',
    suggested_model: 'gpt-4o',
  },
  {
    id: 'preset_ethicist',
    display_name: 'The Ethicist',
    persona_description:
      'You examine the moral dimensions of every proposal, considering fairness, rights, and long-term consequences.',
    expertise: 'Ethics, philosophy, and moral reasoning',
    suggested_model: 'claude-opus-4-5',
  },
  {
    id: 'preset_futurist',
    display_name: 'The Futurist',
    persona_description:
      'You think in decades and extrapolate current trends to anticipate second-order effects.',
    expertise: 'Technology forecasting and trend analysis',
    suggested_model: 'gpt-4o',
  },
  {
    id: 'preset_empiricist',
    display_name: 'The Empiricist',
    persona_description:
      'You demand evidence for every claim and are sceptical of reasoning that lacks empirical grounding.',
    expertise: 'Data analysis, research methodology, and evidence evaluation',
    suggested_model: 'claude-sonnet-4-6',
  },
];

// ---------------------------------------------------------------------------
// buildMockAgents — used by SPEC-105 live session UI for ad-hoc sessions
// ---------------------------------------------------------------------------

function buildMockAgents(sessionId: string): Agent[] {
    return [
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
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers = [
  http.get('/health', () => HttpResponse.json({ status: 'ok' })),

  http.get('/sessions', () =>
    HttpResponse.json({ sessions: MOCK_SESSIONS })
  ),

  http.post('/sessions', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const agentsInput = (body.agents as Array<Record<string, unknown>>) ?? [];
    const newId = `sess_mock_${Date.now()}`;
    const newSession = {
      id: newId,
      topic: (body.topic as string) ?? 'Untitled Session',
      supporting_context: (body.supporting_context as string | undefined) ?? '',
      status: 'configured',
      config: body.config ?? {
        max_rounds: 10,
        convergence_majority: 0.6,
        priority_weights: { recency: 0.4, novelty: 0.4, role: 0.2 },
        thought_inspector_enabled: false,
      },
      created_at: new Date().toISOString(),
      ended_at: null,
      termination_reason: null,
      rounds_elapsed: 0,
      agent_count: agentsInput.length,
      agents: agentsInput.map((a, i) => ({
        ...a,
        id: `agent_new_${i}_${Date.now()}`,
        session_id: newId,
      })),
    };
    return HttpResponse.json(newSession, { status: 201 });
  }),

  http.post('/sessions/:id/start', () =>
    HttpResponse.json({ session_id: 'sess_mock_001', status: 'running' }, { status: 202 })
  ),

  http.get('/sessions/:id', ({ params }) => {
    const id = String(params.id);
    const fixture = MOCK_SESSIONS.find((s) => s.id === id);
    const fixtureAgents = MOCK_AGENTS.filter((a) => a.session_id === id);

    if (fixture) {
      return HttpResponse.json({ ...fixture, agents: fixtureAgents });
    }

    // Fallback for dynamically created sessions (SPEC-105 live session UI)
    const agents = buildMockAgents(id);
    return HttpResponse.json({
      id,
      topic: 'Should we split our API into microservices?',
      supporting_context: 'Current product has 50k MAU with a 4-person team.',
      status: 'running',
      config: {
        max_rounds: 3,
        convergence_majority: 0.7,
        priority_weights: { recency: 1.0, novelty: 1.0, role: 1.0 },
        thought_inspector_enabled: false,
      },
      created_at: new Date().toISOString(),
      ended_at: null,
      termination_reason: null,
      rounds_elapsed: 1,
      agent_count: agents.length,
      agents,
    });
  }),

  http.get('/sessions/:id/transcript', ({ params }) => {
    const id = String(params.id);
    if (id === 'sess_mock_003') {
      return HttpResponse.json({ session_id: id, arguments: MOCK_TRANSCRIPT_003 });
    }
    return HttpResponse.json({ session_id: id, arguments: [] });
  }),

  http.get('/sessions/:id/thoughts', ({ params }) =>
    HttpResponse.json({ session_id: params.id, thoughts: [] })
  ),

  http.get('/sessions/:id/queue', ({ params }) =>
    HttpResponse.json({ session_id: params.id, queue: [] })
  ),

  http.post('/sessions/:id/pause', () => HttpResponse.json({ status: 'paused' })),

  http.post('/sessions/:id/resume', () => HttpResponse.json({ status: 'running' })),

  http.post('/sessions/:id/end', () => HttpResponse.json({ status: 'ending' })),

  http.get('/sessions/:id/summary', ({ params }) => {
    const id = String(params.id);
    if (id === 'sess_mock_003') {
      return HttpResponse.json({
        id: 'sum_mock_003',
        session_id: id,
        termination_reason: 'consensus',
        content:
          '## Summary\n\nThe debate converged on a nuanced position: the binary open/closed framing is inadequate for governing AI development.\n\n**Key points of agreement:**\n- General-purpose models (coding, language, reasoning) benefit from open release and community auditing\n- Frontier dual-use models with potential for mass-harm (e.g. bioweapons uplift) warrant access controls\n- Safety research, red-team findings, and evaluations should remain publicly available regardless of weight access\n\n**Conclusion:** A capability-tiered licensing framework — open weights for low-risk models, restricted access for high-risk dual-use capabilities — emerged as the consensus position. Both participants acknowledged that proportionality to risk, rather than uniform openness or uniform restriction, is the correct governance principle.',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      });
    }
    return HttpResponse.json({
      id: 'sum_mock_001',
      session_id: id,
      termination_reason: 'consensus',
      content:
        '## Summary\n\nAfter structured debate, participants reached consensus that AI regulation requires a multi-stakeholder approach combining government oversight with industry self-regulation.',
      created_at: new Date().toISOString(),
    });
  }),

  http.get('/agents/presets', () =>
    HttpResponse.json({ presets: MOCK_PRESETS })
  ),
];
