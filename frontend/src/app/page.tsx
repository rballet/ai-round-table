'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/../lib/api';
import { useSessionStore } from '@/store/sessionStore';
import { StatusBadge } from '@/components/ui/StatusBadge';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionListPage() {
  const { sessions, sessionsLoading, sessionsError, setSessions, setSessionsLoading, setSessionsError } =
    useSessionStore();

  useEffect(() => {
    setSessionsLoading(true);
    setSessionsError(null);
    api
      .getSessions()
      .then((res) => setSessions(res.sessions))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load sessions';
        setSessionsError(message);
      })
      .finally(() => setSessionsLoading(false));
  }, [setSessions, setSessionsLoading, setSessionsError]);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI Round Table</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Structured AI discussions, managed debates.
            </p>
          </div>
          <Link
            href="/sessions/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            aria-label="Create a new session"
          >
            <span aria-hidden="true">+</span>
            New Session
          </Link>
        </header>

        {/* Content */}
        {sessionsLoading && (
          <div className="space-y-3" aria-label="Loading sessions" role="status">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse"
              />
            ))}
          </div>
        )}

        {sessionsError && !sessionsLoading && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm"
          >
            {sessionsError}
          </div>
        )}

        {!sessionsLoading && !sessionsError && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-2xl" aria-hidden="true">
              &#9675;
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">No sessions yet</p>
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              Create your first session to start a structured AI debate.
            </p>
            <Link
              href="/sessions/new"
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity"
              aria-label="Create your first session"
            >
              + New Session
            </Link>
          </div>
        )}

        {!sessionsLoading && !sessionsError && sessions.length > 0 && (
          <section aria-label="Sessions list">
            <AnimatePresence initial={false}>
              <ul className="space-y-3" role="list">
                {sessions.map((session) => (
                  <motion.li
                    key={session.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Link
                      href={`/sessions/${session.id}`}
                      className="block p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                      aria-label={`Session: ${session.topic}, status: ${session.status}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base truncate">{session.topic}</p>
                          <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                            <span>Created {formatDate(session.created_at)}</span>
                            {session.agent_count !== undefined && (
                              <span>{session.agent_count} agent{session.agent_count !== 1 ? 's' : ''}</span>
                            )}
                            {session.rounds_elapsed !== undefined && (
                              <span>Round {session.rounds_elapsed} / {session.config.max_rounds}</span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={session.status} />
                      </div>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </AnimatePresence>
          </section>
        )}
      </div>
    </main>
  );
}
