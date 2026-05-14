import { describe, it, expect } from 'vitest';
import { computeVerdict } from '../src/dashboard/verdict.js';
import { gatherPriorityItems } from '../src/dashboard/priorityList.js';
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

describe('gatherPriorityItems', () => {
  it('returns an empty list when nothing is flagged', () => {
    const items = gatherPriorityItems(
      makeRefs({
        verifications: [
          { reference: {} as any, status: 'verified', formatIssues: [], confidenceScore: 1, flags: [] },
        ],
      }),
      new Set(),
    );
    expect(items).toHaveLength(0);
  });

  it('emits not_found items from suspicious-or-not-found verifications', () => {
    const items = gatherPriorityItems(
      makeRefs({
        verifications: [
          {
            reference: { raw: 'Smith, J. (2024). The lost paper.', authors: ['Smith, J.'], title: 'The lost paper', year: 2024, detectedStyle: 'apa' } as any,
            status: 'not_found',
            formatIssues: [],
            confidenceScore: 0.4,
            flags: [],
          },
        ],
      }),
      new Set(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemKey: 'ref:0',
      category: 'not_found',
      headline: 'Smith, J. (2024). The lost paper.',
      sourceText: 'Smith, J. (2024). The lost paper.',
    });
  });

  it('emits suspect items with matched-work metadata', () => {
    const items = gatherPriorityItems(
      makeRefs({
        verifications: [
          {
            reference: { raw: 'Mollick & Mollick (2023). SSRN preprint.', authors: ['Mollick', 'Mollick'], title: 'SSRN preprint', year: 2023, detectedStyle: 'apa' } as any,
            status: 'suspicious',
            formatIssues: [],
            confidenceScore: 0.6,
            flags: [],
            matchedWork: { title: 'A different title', year: 2023, doi: '10.x/y', source: 'crossref' as any },
          },
        ],
      }),
      new Set(),
    );
    expect(items).toHaveLength(1);
    expect(items[0].category).toBe('suspect');
    expect(items[0].matched?.title).toBe('A different title');
  });

  it('emits orphan items from unmatched in-text citations', () => {
    const items = gatherPriorityItems(
      makeRefs({
        crossReference: {
          unmatchedBibliography: [],
          unmatchedInText: [
            { raw: '(Borck, 2026)', authors: ['Borck'], year: 2026, position: 100 },
          ],
        },
      }),
      new Set(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemKey: 'intext:0',
      category: 'orphan',
      headline: '(Borck, 2026)',
      sourceText: '(Borck, 2026)',
    });
  });

  it('skips items whose itemKey is in the dismissed set', () => {
    const items = gatherPriorityItems(
      makeRefs({
        verifications: [
          { reference: { raw: 'A' } as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] },
          { reference: { raw: 'B' } as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] },
        ],
      }),
      new Set(['ref:0']),
    );
    expect(items).toHaveLength(1);
    expect(items[0].itemKey).toBe('ref:1');
  });

  it('orders items: not_found, then suspect, then orphan', () => {
    const items = gatherPriorityItems(
      makeRefs({
        verifications: [
          { reference: { raw: 'Suspect ref' } as any, status: 'suspicious', formatIssues: [], confidenceScore: 0.5, flags: [] },
          { reference: { raw: 'Not found ref' } as any, status: 'not_found', formatIssues: [], confidenceScore: 0.3, flags: [] },
        ],
        crossReference: {
          unmatchedBibliography: [],
          unmatchedInText: [{ raw: '(Borck, 2026)', authors: ['Borck'], year: 2026, position: 100 }],
        },
      }),
      new Set(),
    );
    expect(items.map((i) => i.category)).toEqual(['not_found', 'suspect', 'orphan']);
  });
});
