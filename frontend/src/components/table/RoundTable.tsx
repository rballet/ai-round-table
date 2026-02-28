import { Agent } from 'shared/types/agent';
import { AgentRuntimeStatus } from '@/store/sessionStore';
import { AgentSeat } from './AgentSeat';

interface RoundTableProps {
  agents: Agent[];
  agentStatuses: Record<string, AgentRuntimeStatus>;
}

function seatPosition(index: number, total: number) {
  const angle = (index / total) * (Math.PI * 2) - Math.PI / 2;
  const x = 50 + 39 * Math.cos(angle);
  const y = 50 + 30 * Math.sin(angle);
  return { x, y };
}

export function RoundTable({ agents, agentStatuses }: RoundTableProps) {
  if (agents.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white">
        <p className="text-sm text-slate-500">No agents available for this session.</p>
      </div>
    );
  }

  return (
    <div className="relative h-[480px] rounded-2xl border border-slate-200 bg-white shadow-sm">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <ellipse cx="50" cy="50" rx="34" ry="22" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
        <text x="50" y="51" textAnchor="middle" className="fill-slate-700 text-[4px] font-semibold">
          Round Table
        </text>
      </svg>

      {agents.map((agent, index) => {
        const { x, y } = seatPosition(index, agents.length);
        return (
          <div
            key={agent.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <AgentSeat agent={agent} status={agentStatuses[agent.id] ?? 'idle'} />
          </div>
        );
      })}
    </div>
  );
}
