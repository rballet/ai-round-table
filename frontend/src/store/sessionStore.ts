import { create } from 'zustand';
import { Session } from 'shared/types/session';
import { Agent } from 'shared/types/agent';
import { SessionConfig } from 'shared/types/session';
import { RoundTableEvent } from 'shared/types/events';

// Wizard state for session creation
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

interface SessionStoreState {
  // Session list
  sessions: Session[];
  sessionsLoading: boolean;
  sessionsError: string | null;

  // Current live session
  currentSession: Session | null;
  currentAgents: Agent[];

  // Wizard state for new session creation
  wizard: WizardState;

  // Actions: sessions list
  setSessions: (sessions: Session[]) => void;
  setSessionsLoading: (loading: boolean) => void;
  setSessionsError: (error: string | null) => void;

  // Actions: current session
  setCurrentSession: (session: Session | null) => void;
  setCurrentAgents: (agents: Agent[]) => void;

  // Actions: wizard
  setWizardStep: (step: 1 | 2 | 3) => void;
  setWizardTopic: (topic: string) => void;
  setWizardContext: (context: string) => void;
  addWizardAgent: (agent: AgentDraft) => void;
  removeWizardAgent: (index: number) => void;
  setWizardConfig: (config: Partial<SessionConfig>) => void;
  resetWizard: () => void;

  // WS event handler (source of truth during live sessions)
  handleWSEvent: (event: RoundTableEvent) => void;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessions: [],
  sessionsLoading: false,
  sessionsError: null,

  currentSession: null,
  currentAgents: [],

  wizard: { ...defaultWizard, config: { ...defaultConfig, priority_weights: { ...defaultConfig.priority_weights } } },

  setSessions: (sessions) => set({ sessions }),
  setSessionsLoading: (sessionsLoading) => set({ sessionsLoading }),
  setSessionsError: (sessionsError) => set({ sessionsError }),

  setCurrentSession: (currentSession) => set({ currentSession }),
  setCurrentAgents: (currentAgents) => set({ currentAgents }),

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

  handleWSEvent: (event) => {
    set((state) => {
      switch (event.type) {
        case 'SESSION_START': {
          return {
            currentSession: state.currentSession
              ? { ...state.currentSession, status: 'running' }
              : null,
          };
        }
        case 'SESSION_END': {
          return {
            currentSession: state.currentSession
              ? {
                  ...state.currentSession,
                  status: 'ended',
                  termination_reason: event.reason,
                  ended_at: event.timestamp,
                  rounds_elapsed: event.rounds_elapsed,
                }
              : null,
          };
        }
        case 'SESSION_PAUSED': {
          return {
            currentSession: state.currentSession
              ? { ...state.currentSession, status: 'paused' }
              : null,
          };
        }
        case 'SESSION_RESUMED': {
          return {
            currentSession: state.currentSession
              ? { ...state.currentSession, status: 'running' }
              : null,
          };
        }
        default:
          return {};
      }
    });
  },
}));
