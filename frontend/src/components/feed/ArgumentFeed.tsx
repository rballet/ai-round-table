'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LiveArgument, LiveError } from '@/store/sessionStore';
import { Agent } from 'shared/types/agent';
import { ArgumentBubble } from './ArgumentBubble';
import { ErrorNotification } from './ErrorNotification';

interface ArgumentFeedProps {
  argumentsList: LiveArgument[];
  errors: LiveError[];
  agents: Agent[];
}

const AUTO_SCROLL_THRESHOLD_PX = 72;

export function ArgumentFeed({ argumentsList, errors, agents }: ArgumentFeedProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const node = scrollContainerRef.current;
    if (!node) {
      return;
    }
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  const totalItems = argumentsList.length + errors.length;

  useEffect(() => {
    if (!autoScrollPaused) {
      scrollToBottom(totalItems <= 1 ? 'auto' : 'smooth');
    }
  }, [totalItems, autoScrollPaused, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const node = scrollContainerRef.current;
    if (!node) {
      return;
    }
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setAutoScrollPaused(distanceFromBottom > AUTO_SCROLL_THRESHOLD_PX);
  }, []);

  const isEmpty = argumentsList.length === 0 && errors.length === 0;

  return (
    <section className="flex h-[480px] flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Argument Feed</h2>
        <div className="flex items-center gap-2">
          {autoScrollPaused && !isEmpty && (
            <button
              type="button"
              onClick={() => {
                scrollToBottom();
                setAutoScrollPaused(false);
              }}
              className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-800 transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            >
              Jump to latest
            </button>
          )}
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
            {argumentsList.length} entries
          </span>
          {errors.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {errors.length} {errors.length === 1 ? 'error' : 'errors'}
            </span>
          )}
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-3 overflow-y-auto pr-1"
        data-testid="argument-feed-scroll-container"
        aria-live="polite"
        aria-label="Argument and error feed"
      >
        {isEmpty ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            Waiting for arguments...
          </div>
        ) : (
          <>
            {argumentsList.map((argument) => (
              <ArgumentBubble key={argument.id} argument={argument} />
            ))}
            <AnimatePresence initial={false}>
              {errors.map((error) => (
                <ErrorNotification key={error.id} error={error} agents={agents} />
              ))}
            </AnimatePresence>
          </>
        )}
      </div>
    </section>
  );
}
