import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcademicWork, ParsedReference } from '../src/types.js';
import { verifyReferences } from '../src/references/verifier.js';
import { searchCrossref } from '../src/references/crossref.js';
import { searchOpenAlex } from '../src/references/openAlex.js';
import { resolveDoi } from '../src/references/doiResolver.js';
import { LookupError } from '../src/references/lookupError.js';
vi.mock('../src/references/datacite.js', () => ({ searchDataCite: async () => [] }));
vi.mock('../src/references/europePmc.js', () => ({ searchEuropePmc: async () => [] }));
vi.mock('../src/references/publicationUpdates.js', () => ({ checkPublicationUpdates: async () => ({ status: 'not_available', updates: [] }) }));

vi.mock('../src/references/crossref.js', () => ({ searchCrossref: vi.fn(async () => []) }));
vi.mock('../src/references/openAlex.js', () => ({ searchOpenAlex: vi.fn(async () => []) }));
vi.mock('../src/references/semanticScholar.js', () => ({ searchSemanticScholar: vi.fn(async () => []) }));
vi.mock('../src/references/arxiv.js', () => ({ extractArxivId: () => null, searchArxiv: async () => [] }));
vi.mock('../src/references/doiResolver.js', () => ({ resolveDoi: vi.fn(async () => null) }));
vi.mock('../src/references/webSourceVerifier.js', () => ({ verifyWebSource: async () => null }));
vi.mock('../src/references/urlChecker.js', () => ({ checkUrl: async () => ({ status: 'live' }) }));

const record: AcademicWork = {
  title: 'Attention Is All You Need', authors: ['Vaswani, Ashish', 'Shazeer, Noam'],
  year: 2017, source: 'crossref', doi: '10.48550/arXiv.1706.03762',
};
const citation = (changes: Partial<ParsedReference> = {}): ParsedReference => ({
  raw: '', title: record.title, authors: ['Vaswani, A.'], year: 2017, detectedStyle: 'unknown', ...changes,
});
const run = async (ref: ParsedReference) => (await verifyReferences([ref], { citationStyle: 'unknown', checkUrls: false }))[0];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(searchCrossref).mockResolvedValue([record]);
});

