import { createContext, useContext, useId } from 'react';
import type { AnalysisResult, ReviewDecision } from '@michaelborck/cite-sight-core';
import { REVIEW_LABELS, reviewKey } from '@michaelborck/cite-sight-core/review';
import './Workflow.css';

export const ReviewContext = createContext<{
  result: AnalysisResult;
  record: (key: string, decision?: ReviewDecision) => void;
} | null>(null);

export function ReviewActions({ itemKey }: { itemKey: string }) {
  const context = useContext(ReviewContext);
  const id = useId();
  if (!context) return null;
  const decision = context.result.reviews?.[reviewKey(context.result, itemKey)]?.decision;
  return <div className="review-actions" onClick={(event) => event.stopPropagation()}>
    {!decision && <button type="button" onClick={() => context.record(itemKey, 'reviewed')}>Mark reviewed</button>}
    <label htmlFor={id}>Record review decision
      <select id={id} value={decision ?? ''} onChange={(event) => context.record(itemKey, (event.target.value || undefined) as ReviewDecision | undefined)}>
        <option value="">Not reviewed</option>
        {Object.entries(REVIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {decision && <button type="button" onClick={() => context.record(itemKey)}>Undo review</button>}
  </div>;
}
