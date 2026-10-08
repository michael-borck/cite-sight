import { describe, expect, it } from 'vitest';
import { renderReport } from '../src/reports.js';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';

function resultWith(overrides: {
  nearMatches?: { cite: { raw: string }; reference: { raw: string } }[];
  unmatchedInText?: { raw: string }[];
  unmatchedBibliography?: { raw: string }[];
} = {}): AnalysisResult {
  return {
    fileName: 'essay.pdf',
    references: {
      verifiedCount: 1,
      suspiciousCount: 0,
      notFoundCount: 0,
      unverifiedCount: 0,
      totalReferences: 1,
      verifications: [{
        status: 'not_found',
        reference: { raw: 'Smith, J. (2020). A study of learning. Journal.' },
        flags: [],
        formatIssues: [],
      }],
      crossReference: {
        unmatchedInText: overrides.unmatchedInText ?? [],
        unmatchedBibliography: overrides.unmatchedBibliography ?? [],
        nearMatches: overrides.nearMatches,
      },
    },
  } as unknown as AnalysisResult;
}

describe('text report', () => {
  // Regression: the plain-text renderer never emitted nearMatches, so a saved
  // .txt report silently lost the likely-typo suggestions that the terminal and
  // HTML reports both carried.
  it('includes possible spelling mismatches', () => {
    const out = renderReport([{ file: 'essay.pdf', result: resultWith({
      nearMatches: [{ cite: { raw: '(Smth, 2020)' }, reference: { raw: 'Smith, J. (2020). A study of learning.' } }],
    }) }], 'text');
    expect(out).toContain('Possible spelling mismatch');
    expect(out).toContain('(Smth, 2020)');
    expect(out).toContain('Smith, J. (2020)');
  });

  it('includes both unmatched directions', () => {
    const out = renderReport([{ file: 'essay.pdf', result: resultWith({
      unmatchedInText: [{ raw: '(Jones, 2021)' }],
      unmatchedBibliography: [{ raw: 'Brown, K. (2019). Uncited work.' }],
    }) }], 'text');
    expect(out).toContain('No reference list match: (Jones, 2021)');
    expect(out).toContain('Not cited in the text: Brown, K. (2019). Uncited work.');
  });

  // A raw "[not_found]" does not say whether a database answered and found
  // nothing or our lookup failed — the distinction that matters most when a
  // grader is reading it.
  it('labels statuses in prose and includes a legend', () => {
    const out = renderReport([{ file: 'essay.pdf', result: resultWith() }], 'text');
    expect(out).toContain('[Not Found]');
    expect(out).not.toContain('[not_found]');
    expect(out).toContain('Status legend:');
    expect(out).toContain('every lookup answered cleanly and no record matched');
    expect(out).toContain('not a confirmed miss');
  });

  it('does not stack blank lines between references', () => {
    const result = resultWith();
    result.references.verifications.push({ ...result.references.verifications[0] } as never);
    const out = renderReport([{ file: 'essay.pdf', result }], 'text');
    expect(out).not.toMatch(/\n{4,}/);
  });

  it('reports a failed file without inventing a result', () => {
    const out = renderReport([{ file: 'broken.pdf', error: 'unreadable' }], 'text');
    expect(out).toContain('broken.pdf');
    expect(out).toContain('Could not check: unreadable');
  });

  it('keeps the disclaimer and attribution', () => {
    const out = renderReport([{ file: 'essay.pdf', result: resultWith() }], 'text');
    expect(out).toMatch(/does not certify/);
    expect(out).toContain('Retraction Watch');
  });
});