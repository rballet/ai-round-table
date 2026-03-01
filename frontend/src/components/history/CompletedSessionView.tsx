'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import type { SessionResponse } from 'shared/types/api';
import type { TranscriptResponse, SummaryResponse } from 'shared/types/api';
import type { Agent } from 'shared/types/agent';
import { useSessionStore } from '@/store/sessionStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CompletedSessionViewProps {
  session: SessionResponse;
  transcript: TranscriptResponse | null;
  summary: SummaryResponse | null;
  onDelete: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINATION_LABELS: Record<string, string> = {
  consensus: 'Consensus',
  cap: 'Round Cap',
  host: 'Host End',
  error: 'Error',
};

const TERMINATION_STYLES: Record<string, string> = {
  consensus: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  cap: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  host: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  error: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
};

const ROLE_BADGE_STYLES: Record<Agent['role'], string> = {
  moderator: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  scribe: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  participant: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startIso: string, endIso: string): string {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (diffMs < 0) return 'unknown';
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds}s`;
}

function buildMarkdown(
  session: SessionResponse,
  transcript: TranscriptResponse | null,
  summary: SummaryResponse | null
): string {
  const lines: string[] = [];

  lines.push(`# ${session.topic}`);
  lines.push('');

  if (session.supporting_context) {
    lines.push('## Context');
    lines.push('');
    lines.push(session.supporting_context);
    lines.push('');
  }

  lines.push('## Participants');
  lines.push('');
  for (const agent of session.agents) {
    lines.push(`- **${agent.display_name}** (${agent.role})`);
  }
  lines.push('');

  lines.push('## Session Metadata');
  lines.push('');
  lines.push(`- **Created:** ${formatDate(session.created_at)}`);
  if (session.ended_at) {
    lines.push(`- **Ended:** ${formatDate(session.ended_at)}`);
    lines.push(`- **Duration:** ${formatDuration(session.created_at, session.ended_at)}`);
  }
  lines.push(`- **Rounds completed:** ${session.rounds_elapsed ?? 'unknown'} / ${session.config.max_rounds}`);
  if (session.termination_reason) {
    lines.push(`- **Termination reason:** ${TERMINATION_LABELS[session.termination_reason] ?? session.termination_reason}`);
  }
  lines.push('');

  if (transcript && transcript.arguments.length > 0) {
    lines.push('## Transcript');
    lines.push('');
    for (const arg of transcript.arguments) {
      lines.push(`### Round ${arg.round_index}, Turn ${arg.turn_index} — ${arg.agent_name}`);
      lines.push('');
      lines.push(arg.content);
      lines.push('');
    }
  }

  if (summary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(summary.content);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Sub-component: Metadata card
// ---------------------------------------------------------------------------

function MetadataCard({ session }: { session: SessionResponse }) {
  const roundCount = session.rounds_elapsed ?? 0;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
        Session Details
      </h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-zinc-400 dark:text-zinc-500 text-xs">Created</dt>
          <dd className="font-medium text-zinc-900 dark:text-zinc-100">{formatDate(session.created_at)}</dd>
        </div>
        {session.ended_at && (
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500 text-xs">Duration</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-100">
              {formatDuration(session.created_at, session.ended_at)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-zinc-400 dark:text-zinc-500 text-xs">Agents</dt>
          <dd className="font-medium text-zinc-900 dark:text-zinc-100">
            {session.agents.length}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-400 dark:text-zinc-500 text-xs">Rounds completed</dt>
          <dd className="font-medium text-zinc-900 dark:text-zinc-100">
            {roundCount} / {session.config.max_rounds}
          </dd>
        </div>
      </dl>

      {/* Participants list */}
      <div className="space-y-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
        <h3 className="text-xs text-zinc-400 dark:text-zinc-500">Participants</h3>
        <ul className="space-y-1.5">
          {session.agents.map((agent) => (
            <li key={agent.id} className="flex items-center gap-2">
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${ROLE_BADGE_STYLES[agent.role]}`}
              >
                {agent.role}
              </span>
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {agent.display_name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Transcript entry
// ---------------------------------------------------------------------------

interface TranscriptEntryProps {
  entry: TranscriptResponse['arguments'][number];
  agentRole: Agent['role'];
}

function TranscriptEntry({ entry, agentRole }: TranscriptEntryProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm"
    >
      <header className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {entry.agent_name}
          </h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ROLE_BADGE_STYLES[agentRole]}`}>
            {agentRole}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          R{entry.round_index} · T{entry.turn_index}
        </span>
      </header>
      <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
        {entry.content}
      </p>
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Summary block (inline, not modal)
// ---------------------------------------------------------------------------

function InlineSummary({ summary }: { summary: SummaryResponse }) {
  const reason = summary.termination_reason;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Session Summary</h2>
        {reason && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${TERMINATION_STYLES[reason] ?? 'bg-zinc-100 text-zinc-600'}`}
          >
            {TERMINATION_LABELS[reason] ?? reason}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
        {summary.content}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CompletedSessionView({
  session,
  transcript,
  summary,
  onDelete,
}: CompletedSessionViewProps) {
  const reason = session.termination_reason;
  const router = useRouter();
  const loadWizardFromTemplate = useSessionStore((s) => s.loadWizardFromTemplate);

  const handleReuseConfig = useCallback(() => {
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

  const handleDownload = useCallback(() => {
    const markdown = buildMarkdown(session, transcript, summary);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `session-${session.id}-transcript.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [session, transcript, summary]);

  const transcriptEntries = transcript?.arguments ?? [];

  // Build a lookup for agent role by agent_id
  const agentRoleById: Record<string, Agent['role']> = {};
  for (const agent of session.agents) {
    agentRoleById[agent.id] = agent.role;
  }

  // Also build lookup by display_name for when only agent_name is available
  const agentRoleByName: Record<string, Agent['role']> = {};
  for (const agent of session.agents) {
    agentRoleByName[agent.display_name] = agent.role;
  }

  function resolveRole(entry: TranscriptResponse['arguments'][number]): Agent['role'] {
    return agentRoleById[entry.agent_id] ?? agentRoleByName[entry.agent_name] ?? 'participant';
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Announce session status change for screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        Viewing completed session: {session.topic}
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Page header */}
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href="/"
                  className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                  aria-label="Back to session list"
                >
                  Sessions
                </Link>
                <span className="text-zinc-300 dark:text-zinc-700 text-xs" aria-hidden="true">/</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">Completed</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight truncate">{session.topic}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Ended
                </span>
                {reason && (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TERMINATION_STYLES[reason] ?? 'bg-zinc-100 text-zinc-600'}`}
                    aria-label={`Termination reason: ${TERMINATION_LABELS[reason] ?? reason}`}
                  >
                    {TERMINATION_LABELS[reason] ?? reason}
                  </span>
                )}
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  ID: {session.id}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleReuseConfig}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                aria-label="Reuse agent configuration from this session"
              >
                Reuse Config
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                aria-label="Download transcript as Markdown"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download Transcript
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                aria-label="Delete this session"
              >
                Delete
              </button>
            </div>
          </div>
        </header>

        {/* Main grid: metadata + content */}
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Left column: metadata */}
          <aside>
            <MetadataCard session={session} />
          </aside>

          {/* Right column: transcript + summary */}
          <div className="space-y-5">
            {/* Summary (show first for quick overview) */}
            {summary && <InlineSummary summary={summary} />}

            {/* Transcript */}
            <section aria-label="Session transcript">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Transcript
                </h2>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {transcriptEntries.length} {transcriptEntries.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              {transcriptEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-sm text-zinc-400 dark:text-zinc-500 text-center">
                  No transcript entries available.
                </div>
              ) : (
                <ul className="space-y-3" role="list">
                  {transcriptEntries.map((entry) => (
                    <li key={entry.id}>
                      <TranscriptEntry entry={entry} agentRole={resolveRole(entry)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
