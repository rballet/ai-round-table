import { LiveArgument } from '@/store/sessionStore';
import { ArgumentBubble } from './ArgumentBubble';

interface ArgumentFeedProps {
  argumentsList: LiveArgument[];
}

export function ArgumentFeed({ argumentsList }: ArgumentFeedProps) {
  return (
    <section className="flex h-[480px] flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Argument Feed</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
          {argumentsList.length} entries
        </span>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
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
