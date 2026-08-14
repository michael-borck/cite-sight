import { describe, it, expect, vi } from 'vitest';
import type { ParsedReference } from '../src/types.js';

// Offline: every lookup source is mocked. Grey-literature routing and edition
// tolerance are decision-layer behaviours; the mocks supply the match (or the
// absence of one) and the URL check result.

vi.mock('../src/references/crossref.js', () => ({
  searchCrossref: vi.fn(async (query: string) => {
    if (query.toLowerCase().includes('ecological approach')) {
      return [{
        // The Routledge classic-edition record of a 1979 original.
        title: 'The Ecological Approach to Visual Perception',
        authors: ['Gibson, James J.'],
        year: 2013,
        doi: '10.4324/9780203767764',
        source: 'crossref' as const,
      }];
    }
    return [];
  }),
}));
vi.mock('../src/references/openAlex.js', () => ({ searchOpenAlex: vi.fn(async () => []) }));
vi.mock('../src/references/semanticScholar.js', () => ({ searchSemanticScholar: vi.fn(async () => []) }));
vi.mock('../src/references/doiResolver.js', () => ({ resolveDoi: vi.fn(async () => null) }));
vi.mock('../src/references/webSourceVerifier.js', () => ({ verifyWebSource: vi.fn(async () => null) }));
vi.mock('../src/references/arxiv.js', () => ({
  extractArxivId: vi.fn(() => null),
  lookupArxivId: vi.fn(async () => null),
  searchArxiv: vi.fn(async () => []),
}));
vi.mock('../src/references/urlChecker.js', () => ({
  checkUrl: vi.fn(async (url: string) => ({
    url,
    status: url.includes('alive') ? 'live' : 'dead',
    statusCode: url.includes('alive') ? 200 : 404,
  })),
}));

const { verifyReferences, looksGreyLiterature } = await import('../src/references/verifier.js');

const ref = (o: Partial<ParsedReference>): ParsedReference => ({
  raw: o.raw ?? '',
  authors: o.authors ?? [],
  title: o.title ?? '',
  year: o.year ?? null,
  doi: o.doi,
  url: o.url,
  detectedStyle: 'unknown',
  ...o,
});

const opts = { mailto: 'test@example.com', citationStyle: 'auto' as never };
const run = (r: ParsedReference) => verifyReferences([r], opts).then((v) => v[0]);

describe('grey-literature detection', () => {
  it('detects a corporate-author venue-less reference', () => {
    expect(looksGreyLiterature(ref({
      authors: ['Thoughtworks'],
      title: "Spec-driven development: Unpacking one of 2025's key new AI-assisted engineering practices",
      year: 2025,
    }))).toBe(true);
  });

  it('detects a venue-less reference carrying a URL', () => {
    expect(looksGreyLiterature(ref({
      authors: ['Osmani, Addy'],
      title: 'How to write a good spec for AI agents',
      url: 'https://example.com/spec',
    }))).toBe(true);
  });

  it('does NOT fire for person-authored academic references', () => {
    expect(looksGreyLiterature(ref({
      authors: ['Gentner, D.'],
      title: 'Structure-Mapping: A Theoretical Framework for Analogy',
      journal: 'Cognitive Science',
    }))).toBe(false);
  });

  it('does NOT fire when a DOI is present', () => {
    expect(looksGreyLiterature(ref({
      authors: ['OECD'],
      title: 'Education at a glance',
      doi: '10.1787/eag-2024-en',
    }))).toBe(false);
  });
});

describe('grey-literature verdict routing', () => {
  it('flags but upgrades to likely_valid when the URL is alive', async () => {
    const v = await run(ref({
      raw: 'Thoughtworks. 2025. "Spec-driven development." https://alive.example/sdd',
      authors: ['Thoughtworks'],
      title: 'Spec-driven development unpacking key new engineering practices',
      year: 2025,
      url: 'https://alive.example/sdd',
    }));
    expect(v.status).toBe('likely_valid');
    expect(v.flags).toContain('grey_literature');
  });

  it('stays not_found (with the routing flag) when there is no live URL', async () => {
    const v = await run(ref({
      authors: ['Thoughtworks'],
      title: 'Spec-driven development unpacking key new engineering practices',
      year: 2025,
    }));
    expect(v.status).toBe('not_found');
    expect(v.flags).toContain('grey_literature');
    expect(v.matchCategory).toBe('not_indexed_expected');
  });

  it('a plain academic miss is NOT tagged grey literature', async () => {
    const v = await run(ref({
      authors: ['Henderson, P.'],
      title: 'A colourless green idea that no index has ever seen',
      year: 2021,
      journal: 'Journal of Nonexistence',
    }));
    expect(v.status).toBe('not_found');
    expect(v.flags).not.toContain('grey_literature');
    expect(v.matchCategory).toBe('none');
  });
});

describe('edition tolerance', () => {
  it('renames year_mismatch to edition_difference for a same-work reissue', async () => {
    const v = await run(ref({
      authors: ['Gibson, J. J.'],
      title: 'The Ecological Approach to Visual Perception',
      year: 1979, // original edition; record is the 2013 reissue
    }));
    expect(['verified', 'likely_valid']).toContain(v.status);
    expect(v.flags).toContain('edition_difference');
    expect(v.flags).not.toContain('year_mismatch');
    expect(v.matchCategory).toBe('variant_record');
  });
});
