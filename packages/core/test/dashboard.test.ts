import { describe, it, expect } from 'vitest';
import { computeVerdict } from '../src/dashboard/verdict.js';
import type { ReferenceAnalysisResult } from '../src/types.js';

function makeRefs(overrides: Partial<ReferenceAnalysisResult> = {}): ReferenceAnalysisResult {
  return {
    references: [],
    inTextCitations: [],
    verifications: [],
    crossReference: { unmatchedBibliography: [], unmatchedInText: [] },
    detectedStyle: 'apa',
    totalReferences: 0,
    verifiedCount: 0,
    suspiciousCount: 0,
    notFoundCount: 0,
    brokenUrlCount: 0,
    ...overrides,
  };
}

describe('computeVerdict', () => {
  it('returns all_clear when nothing is flagged', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
        ],
      }),
      new Set(),
    );
    expect(result.state).toBe('all_clear');
    expect(result.verifiedCount).toBe(2);
    expect(result.toCheckCount).toBe(0);
    expect(result.unverifiableCount).toBe(0);
  });

  it('returns caution when 1+ items need attention but none are confirmed fabricated', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
          { reference: {} as any, status: 'suspicious', formatIssues: [], confidenceScore: 0.5, flags: [] },
          { reference: {} as any, status: 'not_found', formatIssues: [], confidenceScore: 0.4, flags: [] },
        ],
      }),
      new Set(),
    );
    expect(result.state).toBe('caution');
    expect(result.toCheckCount).toBe(2);
    expect(result.breakdown.suspect).toBe(1);
    expect(result.breakdown.notFound).toBe(1);
  });

  it('returns issues when not_found exceeds default threshold of max(5, 10%)', () => {
    const verifications = [
      ...Array(4).fill({ reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] }),
      ...Array(6).fill({ reference: {} as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] }),
    ];
    const result = computeVerdict(makeRefs({ verifications }), new Set());
    expect(result.state).toBe('issues');
  });

  it('counts likely_valid as verified', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
          { reference: {} as any, status: 'likely_valid', formatIssues: [], confidenceScore: 0.8, flags: [] },
        ],
      }),
      new Set(),
    );
    expect(result.verifiedCount).toBe(2);
    expect(result.toCheckCount).toBe(0);
  });

  it('counts format_only as unverifiable, not verified or to_check', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
          { reference: {} as any, status: 'format_only', formatIssues: [], confidenceScore: 0.5, flags: [] },
        ],
      }),
      new Set(),
    );
    expect(result.verifiedCount).toBe(1);
    expect(result.unverifiableCount).toBe(1);
    expect(result.toCheckCount).toBe(0);
  });

  it('counts orphan in-text citations toward to_check', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
        ],
        crossReference: {
          unmatchedBibliography: [],
          unmatchedInText: [
            { raw: '(Smith, 2024)', authors: ['Smith'], year: 2024, position: 100 },
            { raw: '(Jones, 2023)', authors: ['Jones'], year: 2023, position: 200 },
          ],
        },
      }),
      new Set(),
    );
    expect(result.toCheckCount).toBe(2);
    expect(result.breakdown.orphanInText).toBe(2);
  });

  it('subtracts dismissed itemKeys from toCheckCount', () => {
    const result = computeVerdict(
      makeRefs({
        verifications: [
          { reference: { raw: 'Ref A' } as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] },
          { reference: { raw: 'Ref B' } as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] },
        ],
      }),
      new Set(['ref:0']),
    );
    expect(result.toCheckCount).toBe(1);
    expect(result.breakdown.notFound).toBe(1);
  });
});
