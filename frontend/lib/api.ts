import {
    CreateSessionRequest,
    StartSessionRequest,
    SessionResponse,
    SessionsListResponse,
    TranscriptResponse,
    ThoughtsResponse,
    QueueResponse,
    SummaryResponse,
    PresetsResponse,
    CreatePresetRequest,
    CreateTemplateRequest,
    TemplatesResponse,
    SaveAsTemplateRequest,
} from 'shared/types/api';
import { AgentPreset } from 'shared/types/agent';
import { SessionTemplate } from 'shared/types/session';

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
        let message = res.statusText;
        try {
            const body = await res.json();
            if (typeof body.detail === 'string') message = body.detail;
            else if (Array.isArray(body.detail)) message = body.detail.map((e: { msg: string }) => e.msg).join('; ');
        } catch {
            // body wasn't JSON, use statusText
        }
        throw new Error(`API Error ${res.status}: ${message}`);
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
    deleteSession: (id: string) => fetchApi<void>(`/sessions/${id}`, { method: 'DELETE' }),
    getSummary: (id: string) => fetchApi<SummaryResponse>(`/sessions/${id}/summary`),
    getPresets: () => fetchApi<PresetsResponse>('/agents/presets'),
    createPreset: (data: CreatePresetRequest) => fetchApi<AgentPreset>('/agents/presets', { method: 'POST', body: JSON.stringify(data) }),
    deletePreset: (id: string) => fetchApi<void>(`/agents/presets/${id}`, { method: 'DELETE' }),
    getSessions: () => fetchApi<SessionsListResponse>('/sessions'),
    getTemplates: () => fetchApi<TemplatesResponse>('/sessions/templates'),
    createTemplate: (data: CreateTemplateRequest) => fetchApi<SessionTemplate>('/sessions/templates', { method: 'POST', body: JSON.stringify(data) }),
    deleteTemplate: (id: string) => fetchApi<void>(`/sessions/templates/${id}`, { method: 'DELETE' }),
    saveSessionAsTemplate: (sessionId: string, data: SaveAsTemplateRequest) => fetchApi<SessionTemplate>(`/sessions/${sessionId}/save-as-template`, { method: 'POST', body: JSON.stringify(data) }),
};
