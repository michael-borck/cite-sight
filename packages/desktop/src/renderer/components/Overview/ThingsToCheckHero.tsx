import { useState } from 'react';
import type { PriorityItem, PriorityCategory } from '@michaelborck/cite-sight-core';
import { PriorityListRow } from './PriorityListRow.js';

interface Props {
  items: PriorityItem[];
  onDismiss: (itemKey: string, type: 'dismiss' | 'fabricated') => void;
}

const CHIP_DEFS: { category: PriorityCategory; label: string; className: string }[] = [
  { category: 'not_found', label: 'Not found', className: 'chip-not_found' },
  { category: 'suspect', label: 'Suspect', className: 'chip-suspect' },
  { category: 'orphan', label: 'Orphan', className: 'chip-orphan' },
];

export function ThingsToCheckHero({ items, onDismiss }: Props) {
  const [hiddenCategories, setHiddenCategories] = useState<Set<PriorityCategory>>(new Set());

  const counts = CHIP_DEFS.reduce<Record<PriorityCategory, number>>(
    (acc, def) => ({ ...acc, [def.category]: items.filter((i) => i.category === def.category).length }),
    { not_found: 0, suspect: 0, orphan: 0 },
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
            ? 'Nothing flagged — every reference verified and every in-text citation matched.'
            : 'All flagged items are filtered out. Click a chip to show them.'}
        </div>
      ) : (
        <div className="priority-list">
          {visibleItems.map((item) => (
            <PriorityListRow key={item.itemKey} item={item} onDismiss={onDismiss} />
          ))}
        </div>
      )}
    </div>
  );
}
