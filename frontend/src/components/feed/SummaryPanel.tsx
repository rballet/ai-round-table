'use client';

import { ReactNode, useState, useCallback } from 'react';
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
  error: 'Error',
};

const terminationStyles: Record<Exclude<TerminationReason, null>, string> = {
  consensus: 'bg-emerald-100 text-emerald-800',
  cap: 'bg-slate-200 text-slate-700',
  host: 'bg-amber-100 text-amber-800',
  error: 'bg-rose-100 text-rose-800',
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
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!summary) return;
    await navigator.clipboard.writeText(summary.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [summary]);

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
          className="flex w-full max-h-[90vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
          data-testid="summary-panel"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
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
            <div className="flex items-center gap-1">
              {summary && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
                  aria-label="Copy summary to clipboard"
                >
                  {copied ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5 text-emerald-600">
                        <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                      </svg>
                      <span className="text-emerald-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
                        <path fillRule="evenodd" d="M11 2.5a.5.5 0 0 1 .5.5v1h1a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 4 12.5v-1H3a.5.5 0 0 1-.5-.5v-7A.5.5 0 0 1 3 3.5h1V3a.5.5 0 0 1 .5-.5h6.5ZM5.5 4v1H5a.5.5 0 0 0-.5.5V12h6.5a.5.5 0 0 0 .5-.5V5.5A.5.5 0 0 0 11.5 5h-.5V4h-5.5ZM6 3h5v1H6V3Zm5.5 3H5.5v.5h6v-.5Z" clipRule="evenodd" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
                aria-label="Close summary panel"
              >
                Close
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
