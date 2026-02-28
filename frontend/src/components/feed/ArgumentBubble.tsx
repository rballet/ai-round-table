import { LiveArgument } from '@/store/sessionStore';

interface ArgumentBubbleProps {
  argument: LiveArgument;
}

export function ArgumentBubble({ argument }: ArgumentBubbleProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{argument.agent_name}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          R{argument.round_index} · T{argument.turn_index}
        </span>
      </header>
      <p className="text-sm leading-relaxed text-slate-700">{argument.content}</p>
    </article>
  );
}
