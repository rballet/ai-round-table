'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/../lib/api';
import { useSessionStore } from '@/store/sessionStore';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SessionDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { currentSession, currentAgents, setCurrentSession, setCurrentAgents } = useSessionStore();

  useEffect(() => {
    api
      .getSession(id)
      .then((res) => {
        setCurrentSession(res);
        setCurrentAgents(res.agents);
      })
      .catch(console.error);
  }, [id, setCurrentSession, setCurrentAgents]);

  if (!currentSession) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
        <div className="space-y-3 text-center" role="status" aria-label="Loading session">
          <div className="w-10 h-10 rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-white animate-spin mx-auto" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href="/"
            className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900 rounded"
            aria-label="Back to sessions list"
          >
            Sessions
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-900 dark:text-white font-medium truncate max-w-xs">
            {currentSession.topic}
          </span>
        </nav>

        {/* Session header */}
        <header className="space-y-3">
          <div className="flex items-start gap-3">
            <h1 className="text-2xl font-bold tracking-tight flex-1">{currentSession.topic}</h1>
            <StatusBadge status={currentSession.status} />
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-zinc-500 dark:text-zinc-400">
            <span>Session ID: <code className="font-mono text-xs">{currentSession.id}</code></span>
            {currentSession.agent_count !== undefined && (
              <span>{currentSession.agent_count} agent{currentSession.agent_count !== 1 ? 's' : ''}</span>
            )}
            {currentSession.rounds_elapsed !== undefined && (
              <span>Round {currentSession.rounds_elapsed} / {currentSession.config.max_rounds}</span>
            )}
          </div>
        </header>

        {/* Placeholder notice */}
        <div
          className="p-6 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-center space-y-2"
          aria-label="Live session UI coming soon"
        >
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Live session view
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            The full round table UI is built in SPEC-105. This placeholder confirms the session was created successfully.
          </p>
        </div>

        {/* Agents list */}
        {currentAgents.length > 0 && (
          <section aria-label="Agent roster">
            <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
              Agents ({currentAgents.length})
            </h2>
            <ul className="space-y-2" role="list">
              {currentAgents.map((agent) => (
                <li
                  key={agent.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {agent.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{agent.display_name}</p>
                    {agent.expertise && (
                      <p className="text-xs text-zinc-400 truncate">{agent.expertise}</p>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400 font-mono">{agent.role}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Aria live region for status announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" id="status-announcer" />
    </main>
  );
}
