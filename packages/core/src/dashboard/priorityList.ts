// packages/core/src/dashboard/priorityList.ts
import type { ReferenceAnalysisResult } from '../types.js';
import type { PriorityItem } from './types.js';

/**
 * Build the ordered list of flagged items for the "Things to check" hero.
 *
 * Order is deliberate — most-actionable categories first:
 *   1. not_found (could be fabricated)
 *   2. suspect   (metadata mismatch)
 *   3. orphan    (in-text citation with no bib entry)
 *
 * Dismissed items (by itemKey) are filtered out so the hero only shows
 * what the user still needs to look at.
 */
export function gatherPriorityItems(
  refs: ReferenceAnalysisResult,
  dismissed: ReadonlySet<string>,
): PriorityItem[] {
  const notFound: PriorityItem[] = [];
  const suspect: PriorityItem[] = [];
  const orphan: PriorityItem[] = [];

  refs.verifications.forEach((v, idx) => {
    const itemKey = `ref:${idx}`;
    if (dismissed.has(itemKey)) return;

    if (v.status === 'not_found') {
      notFound.push({
        itemKey,
        category: 'not_found',
        headline: v.reference.raw,
        sourceText: v.reference.raw,
        reason: v.flags.includes('grey_literature')
          ? 'Looks like an organisational/web source; academic databases do not index these. Check its URL or publisher — absence here is expected, not evidence of fabrication.'
          : 'Crossref, Semantic Scholar, OpenAlex, and arXiv returned no match.',
      });
    } else if (v.status === 'suspicious') {
      const reason =
        v.matchCategory === 'match_dubious'
          ? 'The closest database record appears to be a different work (its authors do not overlap the citation). The citation itself is unmatched — check it at the source.'
          : v.matchCategory === 'conflict'
            ? "The citation's DOI resolves to a different-titled work — the identifier and the citation disagree."
            : 'A database returned a match, but the metadata does not agree.';
      suspect.push({
        itemKey,
        category: 'suspect',
        headline: v.reference.raw,
        sourceText: v.reference.raw,
        reason,
        matched: v.matchedWork
          ? {
              title: v.matchedWork.title,
              year: v.matchedWork.year,
              doi: v.matchedWork.doi,
              source: v.matchedWork.source,
            }
          : undefined,
      });
    }
  });

  refs.crossReference.unmatchedInText.forEach((c, idx) => {
    const itemKey = `intext:${idx}`;
    if (dismissed.has(itemKey)) return;

    orphan.push({
      itemKey,
      category: 'orphan',
      headline: c.raw,
      sourceText: c.raw,
      reason: 'This citation appears in the body but no bibliography entry matches.',
    });
  });

  return [...notFound, ...suspect, ...orphan];
}
