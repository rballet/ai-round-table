'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AgentDraft } from '@/store/sessionStore';
import { AgentRole } from 'shared/types/agent';
import { api } from '@/../lib/api';

interface AgentFormProps {
  initialValues?: Partial<AgentDraft>;
  disabledRoles?: AgentRole[];
  onAdd: (agent: AgentDraft) => void;
  onCancel: () => void;
}

const roleOptions: { value: AgentRole; label: string }[] = [
  { value: 'moderator', label: 'Moderator' },
  { value: 'scribe', label: 'Scribe' },
  { value: 'participant', label: 'Participant' },
];

type ModelOption = { value: string; label: string };

const providerModels: Record<string, ModelOption[]> = {
  anthropic: [
    { value: 'claude-opus-4-7', label: 'claude-opus-4-7 — Latest flagship model' },
    { value: 'claude-opus-4-6',   label: 'claude-opus-4-6 — Previous flagship' },
    { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 — Balanced' },
    { value: 'claude-haiku-4-5',  label: 'claude-haiku-4-5 — Fastest' },
  ],
  openai: [
    { value: 'gpt-5.4',    label: 'gpt-5.4 — Latest flagship model' },
    { value: 'gpt-5.2',    label: 'gpt-5.2 — Previous frontier model' },
    { value: 'gpt-5-mini', label: 'gpt-5-mini — Efficient' },
    { value: 'o3',         label: 'o3 — Reasoning' },
    { value: 'o4-mini',    label: 'o4-mini — Fast reasoning' },
  ],
  gemini: [
    { value: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview — Most capable' },
    { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview — Fast' },
    { value: 'gemini-2.5-pro',         label: 'gemini-2.5-pro — Stable, advanced' },
    { value: 'gemini-2.5-flash',       label: 'gemini-2.5-flash — Stable, fast' },
  ],
  ollama: [
    { value: 'llama3.3',    label: 'llama3.3 — Meta Llama (latest)' },
    { value: 'deepseek-r1', label: 'deepseek-r1 — Reasoning' },
    { value: 'qwen3',       label: 'qwen3 — Alibaba (latest)' },
    { value: 'mistral',     label: 'mistral — Mistral AI' },
    { value: 'gemma3',      label: 'gemma3 — Google' },
    { value: 'phi4',        label: 'phi4 — Microsoft' },
  ],
  mock: [
    { value: 'mock', label: 'mock — No API key required' },
  ],
};

const providerOptions = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai',    label: 'OpenAI' },
  { value: 'gemini',    label: 'Google Gemini' },
  { value: 'ollama',    label: 'Ollama (local)' },
  { value: 'mock',      label: 'Mock (no API key required)' },
];

const categoryOptions = [
  { value: 'general',     label: 'General' },
  { value: 'business',    label: 'Business' },
  { value: 'science',     label: 'Science & Research' },
  { value: 'policy',      label: 'Policy' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'creative',    label: 'Creative' },
];

const defaultDraft: AgentDraft = {
  display_name: '',
  role: 'participant',
  persona_description: '',
  expertise: '',
  llm_provider: 'anthropic',
  llm_model: providerModels.anthropic[0].value,
};

type SavePresetState = 'idle' | 'open' | 'saving' | 'saved' | 'error';

export function AgentForm({ initialValues, disabledRoles, onAdd, onCancel }: AgentFormProps) {
  const [form, setForm] = useState<AgentDraft>({
    ...defaultDraft,
    ...initialValues,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AgentDraft, string>>>({});

  // Save-as-preset state
  const [saveState, setSaveState] = useState<SavePresetState>('idle');
  const [presetDisplayName, setPresetDisplayName] = useState('');
  const [presetCategory, setPresetCategory] = useState('general');
  const [saveError, setSaveError] = useState<string | null>(null);

  const canSavePreset =
    form.display_name.trim().length > 0 &&
    (form.persona_description ?? '').trim().length > 0 &&
    (form.expertise ?? '').trim().length > 0;

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof AgentDraft, string>> = {};
    if (!form.display_name.trim()) newErrors.display_name = 'Name is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onAdd(form);
  };

  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // When provider changes, reset model to the first option for that provider.
      if (key === 'llm_provider') {
        const models = providerModels[value as string] ?? [];
        next.llm_model = models[0]?.value ?? '';
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const openSavePreset = () => {
    setPresetDisplayName(form.display_name);
    setPresetCategory('general');
    setSaveError(null);
    setSaveState('open');
  };

  const closeSavePreset = () => {
    setSaveState('idle');
    setSaveError(null);
  };

  const handleSavePreset = async () => {
    if (!presetDisplayName.trim()) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      await api.createPreset({
        display_name: presetDisplayName.trim(),
        persona_description: (form.persona_description ?? '').trim(),
        expertise: (form.expertise ?? '').trim(),
        suggested_model: form.llm_model,
        llm_provider: form.llm_provider,
        category: presetCategory,
      });
      setSaveState('saved');
      setTimeout(() => {
        setSaveState('idle');
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save preset';
      setSaveError(message);
      setSaveState('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Display Name */}
        <div className="space-y-1.5">
          <label htmlFor="agent-name" className="block text-sm font-medium">
            Name <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="agent-name"
            type="text"
            value={form.display_name}
            onChange={(e) => set('display_name', e.target.value)}
            placeholder="e.g. The Challenger"
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
            aria-required="true"
            aria-describedby={errors.display_name ? 'agent-name-error' : undefined}
          />
          {errors.display_name && (
            <p id="agent-name-error" className="text-xs text-red-500" role="alert">
              {errors.display_name}
            </p>
          )}
        </div>

        {/* Role */}
        <div className="space-y-1.5">
          <label htmlFor="agent-role" className="block text-sm font-medium">
            Role <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <select
            id="agent-role"
            value={form.role}
            onChange={(e) => set('role', e.target.value as AgentRole)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
          >
            {roleOptions.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={disabledRoles?.includes(opt.value)}>
                {opt.label}{disabledRoles?.includes(opt.value) ? ' (max 1)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Provider */}
        <div className="space-y-1.5">
          <label htmlFor="agent-provider" className="block text-sm font-medium">
            Provider
          </label>
          <select
            id="agent-provider"
            value={form.llm_provider}
            onChange={(e) => set('llm_provider', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
          >
            {providerOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <label htmlFor="agent-model" className="block text-sm font-medium">
            Model <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <select
            id="agent-model"
            value={form.llm_model}
            onChange={(e) => set('llm_model', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
            aria-required="true"
            aria-describedby={errors.llm_model ? 'agent-model-error' : undefined}
          >
            {(providerModels[form.llm_provider] ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {form.llm_provider === 'ollama' && (
            <p className="text-xs text-zinc-400">
              Model must be pulled locally first:{' '}
              <code className="font-mono">ollama pull {form.llm_model}</code>
            </p>
          )}
          {errors.llm_model && (
            <p id="agent-model-error" className="text-xs text-red-500" role="alert">
              {errors.llm_model}
            </p>
          )}
        </div>
      </div>

      {/* Expertise */}
      <div className="space-y-1.5">
        <label htmlFor="agent-expertise" className="block text-sm font-medium">
          Expertise
          <span className="ml-1 text-zinc-400 font-normal">(optional)</span>
        </label>
        <input
          id="agent-expertise"
          type="text"
          value={form.expertise ?? ''}
          onChange={(e) => set('expertise', e.target.value)}
          placeholder="e.g. Critical analysis, philosophy, economics..."
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
        />
      </div>

      {/* Persona */}
      <div className="space-y-1.5">
        <label htmlFor="agent-persona" className="block text-sm font-medium">
          Persona Description
          <span className="ml-1 text-zinc-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="agent-persona"
          value={form.persona_description ?? ''}
          onChange={(e) => set('persona_description', e.target.value)}
          placeholder="Describe how this agent should behave and reason..."
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition resize-y"
        />
      </div>

      {/* Save as preset section */}
      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
        <AnimatePresence mode="wait">
          {saveState === 'idle' && (
            <motion.div
              key="trigger"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              <button
                type="button"
                onClick={openSavePreset}
                disabled={!canSavePreset}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900"
                aria-label="Save this agent configuration as a reusable preset"
                title={
                  !canSavePreset
                    ? 'Fill in name, persona description, and expertise to save as preset'
                    : undefined
                }
              >
                + Save as preset
              </button>
            </motion.div>
          )}

          {(saveState === 'open' || saveState === 'saving' || saveState === 'error') && (
            <motion.div
              key="form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 space-y-3">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Save as preset</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="preset-name" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Display name
                    </label>
                    <input
                      id="preset-name"
                      type="text"
                      value={presetDisplayName}
                      onChange={(e) => setPresetDisplayName(e.target.value)}
                      placeholder="Preset name"
                      className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                      aria-required="true"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="preset-category" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Category
                    </label>
                    <select
                      id="preset-category"
                      value={presetCategory}
                      onChange={(e) => setPresetCategory(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                    >
                      {categoryOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {saveError && (
                  <p className="text-xs text-red-500" role="alert">{saveError}</p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSavePreset}
                    disabled={saveState === 'saving' || !presetDisplayName.trim()}
                    className="px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900"
                    aria-label="Save preset"
                  >
                    {saveState === 'saving' ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={closeSavePreset}
                    className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    aria-label="Cancel saving preset"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {saveState === 'saved' && (
            <motion.div
              key="saved"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              aria-live="polite"
            >
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                Preset saved successfully.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          Add Agent
        </button>
      </div>
    </form>
  );
}
