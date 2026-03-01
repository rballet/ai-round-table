'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../../lib/api';
import { RoundTable } from '@/components/table/RoundTable';
import { QueuePanel } from '@/components/table/QueuePanel';
import { ThoughtInspector } from '@/components/table/ThoughtInspector';
import { ArgumentFeed } from '@/components/feed/ArgumentFeed';
import { SummaryPanel } from '@/components/feed/SummaryPanel';
import { SessionStatus } from '@/components/controls/SessionStatus';
import { ToastContainer } from '@/components/ui/Toast';
import { CompletedSessionView } from '@/components/history/CompletedSessionView';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSessionStore } from '@/store/sessionStore';
import type { SessionStoreState } from '@/store/sessionStore';
import type { SessionResponse, TranscriptResponse, SummaryResponse } from 'shared/types/api';

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
const selectSummary = (s: SessionStoreState) => s.summary;
const selectSummaryPanelOpen = (s: SessionStoreState) => s.summaryPanelOpen;
const selectOpenSummaryPanel = (s: SessionStoreState) => s.openSummaryPanel;
const selectCloseSummaryPanel = (s: SessionStoreState) => s.closeSummaryPanel;
const selectInitializeSession = (s: SessionStoreState) => s.initializeSession;
const selectSetSummary = (s: SessionStoreState) => s.setSummary;
const selectAgentThoughts = (s: SessionStoreState) => s.agentThoughts;
const selectThoughtInspectorEnabled = (s: SessionStoreState) => s.thoughtInspectorEnabled;
const selectSetAgentThoughts = (s: SessionStoreState) => s.setAgentThoughts;
const selectErrors = (s: SessionStoreState) => s.errors;
const selectClearError = (s: SessionStoreState) => s.clearError;
const selectLoadWizardFromTemplate = (s: SessionStoreState) => s.loadWizardFromTemplate;

// ---------------------------------------------------------------------------
// Completed session loader — fetches transcript + summary outside of the store
// ---------------------------------------------------------------------------

interface CompletedData {
  sessionResponse: SessionResponse;
  transcript: TranscriptResponse | null;
  summary: SummaryResponse | null;
}

