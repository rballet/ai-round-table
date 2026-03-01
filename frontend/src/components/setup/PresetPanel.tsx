'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/../lib/api';
import type { AgentPreset } from 'shared/types/agent';

interface PresetPanelProps {
  onSelect: (preset: AgentPreset) => void;
  onDelete?: (preset: AgentPreset) => void;
}

const CATEGORY_ORDER = ['general', 'business', 'science', 'policy', 'engineering', 'creative'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  business: 'Business',
  science: 'Science & Research',
  policy: 'Policy',
  engineering: 'Engineering',
  creative: 'Creative',
};

export function PresetPanel({ onSelect, onDelete }: PresetPanelProps) {
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('general');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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

  // Derive the ordered list of categories that actually have presets
  const availableCategories = CATEGORY_ORDER.filter((cat) =>
    presets.some((p) => p.category === cat)
  );

  const filteredPresets = presets.filter((p) => p.category === selectedCategory);

  const handleDelete = async (preset: AgentPreset) => {
    const index = presets.findIndex((p) => p.id === preset.id);
    // Optimistic remove
    setPresets((prev) => prev.filter((p) => p.id !== preset.id));
    setDeleteError(null);
    try {
      await api.deletePreset(preset.id);
      onDelete?.(preset);
    } catch (err: unknown) {
      // Rollback: re-insert at original position to preserve sort order
      setPresets((prev) => {
        const next = [...prev];
        next.splice(index, 0, preset);
        return next;
      });
      const message = err instanceof Error ? err.message : 'Failed to delete preset';
      setDeleteError(message);
    }
  };

  return (
    <aside className="space-y-3" aria-label="Agent presets">
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

      {deleteError && (
        <p className="text-xs text-red-500" role="alert">{deleteError}</p>
      )}

      {!loading && !error && (
        <>
          {/* Category filter pills */}
          {availableCategories.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Filter presets by category"
            >
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  aria-pressed={selectedCategory === cat}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900 ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.ul
              key={selectedCategory}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="space-y-2"
              role="list"
            >
              {filteredPresets.length === 0 && (
                <li className="text-xs text-zinc-400 py-2">
                  No presets in this category.
                </li>
              )}
              {filteredPresets.map((preset) => (
                <motion.li
                  key={preset.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className="relative"
                  onMouseEnter={() => setHoveredId(preset.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(preset)}
                    className="w-full text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                    aria-label={`Use preset: ${preset.display_name}`}
                  >
                    <p className="text-sm font-semibold leading-tight pr-5">{preset.display_name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                      {preset.expertise}
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                      {preset.llm_provider}
                    </p>
                  </button>

                  {/* Delete button for user presets */}
                  {!preset.is_system && (
                    <AnimatePresence>
                      {hoveredId === preset.id && (
                        <motion.button
                          type="button"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.1 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(preset);
                          }}
                          className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-500 text-xs leading-none"
                          aria-label={`Delete preset: ${preset.display_name}`}
                        >
                          &times;
                        </motion.button>
                      )}
                    </AnimatePresence>
                  )}
                </motion.li>
              ))}
            </motion.ul>
          </AnimatePresence>
        </>
      )}
    </aside>
  );
}
