import { motion } from 'framer-motion';

interface TokenChipProps {
  x: number;
  y: number;
}

export function TokenChip({ x, y }: TokenChipProps) {
  return (
    <motion.div
      data-testid="token-chip"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
      initial={false}
      animate={{ left: `${x}%`, top: `${y}%` }}
      transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.7 }}
      aria-hidden
    >
      <div className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-1 shadow-sm">
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-amber-700" fill="currentColor">
          <path d="M10 1.5 7.5 7h-6l4.8 4.1L4.8 18 10 14.7 15.2 18l-1.5-6.9L18.5 7h-6L10 1.5Z" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Token</span>
      </div>
    </motion.div>
  );
}