function useCompletedSession(sessionId: string | null) {
  const [data, setData] = useState<CompletedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    let mounted = true;
    setLoading(true);
    setError(null);

    api
      .getSession(sessionId)
      .then(async (sessionRes) => {
        if (!mounted) return;
        if (sessionRes.status !== 'ended') {
          // Not a completed session; caller will handle the live path
          setData({ sessionResponse: sessionRes, transcript: null, summary: null });
          return;
        }

        const [transcriptRes, summaryRes] = await Promise.allSettled([
          api.getTranscript(sessionId),
          api.getSummary(sessionId),
        ]);

        if (!mounted) return;

        setData({
          sessionResponse: sessionRes,
          transcript: transcriptRes.status === 'fulfilled' ? transcriptRes.value : null,
          summary: summaryRes.status === 'fulfilled' ? summaryRes.value : null,
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load session');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [sessionId]);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// Live session inner component — only mounts when status is NOT 'ended'
// ---------------------------------------------------------------------------

interface LiveSessionInnerProps {
  sessionId: string;
  initialSession?: SessionResponse;
}

function LiveSessionInner({ sessionId, initialSession }: LiveSessionInnerProps) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startPrompt, setStartPrompt] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [thoughtInspectorOpen, setThoughtInspectorOpen] = useState(true);

  const router = useRouter();
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
  const summary = useSessionStore(selectSummary);
  const summaryPanelOpen = useSessionStore(selectSummaryPanelOpen);
  const openSummaryPanel = useSessionStore(selectOpenSummaryPanel);
  const closeSummaryPanel = useSessionStore(selectCloseSummaryPanel);
  const initializeSession = useSessionStore(selectInitializeSession);
  const setSummary = useSessionStore(selectSetSummary);
  const agentThoughts = useSessionStore(selectAgentThoughts);
  const thoughtInspectorEnabled = useSessionStore(selectThoughtInspectorEnabled);
  const setAgentThoughts = useSessionStore(selectSetAgentThoughts);
  const errors = useSessionStore(selectErrors);
  const clearError = useSessionStore(selectClearError);
  const loadWizardFromTemplate = useSessionStore(selectLoadWizardFromTemplate);

  const { isConnected, connectionError } = useWebSocket(sessionId);

  useEffect(() => {
    let mounted = true;

    const handleResponse = (response: SessionResponse) => {
      if (!mounted) return;
      initializeSession(response);
      setStartPrompt(response.topic);

      if (response.status === 'ended') {
        api
          .getSummary(sessionId)
          .then((summaryRes) => {
            if (mounted) {
              setSummary({
                id: summaryRes.id,
                content: summaryRes.content,
                termination_reason: summaryRes.termination_reason as 'consensus' | 'cap' | 'host' | 'error',
              });
            }
          })
          .catch((err) => {
            console.error('Failed to load summary for ended session:', err);
          });
      }

      if (response.config.thought_inspector_enabled) {
        api
          .getThoughts(sessionId)
          .then((thoughtsRes) => {
            if (mounted && thoughtsRes.thoughts.length > 0) {
              setAgentThoughts(
                thoughtsRes.thoughts.map((t) => ({
                  id: t.id,
                  agent_id: t.agent_id,
                  version: t.version,
                  content: t.content,
                }))
              );
            }
          })
          .catch((err) => {
            console.error('Failed to load thoughts for session:', err);
          });
      }
    };

    if (initialSession) {
      handleResponse(initialSession);
    } else {
      api
        .getSession(sessionId)
        .then(handleResponse)
        .catch((error) => {
          if (!mounted) return;
          setLoadError(error instanceof Error ? error.message : 'Failed to load session');
        });
    }

    return () => {
      mounted = false;
    };
  }, [sessionId, initialSession, initializeSession, setSummary, setAgentThoughts]);

  const handleStartSession = useCallback(async () => {
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

  const handlePauseSession = useCallback(async () => {
    try {
      await api.pauseSession(sessionId);
    } catch (err) {
      console.error('Failed to pause session:', err);
    }
  }, [sessionId]);

  const handleResumeSession = useCallback(async () => {
    try {
      await api.resumeSession(sessionId);
    } catch (err) {
      console.error('Failed to resume session:', err);
    }
  }, [sessionId]);

  const handleEndSession = useCallback(async () => {
    try {
      await api.endSession(sessionId);
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  }, [sessionId]);

  const handleDeleteSession = useCallback(async () => {
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) return;
    try {
      await api.deleteSession(sessionId);
      router.push('/');
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [sessionId, router]);

  const handleReuseConfig = useCallback(() => {
    if (!session) return;
    loadWizardFromTemplate({
      id: '',
      name: session.topic,
      agents: session.agents.map((a) => ({
        display_name: a.display_name,
        persona_description: a.persona_description,
        expertise: a.expertise,
        llm_provider: a.llm_provider,
        llm_model: a.llm_model,
        llm_config: a.llm_config,
        role: a.role,
      })),
      config: session.config,
      created_at: session.created_at,
    });
    router.push('/sessions/new');
  }, [session, loadWizardFromTemplate, router]);

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
  const canShowSummaryButton = (session?.status === 'ended' || Boolean(summary)) && !summaryPanelOpen;

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
              className={`rounded-full px-2 py-0.5 text-xs ${isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                }`}
            >
              {isConnected ? 'WS Connected' : 'WS Disconnected'}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${session?.status === 'running'
                ? 'bg-blue-100 text-blue-700'
                : session?.status === 'ended'
                  ? 'bg-slate-100 text-slate-600'
                  : 'bg-amber-50 text-amber-700'
                }`}
            >
              {session?.status}
            </span>
            {canShowSummaryButton && (
              <button
                type="button"
                onClick={openSummaryPanel}
                className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-800 hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700"
              >
                View Summary
              </button>
            )}
            {session?.status === 'running' && (
              <button
                type="button"
                onClick={handlePauseSession}
                className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 hover:bg-violet-200"
              >
                Pause
              </button>
            )}
            {session?.status === 'paused' && (
              <button
                type="button"
                onClick={handleResumeSession}
                className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200"
              >
                Resume
              </button>
            )}
            {(session?.status === 'running' || session?.status === 'paused') && (
              <button
                type="button"
                onClick={handleEndSession}
                className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 hover:bg-rose-200"
              >
                Force End
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleReuseConfig}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              aria-label="Reuse this session's agent configuration in a new session"
            >
              Reuse Config
            </button>
            <Link
              href="/sessions/new"
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200"
            >
              New Session
            </Link>
            <button
              type="button"
              onClick={handleDeleteSession}
              className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800 hover:bg-rose-200"
            >
              Delete Session
            </button>
          </div>
          {connectionError && <p className="text-xs text-rose-600">{connectionError}</p>}
        </header>

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
            {thoughtInspectorEnabled && (
              <ThoughtInspector
                agents={agents}
                agentThoughts={agentThoughts}
                isOpen={thoughtInspectorOpen}
                onToggle={() => setThoughtInspectorOpen((prev) => !prev)}
              />
            )}
          </section>

          <ArgumentFeed argumentsList={argumentsList} errors={errors} agents={agents} />
        </div>
      </div>

      <SummaryPanel
        isOpen={summaryPanelOpen}
        summary={summary}
        terminationReason={session?.termination_reason ?? null}
        onClose={closeSummaryPanel}
      />

      <ToastContainer errors={errors} onDismiss={clearError} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Page component — branches on session status
// ---------------------------------------------------------------------------

export default function SessionPage() {
  const params = useParams<{ id: string | string[] }>();
  const router = useRouter();
  const sessionId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : raw ?? null;
  }, [params]);

  const { data, loading, error } = useCompletedSession(sessionId);

  const handleDeleteCompleted = useCallback(async () => {
    if (!sessionId) return;
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) return;
    try {
      await api.deleteSession(sessionId);
      router.push('/');
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [sessionId, router]);

  if (!sessionId) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <p className="mx-auto max-w-6xl rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Missing session id
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-6 py-10">
        <div className="max-w-5xl mx-auto space-y-3" role="status" aria-label="Loading session">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse"
            />
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <p className="mx-auto max-w-6xl rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      </main>
    );
  }

  // Route to read-only completed view for ended sessions
  if (data?.sessionResponse.status === 'ended') {
    return (
      <CompletedSessionView
        session={data.sessionResponse}
        transcript={data.transcript}
        summary={data.summary}
        onDelete={handleDeleteCompleted}
      />
    );
  }

  // Live session path — WS connection happens inside LiveSessionInner.
  // Pass the already-fetched session to avoid a second api.getSession() call.
  return <LiveSessionInner sessionId={sessionId} initialSession={data?.sessionResponse} />;
}
