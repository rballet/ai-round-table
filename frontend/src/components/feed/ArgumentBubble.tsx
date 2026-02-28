'use client';

import { useMemo, useState } from 'react';
import { LiveArgument } from '@/store/sessionStore';

interface ArgumentBubbleProps {
  argument: LiveArgument;
}

const roleBadgeStyles: Record<LiveArgument['agent_role'], string> = {
  moderator: 'bg-indigo-100 text-indigo-700',
  scribe: 'bg-cyan-100 text-cyan-700',
  participant: 'bg-slate-200 text-slate-700',
};

const COLLAPSE_THRESHOLD = 200;

export function ArgumentBubble({ argument }: ArgumentBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isCollapsible = argument.content.length > COLLAPSE_THRESHOLD;
  const previewContent = useMemo(() => {
    if (!isCollapsible || isExpanded) {
      return argument.content;
    }
    return `${argument.content.slice(0, COLLAPSE_THRESHOLD).trimEnd()}...`;
  }, [argument.content, isCollapsible, isExpanded]);

  return (
    <article
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid={`argument-bubble-${argument.id}`}
    >
      <header className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900">{argument.agent_name}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${roleBadgeStyles[argument.agent_role]}`}
          >
            {argument.agent_role}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          R{argument.round_index} · T{argument.turn_index}
        </span>
      </header>

      <p className="text-sm leading-relaxed text-slate-700">{previewContent}</p>

      {isCollapsible && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          className="mt-2 text-xs font-medium text-cyan-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </article>
  );
}
