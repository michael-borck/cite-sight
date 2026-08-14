import { describe, it, expect } from 'vitest';
import { extractReferences } from '../src/references/extractor.js';
import { titleSimilarity, titleContainment } from '../src/references/verifier.js';

// MISQ/ACIS author–date style: bare year after the author block, quoted title
// with the comma inside the closing quote, venue as "Journal (vol:issue)".
// Rendered documents carry typographic (curly) quotes. Regression corpus from
// a real audit (2026-08-14) where every such entry was misparsed: the title
// swallowed the venue/volume/pages, deflating word-overlap into the weak band
// and flagging byte-identical registry matches as suspicious.
const MISQ_DOC = [
  'Body text.',
  '',
  'References',
  '',
  'Gentner, D. 1983. “Structure-Mapping: A Theoretical Framework for Analogy,” Cognitive Science (7:2), pp. 155-170.',
  '',
  'Goodhue, D. L., and Thompson, R. L. 1995. “Task-Technology Fit and Individual Performance,” MIS Quarterly (19:2), pp. 213-236.',
  '',
  'Hevner, A. R., March, S. T., Park, J., and Ram, S. 2004. “Design Science in Information Systems Research,” MIS Quarterly (28:1), pp. 75-105.',
].join('\n');

describe('MISQ/ACIS-style reference parsing', () => {
  const refs = extractReferences(MISQ_DOC).references;

  it('extracts the quoted title without venue/volume/page pollution', () => {
    expect(refs[0].title).toBe('Structure-Mapping: A Theoretical Framework for Analogy');
    expect(refs[1].title).toBe('Task-Technology Fit and Individual Performance');
    expect(refs[2].title).toBe('Design Science in Information Systems Research');
  });

  it('keeps the author block intact past initials (no truncation at ". L")', () => {
    // Pre-fix, "Goodhue, D. L., and Thompson, R. L." truncated to "Goodhue, D"
    // and Thompson vanished entirely.
    expect(refs[1].authors.join(' ')).toContain('Goodhue');
    expect(refs[1].authors.join(' ')).toContain('Thompson');
    expect(refs[2].authors.join(' ')).toContain('Ram');
  });

  it('does not glue the year onto an author token', () => {
    for (const r of refs) {
      for (const a of r.authors) expect(a).not.toMatch(/(19|20)\d{2}/);
    }
    expect(refs.map((r) => r.year)).toEqual([1983, 1995, 2004]);
  });

  it('clean titles score a strong similarity against registry titles', () => {
    // The end-to-end property the parse fix restores: byte-identical works
    // must land in the strong band, not the weak/suspicious one.
    expect(titleSimilarity(refs[0].title, 'Structure-mapping: A theoretical framework for analogy')).toBeGreaterThanOrEqual(0.8);
  });
});

describe('curly-quote handling', () => {
  it('parses straight-quoted variants identically', () => {
    const doc = [
      'References',
      '',
      'Gentner, D. 1983. "Structure-Mapping: A Theoretical Framework for Analogy," Cognitive Science (7:2), pp. 155-170.',
    ].join('\n');
    const [ref] = extractReferences(doc).references;
    expect(ref.title).toBe('Structure-Mapping: A Theoretical Framework for Analogy');
  });
});

describe('APA parsing is unaffected by the quoted-title branch', () => {
  it('still extracts an APA title after the parenthesised year', () => {
    const doc = [
      'References',
      '',
      'Gentner, D. (1983). Structure-mapping: A theoretical framework for analogy. Cognitive Science, 7(2), 155-170.',
    ].join('\n');
    const [ref] = extractReferences(doc).references;
    expect(ref.title).toBe('Structure-mapping: A theoretical framework for analogy');
    expect(ref.detectedStyle).toBe('apa');
  });
});

describe('containment rescue precondition', () => {
  it('a venue-polluted title fully contains the clean registry title', () => {
    // Documents the verifier's search-path rescue: even if a polluted title
    // reaches the matcher, containment (not Jaccard) identifies the work.
    const polluted =
      'Structure-Mapping: A Theoretical Framework for Analogy, Cognitive Science (7:2), pp. 155-170';
    const clean = 'Structure-mapping: A theoretical framework for analogy';
    const { containment, smallerSize } = titleContainment(polluted, clean);
    expect(smallerSize).toBeGreaterThanOrEqual(4);
    expect(containment).toBeGreaterThanOrEqual(0.8);
    // And Jaccard alone would have sat below the strong band — the bug this guards.
    expect(titleSimilarity(polluted, clean)).toBeLessThan(0.8);
  });
});
