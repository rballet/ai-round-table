'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/../lib/api';
import { useSessionStore } from '@/store/sessionStore';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { Step1Topic } from '@/components/setup/Step1Topic';
import { Step2Agents } from '@/components/setup/Step2Agents';
import { Step3Config } from '@/components/setup/Step3Config';
import { CreateSessionRequest } from 'shared/types/api';

const STEPS = [
  { label: 'Topic & Context' },
  { label: 'Agent Lineup' },
  { label: 'Session Config' },
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -40 : 40,
    opacity: 0,
  }),
};

export default function NewSessionPage() {
  const router = useRouter();
  const { wizard, setWizardStep, resetWizard } = useSessionStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);

  const goToStep = (next: 1 | 2 | 3) => {
    setDirection(next > wizard.step ? 1 : -1);
    setWizardStep(next);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const payload: CreateSessionRequest = {
      topic: wizard.topic,
      supporting_context: wizard.supporting_context || undefined,
      config: wizard.config,
      agents: wizard.agents,
    };

    try {
      const response = await api.createSession(payload);
      resetWizard();
      router.push(`/sessions/${response.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      setSubmitError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Link
              href="/"
              className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900 rounded"
              aria-label="Back to sessions list"
            >
              Sessions
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-zinc-900 dark:text-white font-medium">New Session</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">New Session</h1>
          <StepIndicator currentStep={wizard.step} steps={STEPS} />
        </header>

        {/* Step content */}
        <div
          className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 overflow-hidden"
          aria-live="polite"
          aria-atomic="false"
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={wizard.step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              {wizard.step === 1 && (
                <Step1Topic onNext={() => goToStep(2)} />
              )}
              {wizard.step === 2 && (
                <Step2Agents
                  onNext={() => goToStep(3)}
                  onBack={() => goToStep(1)}
                />
              )}
              {wizard.step === 3 && (
                <Step3Config
                  onBack={() => goToStep(2)}
                  onSubmit={handleSubmit}
                  isSubmitting={isSubmitting}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Submit error */}
        {submitError && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm"
          >
            {submitError}
          </div>
        )}
      </div>
    </main>
  );
}
