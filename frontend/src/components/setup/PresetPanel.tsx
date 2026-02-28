'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/../lib/api';
import { AgentPreset } from 'shared/types/agent';

interface PresetPanelProps {
  onSelect: (preset: AgentPreset) => void;
}

export function PresetPanel({ onSelect }: PresetPanelProps) {
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPresets()
      .then((res) => setPresets(res.presets))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load presets';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <aside
      className="space-y-3"
      aria-label="Agent presets"
    >
      <div>
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Presets</h3>
        <p className="text-xs text-zinc-400 mt-0.5">Click a preset to pre-fill the form.</p>
      </div>

      {loading && (
        <div className="space-y-2" role="status" aria-label="Loading presets">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500" role="alert">{error}</p>
      )}

      <AnimatePresence>
        {!loading && !error && (
          <ul className="space-y-2" role="list">
            {presets.map((preset) => (
              <motion.li
                key={preset.id}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(preset)}
                  className="w-full text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                  aria-label={`Use preset: ${preset.display_name}`}
                >
                  <p className="text-sm font-semibold leading-tight">{preset.display_name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                    {preset.expertise}
                  </p>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </AnimatePresence>
    </aside>
  );
}
