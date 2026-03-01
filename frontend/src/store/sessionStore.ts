import { create } from 'zustand';
import { Session, SessionConfig, TerminationReason } from 'shared/types/session';
import { Agent, AgentRole, QueueEntry } from 'shared/types/agent';
import { SessionResponse } from 'shared/types/api';
import { RoundTableEvent } from 'shared/types/events';

// ---------------------------------------------------------------------------
// Wizard types (SPEC-101-FE: session creation)
// ---------------------------------------------------------------------------

export type AgentDraft = Omit<Agent, 'id' | 'session_id'>;

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

export type AgentRuntimeStatus = 'idle' | 'thinking' | 'active' | 'updating' | 'errored';
export type ConvergenceRuntimeStatus = 'open' | 'converging' | 'capped' | null;

export interface LiveArgument {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_role: AgentRole;
  round_index: number;
  turn_index: number;
  content: string;
}

export interface LiveSummary {
  id: string;
  content: string;
  termination_reason: Exclude<TerminationReason, null>;
}

export interface LiveError {
  id: string;
  code: string;
  message: string;
  agent_id?: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIdleStatuses(agents: Agent[]): Record<string, AgentRuntimeStatus> {
  return Object.fromEntries(agents.map((agent) => [agent.id, 'idle']));
}

function toLoweredHands(agents: Agent[]): Record<string, boolean> {
  return Object.fromEntries(agents.map((agent) => [agent.id, false]));
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

function keepHandsForQueuedAgents(
  previous: Record<string, boolean>,
  queue: QueueEntry[]
): Record<string, boolean> {
  const queuedAgentIds = new Set(queue.map((entry) => entry.agent_id));
  const next = { ...previous };
  for (const agentId of Object.keys(next)) {
    if (!queuedAgentIds.has(agentId)) {
      next[agentId] = false;
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Combined store state
// ---------------------------------------------------------------------------

export interface AgentThought {
  id: string;
  agent_id: string;
  version: number;
  content: string;
}

export interface SessionStoreState {
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
  raisedHands: Record<string, boolean>;
  activeAgentId: string | null;
  summary: LiveSummary | null;
  summaryPanelOpen: boolean;
  currentRound: number;
  currentTurn: number;
  convergenceStatus: ConvergenceRuntimeStatus;
  isConnected: boolean;
  connectionError: string | null;
  agentThoughts: Record<string, AgentThought[]>;
  thoughtInspectorEnabled: boolean;
  errors: LiveError[];

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
  openSummaryPanel: () => void;
  closeSummaryPanel: () => void;
  setSummary: (summary: LiveSummary) => void;
  setAgentThoughts: (thoughts: AgentThought[]) => void;
  clearError: (id: string) => void;

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
  raisedHands: {},
  activeAgentId: null,
  summary: null,
  summaryPanelOpen: false,
  currentRound: 0,
  currentTurn: 0,
  convergenceStatus: null,
  isConnected: false,
  connectionError: null,
  agentThoughts: {},
  thoughtInspectorEnabled: false,
  errors: [],

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
      summary: null,
      summaryPanelOpen: false,
      currentRound: session.rounds_elapsed ?? 0,
      currentTurn: 0,
      convergenceStatus: null,
      agentStatuses: toIdleStatuses(session.agents),
      raisedHands: toLoweredHands(session.agents),
      connectionError: null,
      agentThoughts: {},
      thoughtInspectorEnabled: session.config.thought_inspector_enabled,
      errors: [],
    }),

  setConnectionState: (isConnected, error = null) =>
    set({ isConnected, connectionError: error }),

  openSummaryPanel: () => set({ summaryPanelOpen: true }),
  closeSummaryPanel: () => set({ summaryPanelOpen: false }),
  setSummary: (summary) => set({ summary }),

  setAgentThoughts: (thoughts) =>
    set(() => {
      const agentThoughts: Record<string, AgentThought[]> = {};
      for (const thought of thoughts) {
        if (!agentThoughts[thought.agent_id]) {
          agentThoughts[thought.agent_id] = [];
        }
        agentThoughts[thought.agent_id].push(thought);
      }
      // Sort each agent's thoughts by version ascending
      for (const agentId of Object.keys(agentThoughts)) {
        agentThoughts[agentId].sort((a, b) => a.version - b.version);
      }
      return { agentThoughts };
    }),

  handleEvent: (event) =>
    set((state) => {
      switch (event.type) {
        case 'SESSION_START': {
          const agentStatuses = toIdleStatuses(event.agents);
          const raisedHands = toLoweredHands(event.agents);
          const resolvedConfig = event.config ?? state.session?.config;
          return {
            session: state.session
              ? {
                ...state.session,
                status: 'running',
                topic: event.topic,
                agents: event.agents,
                config: event.config ?? state.session.config,
              }
              : null,
            agents: event.agents,
            agentStatuses,
            raisedHands,
            thoughtInspectorEnabled: resolvedConfig?.thought_inspector_enabled ?? state.thoughtInspectorEnabled,
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
            currentRound: event.round_index,
            currentTurn: event.turn_index,
            agentStatuses: markActiveStatus(state.agentStatuses, state.agents, event.agent_id),
            raisedHands: {
              ...state.raisedHands,
              [event.agent_id]: false,
            },
            session: state.session
              ? {
                ...state.session,
                rounds_elapsed: Math.max(state.session.rounds_elapsed ?? 0, event.round_index),
              }
              : null,
          };
        case 'ARGUMENT_POSTED': {
          const agentRole =
            state.agents.find((agent) => agent.id === event.argument.agent_id)?.role ??
            'participant';
          return {
            arguments: [...state.arguments, { ...event.argument, agent_role: agentRole }],
            activeAgentId: event.argument.agent_id,
          };
        }
        case 'TOKEN_REQUEST':
          return {
            raisedHands: {
              ...state.raisedHands,
              [event.agent_id]: true,
            },
          };
        case 'QUEUE_UPDATED':
          return {
            queue: event.queue,
            raisedHands: keepHandsForQueuedAgents(state.raisedHands, event.queue),
          };
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
        case 'THOUGHT_UPDATED': {
          const { thought } = event;
          const existing = state.agentThoughts[thought.agent_id] ?? [];
          return {
            agentThoughts: {
              ...state.agentThoughts,
              [thought.agent_id]: [...existing, thought],
            },
          };
        }
        case 'CONVERGENCE_CHECK':
          return {
            convergenceStatus: event.status,
            currentRound: Math.max(state.currentRound, event.rounds_elapsed),
            session: state.session
              ? { ...state.session, rounds_elapsed: event.rounds_elapsed }
              : null,
          };
        case 'SESSION_PAUSED':
          return {
            session: state.session ? { ...state.session, status: 'paused' } : null,
          };
        case 'SESSION_RESUMED':
          return {
            session: state.session ? { ...state.session, status: 'running' } : null,
          };
        case 'SESSION_END':
          return {
            activeAgentId: null,
            summaryPanelOpen: true,
            currentRound: Math.max(state.currentRound, event.rounds_elapsed),
            session: state.session
              ? {
                ...state.session,
                status: 'ended',
                termination_reason: event.reason,
                rounds_elapsed: event.rounds_elapsed,
              }
              : null,
            agentStatuses: toIdleStatuses(state.agents),
            raisedHands: toLoweredHands(state.agents),
          };
        case 'SUMMARY_POSTED':
          return {
            summary: event.summary,
            summaryPanelOpen: true,
            session: state.session
              ? {
                ...state.session,
                termination_reason: event.summary.termination_reason,
              }
              : null,
          };
        case 'ERROR': {
          const newError: LiveError = {
            id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            code: event.code,
            message: event.message,
            agent_id: event.agent_id,
            timestamp: Date.now(),
          };
          const updatedStatuses = event.agent_id
            ? { ...state.agentStatuses, [event.agent_id]: 'errored' as AgentRuntimeStatus }
            : state.agentStatuses;
          return {
            errors: [...state.errors, newError],
            agentStatuses: updatedStatuses,
          };
        }
        default:
          return state;
      }
    }),

  clearError: (id) =>
    set((state) => ({ errors: state.errors.filter((e) => e.id !== id) })),

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
