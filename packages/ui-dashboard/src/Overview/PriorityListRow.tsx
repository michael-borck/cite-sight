import { useState } from 'react';
import type { PriorityItem } from '@michaelborck/cite-sight-core';

interface Props {
  item: PriorityItem;
  onDismiss: (itemKey: string, type: 'dismiss' | 'fabricated') => void;
}

const CATEGORY_LABEL: Record<PriorityItem['category'], string> = {
  not_found: 'Not found',
  suspect: 'Needs review',
  orphan: 'Orphan citation',
  unverified: 'Unverified',
};

function scholarSearchUrl(text: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(text)}`;
}

function webSearchUrl(text: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

export function PriorityListRow({ item, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`priority-row category-${item.category} ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="priority-row-header"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
      >
        <span className="priority-row-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
        <span className="priority-row-category">{CATEGORY_LABEL[item.category]}</span>
        <span className="priority-row-headline">{item.headline}</span>
      </button>

      {expanded && (
        <div className="priority-row-detail">
          {item.reason && <div className="priority-row-reason">{item.reason}</div>}

          <div className="priority-row-source-label">Source</div>
          <blockquote className="priority-row-source">{item.sourceText}</blockquote>

          {item.matched && (
            <>
              <div className="priority-row-source-label">Database returned</div>
              <div className="priority-row-matched">
                <strong>{item.matched.title ?? '(no title)'}</strong>
                {item.matched.year && <> ({item.matched.year})</>}
                {item.matched.source && <>{' \u2014 '}{item.matched.source}</>}
                {item.matched.doi && <>{' \u2014 DOI: '}{item.matched.doi}</>}
              </div>
            </>
          )}

          <div className="priority-row-actions">
            {/* Escape hatches, ordered by what fits the source: grey literature
                (not_indexed_expected) leads with its own URL and a general web
                search — Scholar is the wrong surface for it, which is usually
                why it was flagged at all. Academic rows lead with Scholar. */}
            {item.citedUrl && (
              <a
                className="priority-action priority-action-search"
                href={item.citedUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open cited URL
              </a>
            )}
            {item.matchCategory === 'not_indexed_expected' ? (
              <>
                <a
                  className="priority-action priority-action-search"
                  href={webSearchUrl(item.headline)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Search web
                </a>
                <a
                  className="priority-action priority-action-search"
                  href={scholarSearchUrl(item.headline)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Search Scholar
                </a>
              </>
            ) : (
              <>
                <a
                  className="priority-action priority-action-search"
                  href={scholarSearchUrl(item.headline)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Search Scholar
                </a>
                <a
                  className="priority-action priority-action-search"
                  href={webSearchUrl(item.headline)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Search web
                </a>
              </>
            )}
            <button
              type="button"
              className="priority-action priority-action-dismiss"
              onClick={() => onDismiss(item.itemKey, 'dismiss')}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="priority-action priority-action-fabricated"
              onClick={() => onDismiss(item.itemKey, 'fabricated')}
            >
              Mark as fabricated
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
