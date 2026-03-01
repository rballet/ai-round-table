'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/../lib/api';
import { useSessionStore } from '@/store/sessionStore';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { SessionStatus } from 'shared/types/session';

type FilterStatus = 'all' | SessionStatus;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TERMINATION_LABELS: Record<string, string> = {
  consensus: 'Consensus',
  cap: 'Round Cap',
  host: 'Host End',
};

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'configured', label: 'Configured' },
  { value: 'running', label: 'Running' },
  { value: 'paused', label: 'Paused' },
  { value: 'ended', label: 'Ended' },
];

export default function SessionListPage() {
  const { sessions, sessionsLoading, sessionsError, setSessions, setSessionsLoading, setSessionsError } =
    useSessionStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');

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

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
      const matchesSearch =
        searchQuery.trim() === '' ||
        session.topic.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [sessions, statusFilter, searchQuery]);

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

        {/* Search and filter controls */}
        {!sessionsLoading && !sessionsError && sessions.length > 0 && (
          <div className="space-y-3">
            <div className="relative">
              <label htmlFor="session-search" className="sr-only">
                Search sessions by topic
              </label>
              <span
                className="absolute inset-y-0 left-3 flex items-center text-zinc-400 pointer-events-none"
                aria-hidden="true"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </span>
              <input
                id="session-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by topic..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            </div>

            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter sessions by status"
            >
              {STATUS_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  aria-pressed={statusFilter === value}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${
                    statusFilter === value
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                      : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

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

        {!sessionsLoading && !sessionsError && sessions.length > 0 && filteredSessions.length === 0 && (
          <div className="py-12 text-center space-y-2">
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">No sessions match your filters</p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
              className="text-sm text-zinc-400 dark:text-zinc-500 underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Clear filters
            </button>
          </div>
        )}

        {!sessionsLoading && !sessionsError && filteredSessions.length > 0 && (
          <section aria-label="Sessions list">
            <AnimatePresence initial={false}>
              <ul className="space-y-3" role="list">
                {filteredSessions.map((session) => (
                  <motion.li
                    key={session.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="relative group">
                      <Link
                        href={`/sessions/${session.id}`}
                        className="block p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                        aria-label={`Session: ${session.topic}, status: ${session.status}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 pr-8">
                            <p className="font-semibold text-base truncate">{session.topic}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                              <span>Created {formatDate(session.created_at)}</span>
                              {session.agent_count !== undefined && (
                                <span>{session.agent_count} agent{session.agent_count !== 1 ? 's' : ''}</span>
                              )}
                              {session.rounds_elapsed !== undefined && session.rounds_elapsed > 0 && (
                                <span>{session.rounds_elapsed} / {session.config.max_rounds} rounds</span>
                              )}
                              {session.status === 'ended' && session.termination_reason && (
                                <span className="inline-flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-500" aria-hidden="true" />
                                  {TERMINATION_LABELS[session.termination_reason] ?? session.termination_reason}
                                </span>
                              )}
                            </div>
                          </div>
                          <StatusBadge status={session.status} />
                        </div>
                      </Link>

                      {/* Delete button (visible on hover) */}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!confirm('Are you sure you want to delete this session?')) return;

                          try {
                            await api.deleteSession(session.id);
                            const res = await api.getSessions();
                            setSessions(res.sessions);
                          } catch (err) {
                            console.error('Failed to delete session:', err);
                            alert('Failed to delete session');
                          }
                        }}
                        className="absolute top-2 right-2 p-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus:outline-none focus-visible:outline-red-500"
                        title="Delete session"
                        aria-label={`Delete session: ${session.topic}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18"></path>
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
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
