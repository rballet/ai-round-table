import { http, HttpResponse } from 'msw';

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

const MOCK_AGENTS = [
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
    const session = MOCK_SESSIONS.find((s) => s.id === params.id) ?? {
      id: params.id,
      topic: 'Mock Discussion Topic',
      status: 'configured',
      config: {
        max_rounds: 10,
        convergence_majority: 0.6,
        priority_weights: { recency: 0.4, novelty: 0.4, role: 0.2 },
        thought_inspector_enabled: false,
      },
      created_at: new Date().toISOString(),
      ended_at: null,
      termination_reason: null,
      rounds_elapsed: 0,
      agent_count: 0,
    };
    const agents = MOCK_AGENTS.filter((a) => a.session_id === params.id);
    return HttpResponse.json({ ...session, agents });
  }),

  http.get('/sessions/:id/transcript', ({ params }) =>
    HttpResponse.json({ session_id: params.id, arguments: [] })
  ),

  http.get('/sessions/:id/thoughts', ({ params }) =>
    HttpResponse.json({ session_id: params.id, thoughts: [] })
  ),

  http.get('/sessions/:id/queue', ({ params }) =>
    HttpResponse.json({ session_id: params.id, queue: [] })
  ),

  http.post('/sessions/:id/pause', () => HttpResponse.json({ status: 'paused' })),

  http.post('/sessions/:id/resume', () => HttpResponse.json({ status: 'running' })),

  http.post('/sessions/:id/end', () => HttpResponse.json({ status: 'ending' })),

  http.get('/sessions/:id/summary', ({ params }) =>
    HttpResponse.json({
      id: 'sum_mock_001',
      session_id: params.id,
      termination_reason: 'consensus',
      content:
        '## Summary\n\nAfter structured debate, participants reached consensus that AI regulation requires a multi-stakeholder approach combining government oversight with industry self-regulation.',
      created_at: new Date().toISOString(),
    })
  ),

  http.get('/agents/presets', () =>
    HttpResponse.json({ presets: MOCK_PRESETS })
  ),
];
