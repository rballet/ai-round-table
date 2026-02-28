'use client';

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3;
  steps: { label: string }[];
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <nav aria-label="Setup progress" className="flex items-center gap-0">
      {steps.map((step, index) => {
        const stepNumber = (index + 1) as 1 | 2 | 3;
        const isCompleted = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;

        return (
          <div key={step.label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                aria-current={isActive ? 'step' : undefined}
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
                  ${isCompleted
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                    : isActive
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 ring-4 ring-zinc-900/20 dark:ring-white/20'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }
                `}
              >
                {isCompleted ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNumber
                )}
              </div>
              <span
                className={`text-sm font-medium hidden sm:block ${
                  isActive
                    ? 'text-zinc-900 dark:text-white'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                aria-hidden="true"
                className={`mx-3 h-px w-12 sm:w-16 transition-colors ${
                  isCompleted ? 'bg-zinc-900 dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-700'
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
