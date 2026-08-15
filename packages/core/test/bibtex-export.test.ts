import { describe, it, expect } from 'vitest';
import { exportBibtex, citekeyFor } from '../src/references/bibtexExport.js';
import type { AcademicWork, ReferenceVerification } from '../src/types.js';

const work = (o: Partial<AcademicWork>): AcademicWork => ({
  title: o.title ?? 'A Paper',
  authors: o.authors ?? ['Gentner, Dedre'],
  year: o.year ?? 1983,
  source: o.source ?? 'crossref',
  ...o,
});

const verification = (status: string, w?: AcademicWork): ReferenceVerification =>
  ({
    reference: { raw: 'x', authors: [], title: '', year: null, detectedStyle: 'unknown' },
    status,
    matchCategory: 'exact',
    formatIssues: [],
    matchedWork: w,
    confidenceScore: 0.9,
    flags: [],
  }) as unknown as ReferenceVerification;

describe('exportBibtex', () => {
  it('renders a verified journal match as @article with full fields', () => {
    const bib = exportBibtex([
      verification('verified', work({
        title: 'Structure-Mapping: A Theoretical Framework for Analogy',
        journal: 'Cognitive Science',
        volume: '7',
        issue: '2',
        pages: '155-170',
        doi: '10.1016/S0364-0213(83)80009-3',
      })),
    ]);
    expect(bib).toContain('@article{gentner1983structure,');
    expect(bib).toContain('journal  = {Cognitive Science}');
    expect(bib).toContain('volume   = {7}');
    expect(bib).toContain('number   = {2}');
    expect(bib).toContain('pages    = {155-170}');
    expect(bib).toContain('doi      = {10.1016/S0364-0213(83)80009-3}');
  });

  it('renders arXiv matches as @misc with eprint, not a fake journal', () => {
    const bib = exportBibtex([
      verification('verified', work({
        title: 'Reasoning Models',
        authors: ['Chen, Yanda'],
        year: 2025,
        journal: 'arXiv',
        source: 'arxiv',
        doi: '10.48550/arXiv.2505.05410',
      })),
    ]);
    expect(bib).toContain('@misc{chen2025reasoning,');
    expect(bib).toContain('eprint   = {2505.05410}');
    expect(bib).not.toContain('journal');
  });

  it('exports only verified/likely_valid rows — never the dubious matches', () => {
    const bib = exportBibtex([
      verification('verified', work({ title: 'Good Match' })),
      verification('suspicious', work({ title: 'Wrong Work Matched' })),
      verification('not_found', undefined),
      verification('unverified', undefined),
    ]);
    expect(bib).toContain('Good Match');
    expect(bib).not.toContain('Wrong Work Matched');
    expect(bib).toContain('1 verified reference');
  });

  it('deduplicates citekeys with letter suffixes', () => {
    const taken = new Set<string>();
    const w = work({});
    expect(citekeyFor(w, taken)).toBe('gentner1983paper');
    expect(citekeyFor(w, taken)).toBe('gentner1983papera');
    expect(citekeyFor(w, taken)).toBe('gentner1983paperb');
  });

  it('escapes BibTeX-special characters in fields', () => {
    const bib = exportBibtex([
      verification('verified', work({
        title: 'Costs & Benefits: 100% of the _story_',
        authors: ['O’Brien, Pat'],
      })),
    ]);
    expect(bib).toContain('\\&');
    expect(bib).toContain('\\%');
    expect(bib).toContain('\\_');
  });
});
