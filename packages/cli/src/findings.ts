import type { AnalysisResult } from '@michaelborck/cite-sight-core';

// The --fail-on levels, and the CI exit-code policy built on them. Kept out of
// index.ts (the commander wiring) so the logic is unit-testable without running
// the CLI, which parses argv on import.

export type FailOnLevel = 'none' | 'suspicious' | 'broken-url' | 'any';
export const FAIL_ON_LEVELS: readonly FailOnLevel[] = ['none', 'suspicious', 'broken-url', 'any'];

export interface Findings {
  suspicious: number;
  brokenUrls: number;
  notFound: number;
  unmatchedInText: number;
  uncited: number;
  formatIssues: number;
  /** Total of everything above — the "--fail-on any" trigger. */
  any: number;
}

/**
 * Count the reviewable findings in a result. `unverified` (lookup failed) is
 * deliberately excluded — it is an API failure on our side, not a problem with
 * the student's citation, and gating CI on it would make runs flaky.
 */
export function fileFindings(result: AnalysisResult): Findings {
  const r = result.references;
  const formatIssues = r.verifications.reduce((n, v) => n + v.formatIssues.length, 0);
  const suspicious = r.suspiciousCount;
  const brokenUrls = r.brokenUrlCount;
  const notFound = r.notFoundCount;
  const unmatchedInText = r.crossReference.unmatchedInText.length;
  const uncited = r.crossReference.unmatchedBibliography.length;
  return {
    suspicious,
    brokenUrls,
    notFound,
    unmatchedInText,
    uncited,
    formatIssues,
    any: suspicious + brokenUrls + notFound + unmatchedInText + uncited + formatIssues,
  };
}

export function meetsThreshold(f: Findings, level: FailOnLevel): boolean {
  switch (level) {
    case 'suspicious': return f.suspicious > 0;
    case 'broken-url': return f.brokenUrls > 0;
    case 'any':        return f.any > 0;
    case 'none':       return false;
  }
}

/** One-line description of a file's findings, for the batch summary. */
export function findingsSummary(f: Findings): string {
  const parts: string[] = [];
  if (f.suspicious) parts.push(`${f.suspicious} need review`);
  if (f.notFound) parts.push(`${f.notFound} not found`);
  if (f.brokenUrls) parts.push(`${f.brokenUrls} broken URL${f.brokenUrls > 1 ? 's' : ''}`);
  if (f.uncited) parts.push(`${f.uncited} uncited`);
  if (f.unmatchedInText) parts.push(`${f.unmatchedInText} unmatched in-text`);
  if (f.formatIssues) parts.push(`${f.formatIssues} format`);
  return parts.join(', ') || 'clean';
}

export function isFailOnLevel(value: string): value is FailOnLevel {
  return (FAIL_ON_LEVELS as readonly string[]).includes(value);
}
