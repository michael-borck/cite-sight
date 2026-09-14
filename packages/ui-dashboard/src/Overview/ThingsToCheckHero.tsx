import { useState } from 'react';
import type { PriorityItem, PriorityCategory } from '@michaelborck/cite-sight-core';
import { PriorityListRow } from './PriorityListRow';

interface Props {
  items: PriorityItem[];
  onReverify?: (idx: number) => Promise<void>;
  rechecking?: Set<number>;
}

const CHIP_DEFS: { category: PriorityCategory; label: string; className: string }[] = [
  { category: 'not_found', label: 'Not found', className: 'chip-not_found' },
  { category: 'suspect', label: 'Needs review', className: 'chip-suspect' },
  { category: 'orphan', label: 'Orphan', className: 'chip-orphan' },
  { category: 'unverified', label: 'Unverified', className: 'chip-unverified' },
];

export function ThingsToCheckHero({ items, onReverify, rechecking }: Props) {
  const [hiddenCategories, setHiddenCategories] = useState<Set<PriorityCategory>>(new Set());

  const counts = CHIP_DEFS.reduce<Record<PriorityCategory, number>>(
    (acc, def) => ({ ...acc, [def.category]: items.filter((i) => i.category === def.category).length }),
    { not_found: 0, suspect: 0, orphan: 0, unverified: 0 },
  );

  const visibleItems = items.filter((i) => !hiddenCategories.has(i.category));

  const toggleCategory = (cat: PriorityCategory) => {
    setHiddenCategories((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="hero-card">
      <div className="hero-section-title">Things to check</div>

      <div className="filter-chips">
        {CHIP_DEFS.map((def) => {
          const hidden = hiddenCategories.has(def.category);
          return (
            <button
              key={def.category}
              type="button"
              className={`filter-chip ${def.className} ${hidden ? 'off' : ''}`}
              onClick={() => toggleCategory(def.category)}
              aria-pressed={!hidden}
            >
              {def.label} · {counts[def.category]}
            </button>
          );
        })}
      </div>

      {visibleItems.length === 0 ? (
        <div className="priority-empty">
          {items.length === 0
             ? 'No outstanding items in this review list. Reviewed items remain available below.'
            : 'All flagged items are filtered out. Click a chip to show them.'}
        </div>
      ) : (
        <div className="priority-list">
          {visibleItems.map((item) => (
            <PriorityListRow key={item.itemKey} item={item} onReverify={onReverify} rechecking={rechecking} />
          ))}
        </div>
      )}
    </div>
  );
}
