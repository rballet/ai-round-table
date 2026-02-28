import { create } from 'zustand';
import { Session, SessionConfig } from 'shared/types/session';
import { Agent, QueueEntry } from 'shared/types/agent';
import { SessionResponse } from 'shared/types/api';
import { RoundTableEvent } from 'shared/types/events';

// ---------------------------------------------------------------------------
// Wizard types (SPEC-101-FE: session creation)
// ---------------------------------------------------------------------------

export interface AgentDraft extends Omit<Agent, 'id' | 'session_id'> {}

export interface WizardState {
  step: 1 | 2 | 3;
  topic: string;
  supporting_context: string;
  agents: AgentDraft[];
  config: SessionConfig;
}

const defaultConfig: SessionConfig = {
  max_rounds: 10,
  convergence_majority: 0.6,
  priority_weights: {
    recency: 0.4,
    novelty: 0.4,
    role: 0.2,
  },
  thought_inspector_enabled: false,
};

const defaultWizard: WizardState = {
  step: 1,
  topic: '',
  supporting_context: '',
  agents: [],
  config: defaultConfig,
};

// ---------------------------------------------------------------------------
// Live session types (SPEC-105: live session UI)
// ---------------------------------------------------------------------------

export type AgentRuntimeStatus = 'idle' | 'thinking' | 'active' | 'updating';

export interface LiveArgument {
  id: string;
  agent_id: string;
  agent_name: string;
  round_index: number;
  turn_index: number;
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Combined store state
// ---------------------------------------------------------------------------

interface SessionStoreState {
  // --- Sessions list (SPEC-101-FE) ---
  sessions: Session[];
  sessionsLoading: boolean;
  sessionsError: string | null;

  // --- Live session (SPEC-105) ---
  session: SessionResponse | null;
  agents: Agent[];
  arguments: LiveArgument[];
  queue: QueueEntry[];
  agentStatuses: Record<string, AgentRuntimeStatus>;
  activeAgentId: string | null;
  isConnected: boolean;
  connectionError: string | null;

  // --- Wizard (SPEC-101-FE) ---
  wizard: WizardState;

  // --- Actions: sessions list ---
  setSessions: (sessions: Session[]) => void;
  setSessionsLoading: (loading: boolean) => void;
  setSessionsError: (error: string | null) => void;

  // --- Actions: live session (SPEC-105) ---
  initializeSession: (session: SessionResponse) => void;
  handleEvent: (event: RoundTableEvent) => void;
  setConnectionState: (isConnected: boolean, error?: string | null) => void;

  // --- Actions: wizard ---
  setWizardStep: (step: 1 | 2 | 3) => void;
  setWizardTopic: (topic: string) => void;
  setWizardContext: (context: string) => void;
  addWizardAgent: (agent: AgentDraft) => void;
  removeWizardAgent: (index: number) => void;
  setWizardConfig: (config: Partial<SessionConfig>) => void;
  resetWizard: () => void;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  // Sessions list
  sessions: [],
  sessionsLoading: false,
  sessionsError: null,

  // Live session
  session: null,
  agents: [],
  arguments: [],
  queue: [],
  agentStatuses: {},
  activeAgentId: null,
  isConnected: false,
  connectionError: null,

  // Wizard
  wizard: {
    ...defaultWizard,
    config: { ...defaultConfig, priority_weights: { ...defaultConfig.priority_weights } },
  },

  // --- Sessions list actions ---
  setSessions: (sessions) => set({ sessions }),
  setSessionsLoading: (sessionsLoading) => set({ sessionsLoading }),
  setSessionsError: (sessionsError) => set({ sessionsError }),

  // --- Live session actions (SPEC-105) ---
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

  // --- Wizard actions ---
  setWizardStep: (step) =>
    set((state) => ({ wizard: { ...state.wizard, step } })),

  setWizardTopic: (topic) =>
    set((state) => ({ wizard: { ...state.wizard, topic } })),

  setWizardContext: (supporting_context) =>
    set((state) => ({ wizard: { ...state.wizard, supporting_context } })),

  addWizardAgent: (agent) =>
    set((state) => ({
      wizard: { ...state.wizard, agents: [...state.wizard.agents, agent] },
    })),

  removeWizardAgent: (index) =>
    set((state) => ({
      wizard: {
        ...state.wizard,
        agents: state.wizard.agents.filter((_, i) => i !== index),
      },
    })),

  setWizardConfig: (partial) =>
    set((state) => ({
      wizard: {
        ...state.wizard,
        config: { ...state.wizard.config, ...partial },
      },
    })),

  resetWizard: () =>
    set({
      wizard: {
        ...defaultWizard,
        config: {
          ...defaultConfig,
          priority_weights: { ...defaultConfig.priority_weights },
        },
      },
    }),
}));
