import { useMemo, useState } from 'react';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';
import { computeVerdict, gatherPriorityItems } from '@michaelborck/cite-sight-core/dashboard';
import { VerdictHero } from './VerdictHero.js';
import { ThingsToCheckHero } from './ThingsToCheckHero.js';
import { UndoToast } from './UndoToast.js';
import './Overview.css';

interface Props {
  results: AnalysisResult;
}

interface PendingDismissal {
  itemKey: string;
  type: 'dismiss' | 'fabricated';
  headline: string;
}

export function OverviewPanel({ results }: Props) {
  // Session-only dismissal state — lost on tab change or reload (Phase 1).
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingDismissal | null>(null);

  const verdict = useMemo(() => computeVerdict(results.references, dismissed), [results.references, dismissed]);
  const items = useMemo(() => gatherPriorityItems(results.references, dismissed), [results.references, dismissed]);

  const handleDismiss = (itemKey: string, type: 'dismiss' | 'fabricated') => {
    const item = items.find((i) => i.itemKey === itemKey);
    const headline = item?.headline ?? itemKey;

    setDismissed((s) => {
      const next = new Set(s);
      next.add(itemKey);
      return next;
    });
    setPending({ itemKey, type, headline });
  };

  const handleUndo = () => {
    if (!pending) return;
    setDismissed((s) => {
      const next = new Set(s);
      next.delete(pending.itemKey);
      return next;
    });
    setPending(null);
  };

  const handleExpire = () => {
    // No-op for the dismissal itself — it was already applied at click time.
    // We just clear the toast slot.
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
