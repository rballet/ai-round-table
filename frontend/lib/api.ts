import {
    CreateSessionRequest,
    StartSessionRequest,
    SessionResponse,
    SessionsListResponse,
    TranscriptResponse,
    ThoughtsResponse,
    QueueResponse,
    SummaryResponse,
    PresetsResponse
} from 'shared/types/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const isMock = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
    const url = isMock ? path : `${API_URL}${path}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!res.ok) {
        throw new Error(`API Error: ${res.statusText}`);
    }

    if (res.status === 204 || res.headers.get('content-length') === '0') {
        return {} as T;
    }

    return res.json();
}

export const api = {
    createSession: (data: CreateSessionRequest) => fetchApi<SessionResponse>('/sessions', { method: 'POST', body: JSON.stringify(data) }),
    startSession: (id: string, data: StartSessionRequest) => fetchApi<{ session_id: string; status: string }>(`/sessions/${id}/start`, { method: 'POST', body: JSON.stringify(data) }),
    getSession: (id: string) => fetchApi<SessionResponse>(`/sessions/${id}`),
    getTranscript: (id: string) => fetchApi<TranscriptResponse>(`/sessions/${id}/transcript`),
    getThoughts: (id: string) => fetchApi<ThoughtsResponse>(`/sessions/${id}/thoughts`),
    getQueue: (id: string) => fetchApi<QueueResponse>(`/sessions/${id}/queue`),
    pauseSession: (id: string) => fetchApi<{ status: string }>(`/sessions/${id}/pause`, { method: 'POST' }),
    resumeSession: (id: string) => fetchApi<{ status: string }>(`/sessions/${id}/resume`, { method: 'POST' }),
    endSession: (id: string) => fetchApi<{ status: string }>(`/sessions/${id}/end`, { method: 'POST' }),
    getSummary: (id: string) => fetchApi<SummaryResponse>(`/sessions/${id}/summary`),
    getPresets: () => fetchApi<PresetsResponse>('/agents/presets'),
    getSessions: () => fetchApi<SessionsListResponse>('/sessions'),
};
