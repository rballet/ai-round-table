'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LiveError } from '@/store/sessionStore';

const MAX_VISIBLE_TOASTS = 3;
const AUTO_DISMISS_MS = 5000;

interface ToastItemProps {
  error: LiveError;
  onDismiss: (id: string) => void;
}

function ToastItem({ error, onDismiss }: ToastItemProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onDismiss(error.id);
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [error.id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 48, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, scale: 0.95 }}
      transition={{ duration: 0.22 }}
      role="alert"
      aria-live="assertive"
      className="flex w-80 max-w-full items-start gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 shadow-lg"
    >
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
        !
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-red-700">
            {error.code}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-slate-700">{error.message}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss error notification"
        onClick={() => onDismiss(error.id)}
        className="ml-auto shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>
    </motion.div>
  );
}

interface ToastContainerProps {
  errors: LiveError[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ errors, onDismiss }: ToastContainerProps) {
  const visibleErrors = errors.slice(-MAX_VISIBLE_TOASTS);

  return (
    <div
      aria-label="Error notifications"
      className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-2"
    >
      <AnimatePresence initial={false}>
        {visibleErrors.map((error) => (
          <ToastItem key={error.id} error={error} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
