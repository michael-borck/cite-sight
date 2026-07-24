import { describe, it, expect } from 'vitest';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';
import {
  fileFindings,
  meetsThreshold,
  findingsSummary,
  isFailOnLevel,
  type Findings,
} from '../src/findings.js';

/**
 * Build a minimal AnalysisResult carrying just the fields fileFindings reads.
 * Cast through unknown — the real type is large and the rest is irrelevant here.
 */
function resultWith(opts: {
  suspicious?: number;
  brokenUrls?: number;
  notFound?: number;
  unmatchedInText?: number;
  uncited?: number;
  formatIssuesPerRef?: number[];
}): AnalysisResult {
  const verifications = (opts.formatIssuesPerRef ?? []).map((count) => ({
    formatIssues: Array.from({ length: count }, (_, i) => ({ message: `issue ${i}` })),
  }));
  return {
    references: {
      suspiciousCount: opts.suspicious ?? 0,
      brokenUrlCount: opts.brokenUrls ?? 0,
      notFoundCount: opts.notFound ?? 0,
      crossReference: {
        unmatchedInText: Array.from({ length: opts.unmatchedInText ?? 0 }),
        unmatchedBibliography: Array.from({ length: opts.uncited ?? 0 }),
      },
      verifications,
    },
  } as unknown as AnalysisResult;
}

describe('fileFindings', () => {
  it('is all-zero for a clean result', () => {
    const f = fileFindings(resultWith({}));
    expect(f).toEqual({
      suspicious: 0, brokenUrls: 0, notFound: 0,
      unmatchedInText: 0, uncited: 0, formatIssues: 0, any: 0,
    });
  });

  it('sums format issues across references', () => {
    const f = fileFindings(resultWith({ formatIssuesPerRef: [2, 0, 3] }));
    expect(f.formatIssues).toBe(5);
  });

  it('rolls every category into `any`', () => {
    const f = fileFindings(
      resultWith({ suspicious: 1, brokenUrls: 2, notFound: 3, unmatchedInText: 4, uncited: 5, formatIssuesPerRef: [6] }),
    );
    expect(f.any).toBe(1 + 2 + 3 + 4 + 5 + 6);
  });

  it('excludes unverified from findings (only counts the tracked categories)', () => {
    // A result whose only "signal" would be unverified lookups reports nothing:
    // fileFindings never reads an unverified count, so `any` stays 0.
    const f = fileFindings(resultWith({}));
    expect(f.any).toBe(0);
  });
});

describe('meetsThreshold', () => {
  const clean: Findings = { suspicious: 0, brokenUrls: 0, notFound: 0, unmatchedInText: 0, uncited: 0, formatIssues: 0, any: 0 };
  const suspiciousOnly: Findings = { ...clean, suspicious: 2, any: 2 };
  const brokenOnly: Findings = { ...clean, brokenUrls: 1, any: 1 };
  const uncitedOnly: Findings = { ...clean, uncited: 3, any: 3 };

  it('never trips on level "none"', () => {
    expect(meetsThreshold(suspiciousOnly, 'none')).toBe(false);
    expect(meetsThreshold(brokenOnly, 'none')).toBe(false);
  });

  it('level "suspicious" trips only on suspicious references', () => {
    expect(meetsThreshold(suspiciousOnly, 'suspicious')).toBe(true);
    expect(meetsThreshold(brokenOnly, 'suspicious')).toBe(false);
    expect(meetsThreshold(uncitedOnly, 'suspicious')).toBe(false);
  });

  it('level "broken-url" trips only on broken URLs', () => {
    expect(meetsThreshold(brokenOnly, 'broken-url')).toBe(true);
    expect(meetsThreshold(suspiciousOnly, 'broken-url')).toBe(false);
  });

  it('level "any" trips on any category, including uncited-only', () => {
    expect(meetsThreshold(uncitedOnly, 'any')).toBe(true);
    expect(meetsThreshold(clean, 'any')).toBe(false);
  });
});

describe('findingsSummary', () => {
  it('reads "clean" with no findings', () => {
    expect(findingsSummary({ suspicious: 0, brokenUrls: 0, notFound: 0, unmatchedInText: 0, uncited: 0, formatIssues: 0, any: 0 })).toBe('clean');
  });

  it('pluralises broken URLs and joins categories', () => {
    const s = findingsSummary({ suspicious: 3, brokenUrls: 2, notFound: 0, unmatchedInText: 1, uncited: 0, formatIssues: 4, any: 10 });
    expect(s).toBe('3 need review, 2 broken URLs, 1 unmatched in-text, 4 format');
  });

  it('uses singular for one broken URL', () => {
    expect(findingsSummary({ suspicious: 0, brokenUrls: 1, notFound: 0, unmatchedInText: 0, uncited: 0, formatIssues: 0, any: 1 })).toBe('1 broken URL');
  });
});

describe('isFailOnLevel', () => {
  it('accepts the four valid levels', () => {
    for (const level of ['none', 'suspicious', 'broken-url', 'any']) {
      expect(isFailOnLevel(level)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isFailOnLevel('bogus')).toBe(false);
    expect(isFailOnLevel('')).toBe(false);
    expect(isFailOnLevel('SUSPICIOUS')).toBe(false);
  });
});
