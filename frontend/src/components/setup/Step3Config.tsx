'use client';

import { useState } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { api } from '@/../lib/api';

interface Step3ConfigProps {
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function Step3Config({ onBack, onSubmit, isSubmitting }: Step3ConfigProps) {
  const { wizard, setWizardConfig } = useSessionStore();
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [templateSaveError, setTemplateSaveError] = useState<string | null>(null);

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setIsSavingTemplate(true);
    setTemplateSaveError(null);
    try {
      await api.createTemplate({
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        agents: wizard.agents,
        config: wizard.config,
      });
      setTemplateSaved(true);
      setTemplateName('');
      setTemplateDescription('');
      setTimeout(() => setTemplateSaved(false), 2000);
    } catch (err) {
      setTemplateSaveError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setIsSavingTemplate(false);
    }
  };
  const { config } = wizard;

  const setPriorityWeight = (key: 'recency' | 'novelty' | 'role', value: number) => {
    setWizardConfig({
      priority_weights: {
        ...config.priority_weights,
        [key]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Session Config</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Configure how the session runs. Defaults are suitable for most discussions.
        </p>
      </div>

      <div className="space-y-6">
        {/* Basic settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="max-rounds" className="block text-sm font-medium">
              Max Rounds
            </label>
            <input
              id="max-rounds"
              type="number"
              min={1}
              max={50}
              value={config.max_rounds}
              onChange={(e) => setWizardConfig({ max_rounds: parseInt(e.target.value, 10) || 1 })}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
            />
            <p className="text-xs text-zinc-400">Hard cap on discussion rounds.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="convergence" className="block text-sm font-medium">
              Convergence Majority
            </label>
            <input
              id="convergence"
              type="number"
              min={0.1}
              max={1}
              step={0.05}
              value={config.convergence_majority}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0.1 && v <= 1) {
                  setWizardConfig({ convergence_majority: v });
                }
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
            />
            <p className="text-xs text-zinc-400">Fraction of agents that must agree (0.1–1.0).</p>
          </div>
        </div>

        {/* Priority weights */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Priority Weights</legend>
          <p className="text-xs text-zinc-400">
            Control how agents are prioritised in the queue. Values are relative.
          </p>

          {(['recency', 'novelty', 'role'] as const).map((key) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor={`weight-${key}`} className="text-sm capitalize text-zinc-700 dark:text-zinc-300">
                  {key}
                </label>
                <span className="text-sm font-mono text-zinc-500">
                  {config.priority_weights[key].toFixed(2)}
                </span>
              </div>
              <input
                id={`weight-${key}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.priority_weights[key]}
                onChange={(e) => setPriorityWeight(key, parseFloat(e.target.value))}
                className="w-full accent-zinc-900 dark:accent-white"
                aria-label={`Priority weight for ${key}`}
              />
            </div>
          ))}
        </fieldset>

        {/* Thought inspector toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Thought Inspector</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Reveals agents&apos; private reasoning as they update their views.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.thought_inspector_enabled}
            aria-label="Toggle Thought Inspector"
            onClick={() =>
              setWizardConfig({ thought_inspector_enabled: !config.thought_inspector_enabled })
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${
              config.thought_inspector_enabled
                ? 'bg-zinc-900 dark:bg-white'
                : 'bg-zinc-200 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-zinc-900 transition-transform ${
                config.thought_inspector_enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Save as template */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Save as template</p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Template name (required)"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
            aria-label="Template name"
          />
          <textarea
            placeholder="Description (optional)"
            value={templateDescription}
            onChange={(e) => setTemplateDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition resize-none"
            aria-label="Template description"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={!templateName.trim() || isSavingTemplate}
            className="px-4 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-sm font-medium hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            aria-label="Save session config as template"
          >
            {isSavingTemplate ? 'Saving...' : 'Save template'}
          </button>
          {templateSaved && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
              Template saved!
            </span>
          )}
          {templateSaveError && (
            <span className="text-sm text-red-600 dark:text-red-400" role="alert">
              {templateSaveError}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Go back to Agent Lineup step"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="px-5 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          aria-label="Create session"
        >
          {isSubmitting ? 'Creating...' : 'Create Session'}
        </button>
      </div>
    </div>
  );
}
