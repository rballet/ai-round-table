'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/../lib/api';
import type { SessionTemplate } from 'shared/types/session';

interface TemplatePickerProps {
  onSelect: (template: SessionTemplate) => void;
}

function formatRelativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

export function TemplatePicker({ onSelect }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .getTemplates()
      .then((res) => {
        if (!mounted) return;
        setTemplates(res.templates);
        setIsOpen(res.templates.length > 0);
      })
      .catch(() => {
        if (!mounted) return;
        setTemplates([]);
        setIsOpen(false);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const previous = templates;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setDeletingId(id);
    try {
      await api.deleteTemplate(id);
    } catch {
      setTemplates(previous);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <div className="h-4 w-48 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        aria-expanded={isOpen}
        aria-controls="template-picker-content"
      >
        <span>Load a saved template</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id="template-picker-content"
            key="template-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-100 dark:border-zinc-800">
              {templates.length === 0 ? (
                <p className="px-4 py-3 text-sm text-zinc-400 dark:text-zinc-500">
                  No saved templates yet.
                </p>
              ) : (
                <ul role="list" className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {templates.map((template) => (
                    <li key={template.id} className="flex items-center gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors group">
                      <button
                        type="button"
                        onClick={() => onSelect(template)}
                        className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 rounded"
                        aria-label={`Load template: ${template.name}`}
                      >
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          {template.name}
                        </p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                          {template.agents.length} {template.agents.length === 1 ? 'agent' : 'agents'} &middot; saved {formatRelativeDate(template.created_at)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(template.id, e); }}
                        disabled={deletingId === template.id}
                        className="shrink-0 px-2 py-1 rounded text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                        aria-label={`Delete template: ${template.name}`}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Start fresh option */}
              <div className="border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-full px-4 py-2.5 text-left text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                >
                  No template — start fresh
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
