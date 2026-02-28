'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSessionStore, AgentDraft } from '@/store/sessionStore';
import { AgentForm } from './AgentForm';
import { PresetPanel } from './PresetPanel';
import { AgentPreset } from 'shared/types/agent';

interface Step2AgentsProps {
  onNext: () => void;
  onBack: () => void;
}

const ROLE_BADGE: Record<string, string> = {
  moderator: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  scribe: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  participant: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

function validateLineup(agents: AgentDraft[]): string | null {
  const moderators = agents.filter((a) => a.role === 'moderator');
  const scribes = agents.filter((a) => a.role === 'scribe');
  const participants = agents.filter((a) => a.role === 'participant');
  if (moderators.length < 1) return 'You need at least 1 moderator agent.';
  if (scribes.length < 1) return 'You need at least 1 scribe agent.';
  if (participants.length < 2) return 'You need at least 2 participant agents.';
  return null;
}

export function Step2Agents({ onNext, onBack }: Step2AgentsProps) {
  const { wizard, addWizardAgent, removeWizardAgent } = useSessionStore();
  const [showForm, setShowForm] = useState(false);
  const [prefilledValues, setPrefilledValues] = useState<Partial<AgentDraft>>({});
  const [lineupError, setLineupError] = useState<string | null>(null);

  const handleAddAgent = (agent: AgentDraft) => {
    addWizardAgent(agent);
    setShowForm(false);
    setPrefilledValues({});
    setLineupError(null);
  };

  const handlePresetSelect = (preset: AgentPreset) => {
    setPrefilledValues({
      display_name: preset.display_name,
      persona_description: preset.persona_description,
      expertise: preset.expertise,
      llm_model: preset.suggested_model,
      role: 'participant',
      llm_provider: 'anthropic',
    });
    setShowForm(true);
  };

  const handleNext = () => {
    const error = validateLineup(wizard.agents);
    if (error) {
      setLineupError(error);
      return;
    }
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Agent Lineup</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Add agents for the discussion. You need at least 1 moderator, 1 scribe, and 2 participants.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent list + form — left 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          {/* Current agents */}
          {wizard.agents.length > 0 && (
            <ul className="space-y-2" role="list" aria-label="Configured agents">
              <AnimatePresence initial={false}>
                {wizard.agents.map((agent, index) => (
                  <motion.li
                    key={`${agent.display_name}-${index}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {agent.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{agent.display_name}</p>
                          <p className="text-xs text-zinc-400 truncate">{agent.llm_provider} / {agent.llm_model}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[agent.role]}`}
                        >
                          {agent.role}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeWizardAgent(index)}
                          className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          aria-label={`Remove agent ${agent.display_name}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          {/* Add agent button */}
          {!showForm && (
            <button
              type="button"
              onClick={() => { setShowForm(true); setPrefilledValues({}); }}
              className="w-full py-3 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              aria-label="Add a new agent"
            >
              + Add Agent
            </button>
          )}

          {/* Agent form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50"
              >
                <h3 className="text-sm font-semibold mb-4">New Agent</h3>
                <AgentForm
                  initialValues={prefilledValues}
                  onAdd={handleAddAgent}
                  onCancel={() => { setShowForm(false); setPrefilledValues({}); }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lineup validation error */}
          {lineupError && (
            <p className="text-sm text-red-500" role="alert" aria-live="polite">
              {lineupError}
            </p>
          )}
        </div>

        {/* Preset panel — right col */}
        <div className="lg:col-span-1">
          <PresetPanel onSelect={handlePresetSelect} />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Go back to Topic step"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="px-5 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          aria-label="Go to next step: Session Config"
        >
          Next: Session Config
        </button>
      </div>
    </div>
  );
}