// Offline adjudicated cases. The mutated citations deliberately identify known
// metadata errors; synthetic Unicode records exercise scripts, not API coverage.
describe('verification regression benchmark', () => {
  it.each([
    ['correct citation', {}, 'verified'],
    ['wrong sole author', { authors: ['Smith, J.'] }, 'suspicious'],
    ['same surname, wrong initial', { authors: ['Vaswani, P.'] }, 'suspicious'],
    ['wrong DOI on a correct title', { doi: '10.1234/incorrect' }, 'likely_valid'],
    ['one correct and one wrong author', { authors: ['Vaswani, A.', 'Smith, J.'] }, 'suspicious'],
    ['incorrect year', { year: 2001 }, 'likely_valid'],
    ['missing author', { authors: [] }, 'likely_valid'],
    ['negated title', { title: 'Attention Is Not All You Need' }, 'suspicious'],
    ['invented elaboration', { title: 'Attention Is All You Need for teaching mathematics to children in primary schools' }, 'suspicious'],
  ] as const)('%s', async (_label, changes, expected) => {
    const result = await run(citation({ ...changes, ...('authors' in changes ? { authors: [...changes.authors] } : {}) }));
    expect(result.status).toBe(expected);
    expect(result.matchedWork?.doi).toBe(record.doi);
  });

  it('does not excuse wrong authors because a DOI resolves', async () => {
    vi.mocked(resolveDoi).mockResolvedValue(record);
    const result = await run(citation({ doi: record.doi, authors: ['Smith, J.'] }));
    expect(result.status).toBe('suspicious');
    expect(result.evidence).toEqual({ existence: 'found', metadata: 'conflict' });
  });
  it('does not match a paper to a same-author notice with a nearly identical title', async () => {
    const title = 'Flexible and Microporous Chitosan Hydrogel Nano ZnO Composite Bandages for Wound Dressing In Vitro and In Vivo Evaluation';
    vi.mocked(searchCrossref).mockResolvedValue([{ ...record, title: `Retraction of ${title}` }]);
    expect((await run(citation({ title }))).status).toBe('suspicious');
  });

  it('keeps searching beyond a plausible candidate to find the right work', async () => {
    vi.mocked(searchCrossref).mockResolvedValue([{ ...record, title: 'Attention Is All You Really Need', doi: '10.1234/wrong' }]);
    vi.mocked(searchOpenAlex).mockResolvedValue([{ ...record, source: 'openalex' }]);
    const result = await run(citation());
    expect(result.status).toBe('verified');
    expect(result.matchedWork?.doi).toBe(record.doi);
  });

  it('leaves equally plausible distinct records ambiguous', async () => {
    vi.mocked(searchCrossref).mockResolvedValue([record, { ...record, doi: '10.1234/other' }]);
    const result = await run(citation());
    expect(result.status).toBe('likely_valid');
    expect(result.flags).toContain('ambiguous_match');
  });

  it('does not count the same DOI from two indexes as two candidates', async () => {
    const partial = { ...record, title: 'Attention Is All You Really Need' };
    vi.mocked(searchCrossref).mockResolvedValue([partial]);
    vi.mocked(searchOpenAlex).mockResolvedValue([{ ...partial, source: 'openalex' }]);
    expect((await run(citation())).flags).not.toContain('ambiguous_match');
  });

  it('uses volume and pages to select between similar publications', async () => {
    vi.mocked(searchCrossref).mockResolvedValue([
      { ...record, doi: '10.1234/review', volume: '2', pages: '5-9' },
      { ...record, volume: '1', pages: '10-20' },
    ]);
    const result = await run(citation({ volume: '1', pages: '10-20' }));
    expect(result.matchedWork?.doi).toBe(record.doi);
    expect(result.status).toBe('verified');
  });

  it.each([
    ['Aprendizaje y educación', 'García, Ana', 'Garcia, A.'],
    ['机器学习与教育', '王', '王'],
    ['Обучение и образование', 'Иванов', 'Иванов'],
  ])('preserves international metadata: %s', async (title, author, citedAuthor) => {
    vi.mocked(searchCrossref).mockResolvedValue([{ ...record, title, authors: [author] }]);
    expect((await run(citation({ title, authors: [citedAuthor] }))).status).toBe('verified');
  });

  it('does not call a missing record fabricated when a provider is down', async () => {
    vi.mocked(searchCrossref).mockRejectedValue(new LookupError('crossref', 'rate_limited'));
    const result = await run(citation());
    expect(result.status).toBe('unverified');
    expect(result.evidence?.existence).toBe('unknown');
  });

  it('tries a title-only query when the combined query misses', async () => {
    vi.mocked(searchCrossref).mockImplementation(async (query) => query === record.title ? [record] : []);
    expect((await run(citation())).status).toBe('verified');
    expect(searchCrossref).toHaveBeenCalledWith(record.title, undefined);
  });

  it('retries with a stripped typo-tolerant query on a clean miss', async () => {
    const typoTitle = 'Attention Is All You Need for Massively Multilingaul Machine Translation';
    vi.mocked(searchCrossref).mockImplementation(async (query) => {
      // Full and title-only queries zero out; only the stripped query finds it.
      return query.startsWith('attention massively') ? [record] : [];
    });
    const result = await run(citation({ title: typoTitle }));
    expect(result.matchedWork?.doi).toBe(record.doi);
    expect(searchCrossref).toHaveBeenLastCalledWith('attention massively multilingaul machine translation', undefined);
  });

  it('does not spend the repaired query when a corroborated match already exists', async () => {
    await run(citation());
    const calls = vi.mocked(searchCrossref).mock.calls.length;
    expect(calls).toBe(1); // combined query only
  });
});
