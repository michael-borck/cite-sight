import type { AnalysisResult, ReferenceVerification, ReviewDecision } from './types.js';
import { referenceContentKey } from './dashboard/priorityList.js';

export const REVIEW_LABELS: Record<ReviewDecision, string> = {
  reviewed: 'Reviewed', citation_error: 'Citation error', acceptable_variation: 'Acceptable variation',
  unresolved: 'Unresolved', suspected_fabrication: 'Suspected fabrication',
};

/** Use the same counts for initial checks, retries, exports and saved sessions. */
export function withVerifications(result: AnalysisResult, verifications: ReferenceVerification[]): AnalysisResult {
  return { ...result, references: {
    ...result.references, verifications,
    verifiedCount: verifications.filter((v) => v.status === 'verified' || v.status === 'likely_valid').length,
    suspiciousCount: verifications.filter((v) => v.status === 'suspicious').length,
    notFoundCount: verifications.filter((v) => v.status === 'not_found').length,
    unverifiedCount: verifications.filter((v) => v.status === 'unverified').length,
    brokenUrlCount: verifications.filter((v) => v.urlCheck?.status === 'dead').length,
  } };
}

export function reviewKey(result: AnalysisResult, itemKey: string): string {
  const index = Number(itemKey.split(':')[1]);
  if (itemKey.startsWith('ref:')) {
    return referenceContentKey(result.references.verifications[index]?.reference.raw ?? itemKey);
  }
  if (itemKey.startsWith('biblio:')) {
    return `biblio:${referenceContentKey(result.references.crossReference.unmatchedBibliography[index]?.raw ?? itemKey)}`;
  }
  const cite = result.references.crossReference.unmatchedInText[index];
  return cite ? `intext:${cite.position}:${cite.raw}` : itemKey;
}

export function reviewCount(result: AnalysisResult): number {
  const refs = result.references;
  return refs.verifications.filter((v, i) =>
    ['suspicious', 'not_found'].includes(v.status) &&
    !isReviewed(result, `ref:${i}`),
  ).length + refs.crossReference.unmatchedInText.filter((_v, i) => !isReviewed(result, `intext:${i}`)).length +
    refs.crossReference.unmatchedBibliography.filter((_v, i) => !isReviewed(result, `biblio:${i}`)).length;
}

export function isReviewed(result: AnalysisResult, itemKey: string): boolean {
  const decision = result.reviews?.[reviewKey(result, itemKey)]?.decision;
  return decision !== undefined && decision !== 'unresolved';
}

export function reviewEntries(result: AnalysisResult): { source: string; label: string; reviewedAt: string }[] {
  const sources = new Map<string, string>();
  result.references.verifications.forEach((verification, index) => sources.set(reviewKey(result, `ref:${index}`), verification.reference.raw));
  result.references.crossReference.unmatchedInText.forEach((citation, index) => sources.set(reviewKey(result, `intext:${index}`), citation.raw));
  result.references.crossReference.unmatchedBibliography.forEach((reference, index) => sources.set(reviewKey(result, `biblio:${index}`), reference.raw));
  return Object.entries(result.reviews ?? {}).map(([key, review]) => ({ source: sources.get(key) ?? key, label: REVIEW_LABELS[review.decision], reviewedAt: review.reviewedAt }));
}
