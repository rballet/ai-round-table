import { http, HttpResponse } from 'msw';

export const handlers = [
    http.get('/health', () => HttpResponse.json({ status: 'ok' })),

    http.get('/sessions', () => HttpResponse.json({ sessions: [] })),

    http.post('/sessions', () => HttpResponse.json({
        id: "sess_mock_123",
        status: "configured",
        created_at: new Date().toISOString()
    }, { status: 201 })),

    http.post('/sessions/:id/start', () => HttpResponse.json({
        session_id: "sess_mock_123",
        status: "running"
    }, { status: 202 })),

    http.get('/sessions/:id', ({ params }) => HttpResponse.json({
        id: params.id,
        topic: "Mocked discussion topic",
        status: "running",
        config: {},
        agents: [],
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
