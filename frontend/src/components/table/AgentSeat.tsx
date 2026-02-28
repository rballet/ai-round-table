import { Agent } from 'shared/types/agent';
import { AgentRuntimeStatus } from '@/store/sessionStore';

interface AgentSeatProps {
  agent: Agent;
  status: AgentRuntimeStatus;
  handRaised: boolean;
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

export function AgentSeat({ agent, status, handRaised }: AgentSeatProps) {
  const initial = agent.display_name.charAt(0).toUpperCase();
  const glowClass =
    status === 'active'
      ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-white shadow-[0_0_28px_rgba(16,185,129,0.45)]'
      : '';
  const pulseClass = status === 'updating' ? 'animate-pulse' : '';
  const nameClass = status === 'active' ? 'text-emerald-700' : 'text-slate-900';

  return (
    <div
      className="flex w-28 flex-col items-center gap-1 text-center"
      data-testid={`agent-seat-${agent.id}`}
      data-status={status}
      data-hand-raised={handRaised ? 'true' : 'false'}
    >
      <div
        data-testid={`agent-avatar-${agent.id}`}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white transition ${glowClass} ${pulseClass}`}
      >
        {initial}
        {status === 'thinking' && (
          <span className="absolute -right-1 -top-1 h-3 w-3 animate-spin rounded-full border border-slate-700 border-t-transparent bg-white" />
        )}
        {handRaised && (
          <span
            className="absolute -left-2 -top-2 inline-flex h-5 items-center justify-center rounded-full border border-violet-300 bg-violet-100 px-1 text-[9px] font-semibold text-violet-800"
            aria-label="Token request pending"
            title="Token request pending"
          >
            req
          </span>
        )}
      </div>
      <div className={`line-clamp-1 text-xs font-medium ${nameClass}`}>{agent.display_name}</div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass[status]}`}>
        {statusLabel[status]}
      </span>
    </div>
  );
}
