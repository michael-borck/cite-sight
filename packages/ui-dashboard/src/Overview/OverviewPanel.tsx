import { useMemo } from 'react';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';
import { computeVerdict, gatherPriorityItems } from '@michaelborck/cite-sight-core/dashboard';
import { ThingsToCheckHero } from './ThingsToCheckHero';
import { VerdictHero } from './VerdictHero';
import './Overview.css';

interface Props {
  results: AnalysisResult;
  dismissed: Set<string>;
  onReverify?: (idx: number) => Promise<void>;
  rechecking?: Set<number>;
}

export function OverviewPanel({ results, dismissed, onReverify, rechecking }: Props) {
  const items = useMemo(() => gatherPriorityItems(results.references, dismissed), [results.references, dismissed]);
  // The headline verdict was built but never rendered, so every report opened on
  // a count sentence with no indication of how bad it was. "Issues" is reserved
  // for a threshold breach (see computeVerdict), which keeps the pill from
  // crying wolf on one typo.
  const verdict = useMemo(() => computeVerdict(results.references, dismissed), [results.references, dismissed]);
  return <div className="overview-panel">
    <VerdictHero fileName={results.fileName} processingTimeMs={results.processingTime} verdict={verdict} />
    <ThingsToCheckHero items={items} onReverify={onReverify} rechecking={rechecking} />
  </div>;
}
