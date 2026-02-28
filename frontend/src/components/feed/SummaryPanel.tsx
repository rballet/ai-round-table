'use client';

import { ReactNode } from 'react';
import { TerminationReason } from 'shared/types/session';
import { LiveSummary } from '@/store/sessionStore';

interface SummaryPanelProps {
  isOpen: boolean;
  summary: LiveSummary | null;
  terminationReason: TerminationReason;
  onClose: () => void;
}

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string };

const terminationLabel: Record<Exclude<TerminationReason, null>, string> = {
  consensus: 'Consensus',
  cap: 'Round Cap',
  host: 'Host End',
};

const terminationStyles: Record<Exclude<TerminationReason, null>, string> = {
  consensus: 'bg-emerald-100 text-emerald-800',
  cap: 'bg-slate-200 text-slate-700',
  host: 'bg-amber-100 text-amber-800',
};

function renderInlineMarkdown(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
      }
      return <span key={`${part}-${index}`}>{part}</span>;
    });
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      });
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const bulletLine = lines[i].trim();
        if (!/^[-*]\s+/.test(bulletLine)) {
          break;
        }
        items.push(bulletLine.replace(/^[-*]\s+/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    const paragraphParts = [line];
    i += 1;
    while (i < lines.length) {
      const nextLine = lines[i].trim();
      if (!nextLine || /^(#{1,3})\s+/.test(nextLine) || /^[-*]\s+/.test(nextLine)) {
        break;
      }
      paragraphParts.push(nextLine);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphParts.join(' ') });
  }

  return blocks;
}

function MarkdownContent({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          if (block.level === 1) {
            return (
              <h3 key={`h1-${index}`} className="text-lg font-semibold text-slate-900">
                {renderInlineMarkdown(block.text)}
              </h3>
            );
          }
          if (block.level === 2) {
            return (
              <h4 key={`h2-${index}`} className="text-base font-semibold text-slate-900">
                {renderInlineMarkdown(block.text)}
              </h4>
            );
          }
          return (
            <h5 key={`h3-${index}`} className="text-sm font-semibold text-slate-900">
              {renderInlineMarkdown(block.text)}
            </h5>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={`list-${index}`} className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {block.items.map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`p-${index}`} className="text-sm leading-relaxed text-slate-700">
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
}

export function SummaryPanel({ isOpen, summary, terminationReason, onClose }: SummaryPanelProps) {
  if (!isOpen) {
    return null;
  }

  const effectiveReason = summary?.termination_reason ?? terminationReason;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-3xl items-end sm:items-center">
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Session summary"
          className="w-full rounded-2xl border border-slate-200 bg-white shadow-2xl"
          data-testid="summary-panel"
        >
          <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Session Summary</h2>
              {effectiveReason && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${terminationStyles[effectiveReason]}`}
                  data-testid="termination-reason-badge"
                >
                  {terminationLabel[effectiveReason]}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
              aria-label="Close summary panel"
            >
              Close
            </button>
          </header>

          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            {summary ? (
              <MarkdownContent content={summary.content} />
            ) : (
              <p className="text-sm text-slate-600">
                Session ended. Waiting for the scribe summary to be posted...
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
