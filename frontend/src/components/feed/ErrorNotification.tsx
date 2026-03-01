import { motion } from 'framer-motion';
import { LiveError } from '@/store/sessionStore';
import { Agent } from 'shared/types/agent';

interface ErrorNotificationProps {
  error: LiveError;
  agents: Agent[];
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ErrorNotification({ error, agents }: ErrorNotificationProps) {
  const agentName = error.agent_id
    ? (agents.find((a) => a.id === error.agent_id)?.display_name ?? error.agent_id)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      role="alert"
      aria-live="assertive"
      className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"
      data-testid={`error-notification-${error.id}`}
    >
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
        !
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-red-700">
            {error.code}
          </span>
          {agentName && (
            <span className="text-[10px] text-red-600">
              {agentName}
            </span>
          )}
          <span className="ml-auto text-[10px] text-red-400">
            {formatTime(error.timestamp)}
          </span>
        </div>
        <p className="text-xs text-red-800">{error.message}</p>
      </div>
    </motion.div>
  );
}
