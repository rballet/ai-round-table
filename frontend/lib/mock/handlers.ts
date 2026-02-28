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

    // Add more fixture responses corresponding to your endpoints here
];
