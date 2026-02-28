'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import { RoundTable } from '@/components/table/RoundTable';
import { ArgumentFeed } from '@/components/feed/ArgumentFeed';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSessionStore } from '@/store/sessionStore';

export default function LiveSessionPage() {
  const params = useParams<{ id: string | string[] }>();
  const sessionId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : raw ?? null;
  }, [params]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const session = useSessionStore((state) => state.session);
  const agents = useSessionStore((state) => state.agents);
  const argumentsList = useSessionStore((state) => state.arguments);
  const queue = useSessionStore((state) => state.queue);
  const agentStatuses = useSessionStore((state) => state.agentStatuses);
  const initializeSession = useSessionStore((state) => state.initializeSession);

  const { isConnected, connectionError } = useWebSocket(sessionId);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let mounted = true;

    api
      .getSession(sessionId)
      .then((response) => {
        if (!mounted) {
          return;
        }
        initializeSession(response);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : 'Failed to load session');
      });

    return () => {
      mounted = false;
    };
  }, [sessionId, initializeSession]);

  if (!sessionId) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <p className="mx-auto max-w-6xl rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Missing session id
        </p>
      </main>
    );
  }

  if (!session && !loadError) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <p className="mx-auto max-w-6xl text-sm text-slate-500">Loading live session...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <p className="mx-auto max-w-6xl rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {loadError}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{session?.topic ?? 'Live Session'}</h1>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
              Session {sessionId}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {isConnected ? 'WS Connected' : 'WS Disconnected'}
            </span>
          </div>
          {connectionError && <p className="text-xs text-rose-600">{connectionError}</p>}
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section className="space-y-4">
            <RoundTable agents={agents} agentStatuses={agentStatuses} />
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Queue Snapshot</h2>
              {queue.length > 0 ? (
                <ul className="space-y-1 text-sm text-slate-700">
                  {queue.map((entry) => (
                    <li key={`${entry.agent_id}-${entry.position}`}>
                      {entry.position}. {entry.agent_name ?? entry.agent_id} ({entry.priority_score.toFixed(2)})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Queue is empty.</p>
              )}
            </div>
          </section>

          <ArgumentFeed argumentsList={argumentsList} />
        </div>
      </div>
    </main>
  );
}
