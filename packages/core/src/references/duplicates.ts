import type { ParsedReference } from '../types.js';
import { normalizeTitle } from './matching.js';
import { authorKey } from './crossReference.js';

/**
 * Indices of bibliography entries that repeat an earlier entry — same first
 * author, year and title after normalisation. Hand-built reference lists
 * commonly accumulate duplicates across editing sessions; markers copy the
 * list from an earlier submission without noticing. Reported on every
 * occurrence after the first.
 */
export function findDuplicateReferences(references: ParsedReference[]): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();
  references.forEach((ref, index) => {
    const key = [
      authorKey((ref.authors[0] ?? ref.raw).split(',')[0]),
      ref.year ?? 'nd',
      normalizeTitle(ref.title || ref.raw).split(' ').slice(0, 12).join(' '),
    ].join('|');
    const first = seen.get(key);
    if (first !== undefined) duplicates.add(index);
    else seen.set(key, index);
  });
  return duplicates;
}
