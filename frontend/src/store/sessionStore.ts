import { create } from 'zustand';
import { Agent, QueueEntry } from 'shared/types/agent';
import { SessionResponse } from 'shared/types/api';
import { RoundTableEvent } from 'shared/types/events';

export type AgentRuntimeStatus = 'idle' | 'thinking' | 'active' | 'updating';

export interface LiveArgument {
  id: string;
  agent_id: string;
  agent_name: string;
  round_index: number;
  turn_index: number;
  content: string;
}

interface SessionState {
  session: SessionResponse | null;
  agents: Agent[];
  arguments: LiveArgument[];
  queue: QueueEntry[];
  agentStatuses: Record<string, AgentRuntimeStatus>;
  activeAgentId: string | null;
  isConnected: boolean;
  connectionError: string | null;
  initializeSession: (session: SessionResponse) => void;
  handleEvent: (event: RoundTableEvent) => void;
  setConnectionState: (isConnected: boolean, error?: string | null) => void;
}

function toIdleStatuses(agents: Agent[]): Record<string, AgentRuntimeStatus> {
  return Object.fromEntries(agents.map((agent) => [agent.id, 'idle']));
}

function markActiveStatus(
  previous: Record<string, AgentRuntimeStatus>,
  agents: Agent[],
  activeAgentId: string
): Record<string, AgentRuntimeStatus> {
  const next = { ...previous };
  for (const agent of agents) {
    next[agent.id] = agent.id === activeAgentId ? 'active' : 'idle';
  }
  return next;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  agents: [],
  arguments: [],
  queue: [],
  agentStatuses: {},
  activeAgentId: null,
  isConnected: false,
  connectionError: null,
  initializeSession: (session) =>
    set({
      session,
      agents: session.agents,
      arguments: [],
      queue: [],
      activeAgentId: null,
      agentStatuses: toIdleStatuses(session.agents),
      connectionError: null,
    }),
  setConnectionState: (isConnected, error = null) =>
    set({ isConnected, connectionError: error }),
  handleEvent: (event) =>
    set((state) => {
      switch (event.type) {
        case 'SESSION_START': {
          const agentStatuses =
            state.agents.length === event.agents.length
              ? state.agentStatuses
              : toIdleStatuses(event.agents);
          return {
            session: state.session
              ? { ...state.session, status: 'running', topic: event.topic, agents: event.agents }
              : null,
            agents: event.agents,
            agentStatuses,
          };
        }
        case 'THINK_START':
          return {
            agentStatuses: {
              ...state.agentStatuses,
              [event.agent_id]: 'thinking',
            },
          };
        case 'THINK_END':
          return {
            agentStatuses: {
              ...state.agentStatuses,
              [event.agent_id]:
                state.agentStatuses[event.agent_id] === 'active' ? 'active' : 'idle',
            },
          };
        case 'TOKEN_GRANTED':
          return {
            activeAgentId: event.agent_id,
            agentStatuses: markActiveStatus(state.agentStatuses, state.agents, event.agent_id),
          };
        case 'ARGUMENT_POSTED':
          return {
            arguments: [...state.arguments, event.argument],
            activeAgentId: event.argument.agent_id,
          };
        case 'QUEUE_UPDATED':
          return { queue: event.queue };
        // Forward-compatible with SPEC-201 event stream changes.
        case 'UPDATE_START':
          return {
            agentStatuses: {
              ...state.agentStatuses,
              [event.agent_id]: 'updating',
            },
          };
        case 'UPDATE_END':
          return {
            agentStatuses: {
              ...state.agentStatuses,
              [event.agent_id]:
                state.agentStatuses[event.agent_id] === 'active' ? 'active' : 'idle',
            },
          };
        case 'SESSION_END':
          return {
            activeAgentId: null,
            session: state.session ? { ...state.session, status: 'ended' } : null,
            agentStatuses: toIdleStatuses(state.agents),
          };
        default:
          return state;
      }
    }),
}));
