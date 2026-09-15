import { describe, expect, it } from 'vitest';
import { findDuplicateReferences } from '../src/references/duplicates.js';
import type { ParsedReference } from '../src/types.js';

const ref = (over: Partial<ParsedReference>): ParsedReference => ({
  raw: over.raw ?? `${over.authors?.[0] ?? ''} (${over.year}). ${over.title}.`,
  authors: [], year: null, title: '', detectedStyle: 'apa', ...over,
});

describe('findDuplicateReferences', () => {
  it('flags every occurrence after the first, tolerating case and punctuation', () => {
    const entries = [
      ref({ authors: ['Peeters, M. A. G.'], year: 2006, title: 'Personality and Team Performance: A Meta-Analysis' }),
      ref({ authors: ['Smith, J.'], year: 2020, title: 'A study of learning' }),
      ref({ authors: ['peeters, miranda'], year: 2006, title: 'Personality and Team Performance a Meta Analysis' }),
    ];
    expect([...findDuplicateReferences(entries)]).toEqual([2]);
  });
  it('keeps same-author works with different years or titles', () => {
    const entries = [
      ref({ authors: ['Smith, J.'], year: 2020, title: 'A study of learning' }),
      ref({ authors: ['Smith, J.'], year: 2021, title: 'A study of learning' }),
      ref({ authors: ['Smith, J.'], year: 2020, title: 'A study of teaching' }),
    ];
    expect(findDuplicateReferences(entries).size).toBe(0);
  });
});
