import { describe, it, expect, vi } from 'vitest';
import type { ParsedReference } from '../src/types.js';
import { referenceContentKey } from '../src/dashboard/priorityList.js';

// Scenario from a real session: heavy rate-limiting knocks out the good
// sources mid-cascade, a weaker source supplies the only (wrong) candidate,
// and pre-fix the verdict accused the CITATION ("suspicious") on evidence
// that was actually degraded. The rule: uncorroborated suspicion + partial
// lookup failure = unverified (retry), not suspicious (review).

vi.mock('../src/references/crossref.js', async () => {
  const { LookupError } = await import('../src/references/lookupError.js');
  return {
    searchCrossref: vi.fn(async () => {
      throw new LookupError('crossref', 'rate_limited');
    }),
  };
});
vi.mock('../src/references/openAlex.js', () => ({
  searchOpenAlex: vi.fn(async () => [{
    // Wrong work, similar words, zero author overlap.
    title: 'Deep learning for citation network analysis systems',
    authors: ['Nobody, N.'],
    year: 2019,
    source: 'openalex' as const,
  }]),
}));
vi.mock('../src/references/semanticScholar.js', () => ({ searchSemanticScholar: vi.fn(async () => []) }));
vi.mock('../src/references/doiResolver.js', () => ({ resolveDoi: vi.fn(async () => null) }));
vi.mock('../src/references/webSourceVerifier.js', () => ({ verifyWebSource: vi.fn(async () => null) }));
vi.mock('../src/references/arxiv.js', () => ({
  extractArxivId: vi.fn(() => null),
  lookupArxivId: vi.fn(async () => null),
  searchArxiv: vi.fn(async () => []),
}));
vi.mock('../src/references/urlChecker.js', () => ({
  checkUrl: vi.fn(async () => ({ url: '', status: 'no_url' })),
}));

const { verifyReferences } = await import('../src/references/verifier.js');

const ref = (o: Partial<ParsedReference>): ParsedReference => ({
  raw: o.raw ?? '',
  authors: o.authors ?? [],
  title: o.title ?? '',
  year: o.year ?? null,
  detectedStyle: 'unknown',
  ...o,
});

describe('degraded-evidence rule', () => {
  it('reports unverified, not suspicious, when the cascade partially failed and the match is uncorroborated', async () => {
    const [v] = await verifyReferences(
      [ref({
        authors: ['Realauthor, R.'],
        title: 'Deep learning citation analysis for network systems research',
        year: 2021,
      })],
      { mailto: 't@example.com', citationStyle: 'auto' as never },
    );
    expect(v.status).toBe('unverified');
    expect(v.flags).toContain('degraded_lookup');
    expect(v.flags).not.toContain('weak_match');
    expect(v.unavailable?.reason).toBe('rate_limited');
  });
});

describe('referenceContentKey', () => {
  it('is stable across whitespace and case differences', () => {
    const a = referenceContentKey('Gentner, D. 1983.  "Structure-Mapping," Cognitive Science.');
    const b = referenceContentKey('gentner, d. 1983. "structure-mapping," cognitive science.');
    expect(a).toBe(b);
  });

  it('differs for different references', () => {
    expect(referenceContentKey('Gentner, D. 1983.')).not.toBe(referenceContentKey('Goodhue, D. L. 1995.'));
  });
});
