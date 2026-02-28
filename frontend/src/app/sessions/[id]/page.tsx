'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import { RoundTable } from '@/components/table/RoundTable';
import { QueuePanel } from '@/components/table/QueuePanel';
import { ArgumentFeed } from '@/components/feed/ArgumentFeed';
import { SessionStatus } from '@/components/controls/SessionStatus';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSessionStore } from '@/store/sessionStore';
import type { SessionStoreState } from '@/store/sessionStore';

const selectSession = (s: SessionStoreState) => s.session;
const selectAgents = (s: SessionStoreState) => s.agents;
const selectArguments = (s: SessionStoreState) => s.arguments;
const selectQueue = (s: SessionStoreState) => s.queue;
const selectAgentStatuses = (s: SessionStoreState) => s.agentStatuses;
const selectRaisedHands = (s: SessionStoreState) => s.raisedHands;
const selectActiveAgentId = (s: SessionStoreState) => s.activeAgentId;
const selectCurrentRound = (s: SessionStoreState) => s.currentRound;
const selectCurrentTurn = (s: SessionStoreState) => s.currentTurn;
const selectConvergenceStatus = (s: SessionStoreState) => s.convergenceStatus;
const selectInitializeSession = (s: SessionStoreState) => s.initializeSession;

export default function LiveSessionPage() {
  const params = useParams<{ id: string | string[] }>();
  const sessionId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : raw ?? null;
  }, [params]);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [startPrompt, setStartPrompt] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const session = useSessionStore(selectSession);
  const agents = useSessionStore(selectAgents);
  const argumentsList = useSessionStore(selectArguments);
  const queue = useSessionStore(selectQueue);
  const agentStatuses = useSessionStore(selectAgentStatuses);
  const raisedHands = useSessionStore(selectRaisedHands);
  const activeAgentId = useSessionStore(selectActiveAgentId);
  const currentRound = useSessionStore(selectCurrentRound);
  const currentTurn = useSessionStore(selectCurrentTurn);
  const convergenceStatus = useSessionStore(selectConvergenceStatus);
  const initializeSession = useSessionStore(selectInitializeSession);

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
        setStartPrompt(response.topic);
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

  const handleStartSession = useCallback(async () => {
    if (!sessionId) return;
    setIsStarting(true);
    setStartError(null);
    try {
      await api.startSession(sessionId, { prompt: startPrompt || session?.topic || '' });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setIsStarting(false);
    }
  }, [sessionId, startPrompt, session?.topic]);

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

  const isConfigured = session?.status === 'configured';

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
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                session?.status === 'running'
                  ? 'bg-blue-100 text-blue-700'
                  : session?.status === 'ended'
                  ? 'bg-slate-100 text-slate-600'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {session?.status}
            </span>
          </div>
          {connectionError && <p className="text-xs text-rose-600">{connectionError}</p>}
        </header>

        {/* Start Session panel — only shown when session is in configured state */}
        {isConfigured && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-amber-900">Ready to start</h2>
              <p className="text-xs text-amber-700 mt-0.5">
                Set the opening prompt that will be posed to all agents, then start the discussion.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="start-prompt" className="block text-xs font-medium text-amber-900">
                Opening Prompt
              </label>
              <textarea
                id="start-prompt"
                rows={3}
                value={startPrompt}
                onChange={(e) => setStartPrompt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
                placeholder="What question or framing should the agents debate?"
              />
            </div>
            {startError && (
              <p className="text-xs text-rose-700">{startError}</p>
            )}
            <button
              type="button"
              onClick={handleStartSession}
              disabled={isStarting || !startPrompt.trim()}
              className="px-5 py-2 rounded-lg bg-amber-900 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isStarting ? 'Starting…' : 'Start Discussion'}
            </button>
          </div>
        )}

        {session && (
          <SessionStatus
            status={session.status}
            currentRound={currentRound}
            currentTurn={currentTurn}
            maxRounds={session.config.max_rounds}
            convergenceStatus={convergenceStatus}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section className="space-y-4">
            <RoundTable
              agents={agents}
              agentStatuses={agentStatuses}
              raisedHands={raisedHands}
              activeAgentId={activeAgentId}
            />
            <QueuePanel queue={queue} />
          </section>

          <ArgumentFeed argumentsList={argumentsList} />
        </div>
      </div>
    </main>
  );
}
