'use client';

import { useSessionStore } from '@/store/sessionStore';

interface Step1TopicProps {
  onNext: () => void;
}

const MAX_CONTEXT_CHARS = 10000;

export function Step1Topic({ onNext }: Step1TopicProps) {
  const { wizard, setWizardTopic, setWizardContext } = useSessionStore();
  const contextLen = wizard.supporting_context.length;
  const contextOverLimit = contextLen > MAX_CONTEXT_CHARS;
  const contextNearLimit = !contextOverLimit && contextLen > MAX_CONTEXT_CHARS * 0.85;

  const handleNext = () => {
    if (!wizard.topic.trim() || contextOverLimit) return;
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Topic &amp; Context</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Define the discussion topic and optionally provide supporting context.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="topic" className="block text-sm font-medium">
            Topic <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="topic"
            type="text"
            required
            placeholder="e.g. Should AI be regulated by governments?"
            value={wizard.topic}
            onChange={(e) => setWizardTopic(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
            aria-required="true"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="context" className="block text-sm font-medium">
            Supporting Context
            <span className="ml-1 text-zinc-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="context"
            placeholder="Paste or type any relevant background material, articles, data, or framing that agents should consider..."
            value={wizard.supporting_context}
            onChange={(e) => setWizardContext(e.target.value)}
            rows={6}
            aria-describedby="context-count context-preview"
            className={`w-full px-3 py-2 rounded-lg border text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 transition resize-y bg-white dark:bg-zinc-900 ${
              contextOverLimit
                ? 'border-red-500 focus:ring-red-500'
                : contextNearLimit
                ? 'border-amber-400 focus:ring-amber-400'
                : 'border-zinc-300 dark:border-zinc-700 focus:ring-zinc-900 dark:focus:ring-white'
            }`}
          />
          <p
            id="context-count"
            className={`text-xs ${
              contextOverLimit
                ? 'text-red-500 font-medium'
                : contextNearLimit
                ? 'text-amber-500'
                : 'text-zinc-400'
            }`}
          >
            {contextLen.toLocaleString()} / {MAX_CONTEXT_CHARS.toLocaleString()} characters
            {contextOverLimit && ' — exceeds limit'}
          </p>
          {wizard.supporting_context.trim() && (
            <details id="context-preview" className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 select-none">
                Preview in Think prompt
              </summary>
              <pre className="mt-2 p-3 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono overflow-auto max-h-48">
{`Supporting context:\n${wizard.supporting_context.trim()}`}
              </pre>
            </details>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleNext}
          disabled={!wizard.topic.trim() || contextOverLimit}
          className="px-5 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          aria-label="Go to next step: Agent Lineup"
        >
          Next: Agent Lineup
        </button>
      </div>
    </div>
  );
}
