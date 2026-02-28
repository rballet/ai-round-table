import { http, HttpResponse } from 'msw';

export const handlers = [
    http.get('/health', () => HttpResponse.json({ status: 'ok' })),

    http.get('/sessions', () => HttpResponse.json({ sessions: [] })),

    http.post('/sessions', async ({ request }) => {
        const body = await request.json() as { topic?: string; supporting_context?: string; config?: object };
        return HttpResponse.json({
            id: "sess_mock_123",
            topic: body.topic ?? "Mocked discussion topic",
            supporting_context: body.supporting_context ?? null,
            status: "configured",
            config: body.config ?? {
                max_rounds: 10,
                convergence_majority: 0.7,
                priority_weights: { recency: 1.0, novelty: 1.0, role: 1.0 },
                thought_inspector_enabled: false
            },
            created_at: new Date().toISOString(),
            ended_at: null,
            termination_reason: null,
            agents: []
        }, { status: 201 });
    }),

    http.post('/sessions/:id/start', () => HttpResponse.json({
        session_id: "sess_mock_123",
        status: "running"
    }, { status: 202 })),

    http.get('/sessions/:id', ({ params }) => HttpResponse.json({
        id: params.id,
        topic: "Mocked discussion topic",
        supporting_context: null,
        status: "running",
        config: {
            max_rounds: 10,
            convergence_majority: 0.7,
            priority_weights: { recency: 1.0, novelty: 1.0, role: 1.0 },
            thought_inspector_enabled: false
        },
        created_at: new Date().toISOString(),
        ended_at: null,
        termination_reason: null,
        rounds_elapsed: 0,
        agent_count: 0,
        agents: []
    })),

    // New mocks
    http.get('/sessions/:id/transcript', ({ params }) => HttpResponse.json({
        session_id: params.id,
        arguments: []
    })),

    http.get('/sessions/:id/thoughts', ({ params }) => HttpResponse.json({
        session_id: params.id,
        thoughts: []
    })),

    http.get('/sessions/:id/queue', ({ params }) => HttpResponse.json({
        session_id: params.id,
        queue: []
    })),

    http.post('/sessions/:id/pause', () => HttpResponse.json({
        status: "paused"
    })),

    http.post('/sessions/:id/resume', () => HttpResponse.json({
        status: "running"
    })),

    http.post('/sessions/:id/end', () => HttpResponse.json({
        status: "ending"
    })),

    http.get('/sessions/:id/summary', ({ params }) => HttpResponse.json({
        id: "sum_mock_123",
        session_id: params.id,
        termination_reason: "consensus",
        content: "## Mock Summary\n\nDiscussion concluded.",
        created_at: new Date().toISOString()
    })),

    http.get('/agents/presets', () => HttpResponse.json({
        presets: [
            {
                id: "challenger",
                display_name: "The Challenger",
                persona_description: "You actively contest prevailing positions...",
                expertise: "Critical analysis",
                suggested_model: "claude-opus-4-5"
            }
        ]
    }))
];
