'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Agent, AgentRole } from 'shared/types/agent';
import { AgentThought } from '@/store/sessionStore';

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

interface AgentThoughtsRowProps {
  agent: Agent;
  thoughts: AgentThought[];
}

// ---------------------------------------------------------------------------
// Role badge helpers
// ---------------------------------------------------------------------------

const roleBadgeClass: Record<AgentRole, string> = {
  moderator: 'bg-violet-100 text-violet-700',
  scribe: 'bg-sky-100 text-sky-700',
  participant: 'bg-slate-100 text-slate-700',
};

function RoleBadge({ role }: { role: AgentRole }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${roleBadgeClass[role]}`}
    >
      {role}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single agent row with expandable version history
// ---------------------------------------------------------------------------

function AgentThoughtsRow({ agent, thoughts }: AgentThoughtsRowProps) {
  const [expanded, setExpanded] = useState(false);

  // Thoughts arrive in version order; the last item is the latest
  const latest = thoughts.length > 0 ? thoughts[thoughts.length - 1] : null;
  const hasHistory = thoughts.length > 1;

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50">
      {/* Header row — always visible */}
      <div className="flex items-start gap-3 p-3">
        {/* Avatar */}
        <div
          aria-hidden="true"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
        >
          {agent.display_name.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-slate-900">{agent.display_name}</span>
            <RoleBadge role={agent.role} />
            {thoughts.length > 0 && (
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                v{latest?.version}
              </span>
            )}
          </div>

          {latest ? (
            <p className="line-clamp-3 text-xs leading-relaxed text-slate-600">{latest.content}</p>
          ) : (
            <p className="text-xs italic text-slate-400">No thoughts received yet.</p>
          )}
        </div>

        {/* Expand toggle — only shown when there is history to view */}
        {hasHistory && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} thought history for ${agent.display_name}`}
            onClick={() => setExpanded((prev) => !prev)}
            className="flex-shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500"
          >
            <motion.svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </motion.svg>
          </button>
        )}
      </div>

      {/* Version history — collapsible */}
      <AnimatePresence initial={false}>
        {expanded && hasHistory && (
          <motion.div
            key="history"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="overflow-hidden"
          >
            <ol
              aria-label={`Thought version history for ${agent.display_name}`}
              className="border-t border-slate-200 px-3 pb-3 pt-2 space-y-2"
            >
              {/* Render oldest to newest; latest already shown above */}
              {thoughts.slice(0, -1).map((thought) => (
                <li key={thought.id} className="flex gap-2 text-xs text-slate-500">
                  <span className="mt-0.5 flex-shrink-0 font-semibold tabular-nums text-slate-400">
                    v{thought.version}
                  </span>
                  <p className="leading-relaxed">{thought.content}</p>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

// ---------------------------------------------------------------------------
// ThoughtInspector panel
// ---------------------------------------------------------------------------

interface ThoughtInspectorProps {
  agents: Agent[];
  agentThoughts: Record<string, AgentThought[]>;
  isOpen: boolean;
  onToggle: () => void;
}

export function ThoughtInspector({ agents, agentThoughts, isOpen, onToggle }: ThoughtInspectorProps) {
  const totalThoughts = Object.values(agentThoughts).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <section aria-label="Thought Inspector">
      {/* Toggle button — always visible */}
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="thought-inspector-panel"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">Thought Inspector</span>
          {totalThoughts > 0 && (
            <span
              aria-label={`${totalThoughts} thoughts received`}
              className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700"
            >
              {totalThoughts}
            </span>
          )}
        </div>
        <motion.svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-slate-400"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </motion.svg>
      </button>

      {/* Collapsible panel body */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id="thought-inspector-panel"
            key="thought-inspector-body"
            role="region"
            aria-label="Thought Inspector panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="overflow-hidden"
          >
            {/* Live region so screen readers announce thought updates */}
            <div aria-live="polite" aria-atomic="false" className="sr-only">
              {totalThoughts > 0 && `${totalThoughts} agent thoughts received.`}
            </div>

            <ul className="mt-2 space-y-2" aria-label="Agent thoughts">
              {agents.map((agent) => (
                <AgentThoughtsRow
                  key={agent.id}
                  agent={agent}
                  thoughts={agentThoughts[agent.id] ?? []}
                />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
