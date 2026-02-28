import { AnimatePresence, motion } from 'framer-motion';
import { QueueEntry } from 'shared/types/agent';

interface QueuePanelProps {
  queue: QueueEntry[];
}

const noveltyStyles: Record<string, string> = {
  first_argument: 'bg-sky-100 text-sky-700',
  correction: 'bg-rose-100 text-rose-700',
  new_information: 'bg-violet-100 text-violet-700',
  disagreement: 'bg-orange-100 text-orange-700',
  synthesis: 'bg-emerald-100 text-emerald-700',
  reinforcement: 'bg-slate-200 text-slate-700',
};

function noveltyLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function QueuePanel({ queue }: QueuePanelProps) {
  const maxPriority = queue.reduce((highest, entry) => Math.max(highest, entry.priority_score), 0.01);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Priority Queue</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {queue.length} waiting
        </span>
      </header>

      {queue.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Queue is empty.
        </p>
      ) : (
        <ol className="space-y-2" aria-label="Priority queue">
          <AnimatePresence initial={false}>
            {queue.map((entry) => {
              const widthPct = Math.max(8, Math.round((entry.priority_score / maxPriority) * 100));
              return (
                <motion.li
                  key={entry.agent_id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                        {entry.position}
                      </span>
                      <span className="font-medium text-slate-900">{entry.agent_name ?? entry.agent_id}</span>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-slate-600">
                      {entry.priority_score.toFixed(2)}
                    </span>
                  </div>

                  <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
                      initial={false}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
                    />
                  </div>

                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      noveltyStyles[entry.novelty_tier] ?? 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {noveltyLabel(entry.novelty_tier)}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}
