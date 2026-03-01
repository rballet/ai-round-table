import { SessionStatus as SessionLifecycleStatus } from 'shared/types/session';
import { ConvergenceRuntimeStatus } from '@/store/sessionStore';

interface SessionStatusProps {
  status: SessionLifecycleStatus;
  currentRound: number;
  currentTurn: number;
  maxRounds: number;
  convergenceStatus: ConvergenceRuntimeStatus;
}

const convergenceBadge: Record<Exclude<ConvergenceRuntimeStatus, null>, string> = {
  open: 'bg-amber-100 text-amber-800',
  converging: 'bg-emerald-100 text-emerald-800',
  capped: 'bg-slate-200 text-slate-700',
};

const sessionBadge: Record<SessionLifecycleStatus, string> = {
  configured: 'bg-amber-100 text-amber-800',
  running: 'bg-sky-100 text-sky-700',
  paused: 'bg-violet-100 text-violet-700',
  ended: 'bg-slate-200 text-slate-700',
};

export function SessionStatus({
  status,
  currentRound,
  currentTurn,
  maxRounds,
  convergenceStatus,
}: SessionStatusProps) {
  const roundProgress = maxRounds > 0 ? Math.min(100, Math.round((currentRound / maxRounds) * 100)) : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Session Status</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sessionBadge[status]}`}>
            {status}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${convergenceStatus ? convergenceBadge[convergenceStatus] : 'bg-slate-100 text-slate-600'
              }`}
          >
            {convergenceStatus ? `Convergence: ${convergenceStatus}` : 'Convergence: pending'}
          </span>
        </div>
      </div>

      <div className="mb-1 flex items-end justify-between">
        <p className="text-sm font-medium text-slate-800">
          Round {currentRound} / {maxRounds}
        </p>
        <p className="text-xs text-slate-600">Turn {currentTurn}</p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${convergenceStatus === 'converging'
              ? 'from-emerald-500 to-emerald-400'
              : convergenceStatus === 'capped'
                ? 'from-slate-500 to-slate-400'
                : 'from-cyan-500 to-sky-500'
            }`}
          style={{ width: `${roundProgress}%` }}
        />
      </div>
    </section>
  );
}
