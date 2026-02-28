'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveArgument } from '@/store/sessionStore';
import { ArgumentBubble } from './ArgumentBubble';

interface ArgumentFeedProps {
  argumentsList: LiveArgument[];
}

const AUTO_SCROLL_THRESHOLD_PX = 72;

export function ArgumentFeed({ argumentsList }: ArgumentFeedProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const node = scrollContainerRef.current;
    if (!node) {
      return;
    }
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (!autoScrollPaused) {
      scrollToBottom(argumentsList.length <= 1 ? 'auto' : 'smooth');
    }
  }, [argumentsList.length, autoScrollPaused, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const node = scrollContainerRef.current;
    if (!node) {
      return;
    }
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setAutoScrollPaused(distanceFromBottom > AUTO_SCROLL_THRESHOLD_PX);
  }, []);

  return (
    <section className="flex h-[480px] flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Argument Feed</h2>
        <div className="flex items-center gap-2">
          {autoScrollPaused && argumentsList.length > 0 && (
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
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-3 overflow-y-auto pr-1"
        data-testid="argument-feed-scroll-container"
      >
        {argumentsList.length > 0 ? (
          argumentsList.map((argument) => <ArgumentBubble key={argument.id} argument={argument} />)
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            Waiting for arguments...
          </div>
        )}
      </div>
    </section>
  );
}
