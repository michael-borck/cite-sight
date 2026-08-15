// packages/core/src/dashboard/priorityList.ts

/**
 * Stable content key for a reference — dismissals persist against WHAT was
 * cited, not where it sat in one run's row order, so a triage decision made
 * once holds across re-scans, app restarts, and other documents citing the
 * same work identically. djb2 over the normalised raw string: collision odds
 * are irrelevant at bibliography scale and it runs in the browser.
 */
export function referenceContentKey(raw: string): string {
  const norm = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  }
  return `refkey:${h.toString(36)}:${norm.length}`;
}
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
/**
 * Collapsed-row headline. The raw string starts with the author block, and a
 * many-author reference (60 names is real) truncates before the title ever
 * appears — the one thing that identifies the work. Prefer
 * "Title — FirstAuthor et al., Year", falling back to raw when parsing gave
 * no title. This string also seeds the Scholar/web search actions, where
 * title + first author outperforms a wall of initials.
 */
function headlineFor(ref: { raw: string; title: string; authors: string[]; year: number | null }): string {
  if (!ref.title) return ref.raw;
  const first = (ref.authors[0] ?? '').split(',')[0].trim();
  const who = first ? `${first}${ref.authors.length > 1 ? ' et al.' : ''}` : '';
  const tail = [who, ref.year ? String(ref.year) : ''].filter(Boolean).join(', ');
  return tail ? `${ref.title} — ${tail}` : ref.title;
}

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
        headline: headlineFor(v.reference),
        sourceText: v.reference.raw,
        reason: v.flags.includes('grey_literature')
          ? 'Looks like an organisational/web source; academic databases do not index these. Check its URL or publisher — absence here is expected, not evidence of fabrication.'
          : 'Crossref, Semantic Scholar, OpenAlex, and arXiv returned no match.',
        citedUrl: v.reference.url,
        screenshotPath: v.urlCheck?.screenshotPath,
        matchCategory: v.matchCategory,
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
        headline: headlineFor(v.reference),
        sourceText: v.reference.raw,
        reason,
        citedUrl: v.reference.url,
        screenshotPath: v.urlCheck?.screenshotPath,
        matchCategory: v.matchCategory,
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

  const unverified: PriorityItem[] = [];
  refs.verifications.forEach((v, idx) => {
    const itemKey = `ref:${idx}`;
    if (dismissed.has(itemKey)) return;
    if (v.status === 'unverified') {
      unverified.push({
        itemKey,
        category: 'unverified',
        headline: headlineFor(v.reference),
        sourceText: v.reference.raw,
        reason: v.unavailable
          ? `Could not check: ${v.unavailable.reason.replace('_', '-')} on ${v.unavailable.service.replace('_', ' ')}. This is not a judgement on the citation — re-run to retry.`
          : 'A database lookup failed (rate-limit, timeout, or network). This is not a judgement on the citation — re-run to retry.',
        citedUrl: v.reference.url,
        screenshotPath: v.urlCheck?.screenshotPath,
        matchCategory: v.matchCategory,
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

  return [...notFound, ...suspect, ...orphan, ...unverified];
}
