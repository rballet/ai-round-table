import { Agent } from 'shared/types/agent';
import { AgentRuntimeStatus } from '@/store/sessionStore';

interface AgentSeatProps {
  agent: Agent;
  status: AgentRuntimeStatus;
}

const statusLabel: Record<AgentRuntimeStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  active: 'Speaking',
  updating: 'Updating',
};

const statusClass: Record<AgentRuntimeStatus, string> = {
  idle: 'bg-slate-100 text-slate-700',
  thinking: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  updating: 'bg-sky-100 text-sky-800',
};

export function AgentSeat({ agent, status }: AgentSeatProps) {
  const initial = agent.display_name.charAt(0).toUpperCase();
  const glowClass = status === 'active' ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-white' : '';

  return (
    <div className="flex w-28 flex-col items-center gap-1 text-center">
      <div
        className={`relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white transition ${glowClass}`}
      >
        {initial}
        {(status === 'thinking' || status === 'updating') && (
          <span className="absolute -right-1 -top-1 h-3 w-3 animate-spin rounded-full border border-slate-700 border-t-transparent bg-white" />
        )}
      </div>
      <div className="line-clamp-1 text-xs font-medium text-slate-900">{agent.display_name}</div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass[status]}`}>
        {statusLabel[status]}
      </span>
    </div>
  );
}
