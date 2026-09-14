import { useMemo } from 'react';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';
import { gatherPriorityItems } from '@michaelborck/cite-sight-core/dashboard';
import { ThingsToCheckHero } from './ThingsToCheckHero';
import './Overview.css';

interface Props {
  results: AnalysisResult;
  dismissed: Set<string>;
  onReverify?: (idx: number) => Promise<void>;
  rechecking?: Set<number>;
}

export function OverviewPanel({ results, dismissed, onReverify, rechecking }: Props) {
  const items = useMemo(() => gatherPriorityItems(results.references, dismissed), [results.references, dismissed]);
  return <div className="overview-panel">
    <ThingsToCheckHero items={items} onReverify={onReverify} rechecking={rechecking} />
  </div>;
}
