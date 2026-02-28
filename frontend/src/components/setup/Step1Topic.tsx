'use client';

import { useSessionStore } from '@/store/sessionStore';

interface Step1TopicProps {
  onNext: () => void;
}

export function Step1Topic({ onNext }: Step1TopicProps) {
  const { wizard, setWizardTopic, setWizardContext } = useSessionStore();

  const handleNext = () => {
    if (!wizard.topic.trim()) return;
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
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition resize-y"
          />
          <p className="text-xs text-zinc-400">{wizard.supporting_context.length} characters</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleNext}
          disabled={!wizard.topic.trim()}
          className="px-5 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          aria-label="Go to next step: Agent Lineup"
        >
          Next: Agent Lineup
        </button>
      </div>
    </div>
  );
}
