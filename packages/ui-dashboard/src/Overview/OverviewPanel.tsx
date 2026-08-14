import { useMemo, useState } from 'react';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';
import { computeVerdict, gatherPriorityItems } from '@michaelborck/cite-sight-core/dashboard';
import { VerdictHero } from './VerdictHero';
import { ThingsToCheckHero } from './ThingsToCheckHero';
import { UndoToast } from './UndoToast';
import './Overview.css';

interface Props {
  results: AnalysisResult;
  /** Dismissal state now lives in the dashboard shell so all count surfaces
   *  (summary strip, sidebar badges, panel chips) update together. */
  dismissed: Set<string>;
  onDismissedChange: (next: Set<string>) => void;
}

interface PendingDismissal {
  itemKey: string;
  type: 'dismiss' | 'fabricated';
  headline: string;
}

export function OverviewPanel({ results, dismissed, onDismissedChange }: Props) {
  const [pending, setPending] = useState<PendingDismissal | null>(null);

  const verdict = useMemo(() => computeVerdict(results.references, dismissed), [results.references, dismissed]);
  const items = useMemo(() => gatherPriorityItems(results.references, dismissed), [results.references, dismissed]);

  const handleDismiss = (itemKey: string, type: 'dismiss' | 'fabricated') => {
    const item = items.find((i) => i.itemKey === itemKey);
    const headline = item?.headline ?? itemKey;

    const next = new Set(dismissed);
    next.add(itemKey);
    onDismissedChange(next);
    setPending({ itemKey, type, headline });
  };

  const handleUndo = () => {
    if (!pending) return;
    const next = new Set(dismissed);
    next.delete(pending.itemKey);
    onDismissedChange(next);
    setPending(null);
  };

  const handleExpire = () => {
    setPending(null);
  };

  return (
    <div className="overview-panel">
      <VerdictHero
        fileName={results.fileName}
        processingTimeMs={results.processingTime}
        verdict={verdict}
      />
      <ThingsToCheckHero items={items} onDismiss={handleDismiss} />

      {pending && (
        <UndoToast
          message={
            pending.type === 'dismiss'
              ? `Dismissed: ${pending.headline}`
              : `Marked as fabricated: ${pending.headline}`
          }
          onUndo={handleUndo}
          onExpire={handleExpire}
        />
      )}
    </div>
  );
}
