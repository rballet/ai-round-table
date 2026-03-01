'use client';

import { useState } from 'react';
import { AgentDraft } from '@/store/sessionStore';
import { AgentRole } from 'shared/types/agent';

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
    { value: 'claude-opus-4-6',   label: 'claude-opus-4-6 — Most capable' },
    { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 — Balanced' },
    { value: 'claude-haiku-4-5',  label: 'claude-haiku-4-5 — Fastest' },
  ],
  openai: [
    { value: 'gpt-5.2',    label: 'gpt-5.2 — Most capable' },
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

const defaultDraft: AgentDraft = {
  display_name: '',
  role: 'participant',
  persona_description: '',
  expertise: '',
  llm_provider: 'anthropic',
  llm_model: providerModels.anthropic[0].value,
};

export function AgentForm({ initialValues, disabledRoles, onAdd, onCancel }: AgentFormProps) {
  const [form, setForm] = useState<AgentDraft>({
    ...defaultDraft,
    ...initialValues,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AgentDraft, string>>>({});

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
