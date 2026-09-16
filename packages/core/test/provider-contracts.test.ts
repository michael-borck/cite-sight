import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../src/httpClient.js';
import { clearLookupCache, exportLookupCache } from '../src/references/lookupCache.js';
import { setMinRequestInterval } from '../src/references/rateLimiter.js';
import { searchDataCite } from '../src/references/datacite.js';
import { searchEuropePmc } from '../src/references/europePmc.js';
import { searchOpenAlex } from '../src/references/openAlex.js';
import { lookupDoi, searchCrossref } from '../src/references/crossref.js';
import { checkPublicationUpdates } from '../src/references/publicationUpdates.js';
import { verifyReferences } from '../src/references/verifier.js';
import { verifyWebSource } from '../src/references/webSourceVerifier.js';

const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json', ...headers },
});
beforeEach(() => { clearLookupCache(); setMinRequestInterval(0); });
afterEach(() => { setFetch(undefined); vi.useRealTimers(); });

describe('provider contracts with offline response fixtures', () => {
  it('searches DataCite by title and preserves deposit type and identifier', async () => {
    const fetch = vi.fn(async () => json({ data: [{ attributes: {
      doi: '10.5281/zenodo.1', titles: [{ title: 'Example research data' }],
      creators: [{ name: 'García, Ana' }], publicationYear: 2024, types: { resourceTypeGeneral: 'Dataset' },
    } }] }));
    setFetch(fetch);
    expect(await searchDataCite('Example research data')).toEqual([expect.objectContaining({
      title: 'Example research data', authors: ['García, Ana'], doi: '10.5281/zenodo.1', source: 'datacite', workType: 'Dataset',
    })]);
    await searchDataCite('Example research data');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('parses Europe PMC core results including family names and journal fields', async () => {
    setFetch(async () => json({ resultList: { result: [{
      id: '123', source: 'MED', title: 'A clinical study', pubYear: '2021', doi: '10.1234/study',
      authorList: { author: [{ lastName: 'Smith', firstName: 'Jane', fullName: 'Smith J' }] },
      journalInfo: { journal: { title: 'Clinical Journal' }, volume: '4', issue: '2' }, pageInfo: '1-10',
    }] } }));
    expect(await searchEuropePmc('A clinical study')).toEqual([expect.objectContaining({
      authors: ['Smith, Jane'], year: 2021, source: 'europe_pmc', volume: '4', pages: '1-10', url: 'https://europepmc.org/article/MED/123',
    })]);
  });

  it.each([searchDataCite, searchEuropePmc])('keeps new-provider outages distinct from clean misses', async (search) => {
    const fetch = vi.fn(async () => json({}, 429));
    setFetch(fetch);
    await expect(search('Some title')).rejects.toMatchObject({ reason: 'rate_limited' });
    await expect(search('Some title')).rejects.toMatchObject({ reason: 'rate_limited' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('finds a DOI-less deposit through the full cascade', async () => {
    setFetch(async (input) => {
      const url = String(input);
      if (url.includes('api.crossref.org/works?')) return json({ message: { items: [] } });
      if (url.includes('api.openalex.org')) return json({ results: [] });
      if (url.includes('api.semanticscholar.org')) return json({ data: [] });
      if (url.includes('arxiv.org')) return new Response('<feed></feed>');
      if (url.includes('api.datacite.org/dois?')) return json({ data: [{ attributes: {
        titles: [{ title: 'Example research data' }], creators: [{ name: 'García, Ana' }], publicationYear: 2024,
      } }] });
      throw new Error(`Unexpected request: ${url}`);
    });
    const [result] = await verifyReferences([{
      raw: '', title: 'Example research data', authors: ['Garcia, A.'], year: 2024, detectedStyle: 'unknown',
    }], { citationStyle: 'unknown', checkUrls: false });
    expect(result.status).toBe('verified');
    expect(result.matchedWork?.source).toBe('datacite');
  });

  it('reconstructs OpenAlex abstracts from the inverted index', async () => {
    setFetch(async () => json({ results: [{ id: 'w1', title: 'Trial', display_name: 'Trial',
      abstract_inverted_index: { spaced: [0], practice: [1], improved: [2], recall: [3] },
      authorships: [], publication_year: 2020 }] }));
    const works = await searchOpenAlex('Trial');
    expect(works[0].abstract).toBe('spaced practice improved recall');
  });

  it('strips Crossref JATS tags from abstracts', async () => {
    setFetch(async () => json({ message: { items: [{ title: ['JATS study'], DOI: '10.1234/jats',
      abstract: '<jats:p>Background.</jats:p> <jats:sec><jats:title>Methods</jats:title><p>We ran a  trial.</p></jats:sec>', author: [] }] } }));
    const works = await searchCrossref('JATS study');
    expect(works[0].abstract).toBe('Background. Methods We ran a trial.');
  });

  it('sends the OpenAlex key only in the authorization header, never the cache', async () => {
    const requests: { url: string; headers: Headers }[] = [];
    setFetch(async (url, init) => {
      requests.push({ url: String(url), headers: new Headers(init?.headers) });
      return json({ results: [] });
    });
    await searchOpenAlex('Some title', undefined, 'private-openalex-key');
    expect(requests[0].headers.get('authorization')).toBe('Bearer private-openalex-key');
    expect(requests[0].url).not.toContain('private-openalex-key');
    expect(JSON.stringify(exportLookupCache())).not.toContain('private-openalex-key');
  });

  it('does not retry an exhausted OpenAlex daily budget immediately', async () => {
    const fetch = vi.fn(async () => json({}, 429, { 'X-RateLimit-Remaining': '0' }));
    setFetch(fetch);
    await expect(searchOpenAlex('Some title', undefined, 'key')).rejects.toMatchObject({ reason: 'rate_limited' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports web source failures instead of interpreting them as missing content', async () => {
    setFetch(async () => new Response(null, { status: 503 }));
    await expect(verifyWebSource({
      raw: '', title: 'A report', authors: ['Organisation'], year: 2024,
      url: 'https://example.org/report', detectedStyle: 'unknown',
    })).rejects.toMatchObject({ service: 'example.org', reason: 'server_error' });
  });
});

// Trimmed fields from Crossref's documented example 10.1021/am300292v,
// retrieved 2026-09-14. Other contract records above are synthetic.
const retracted = {
  DOI: '10.1021/am300292v',
  title: ['Flexible and Microporous Chitosan Hydrogel/Nano ZnO Composite Bandages for Wound Dressing: In Vitro and In Vivo Evaluation'],
  author: [{ family: 'Sudheesh Kumar', given: 'P. T.' }], published: { 'date-parts': [[2012]] },
  'updated-by': [{ DOI: '10.1021/acsami.9b11759', type: 'retraction', source: 'retraction-watch', updated: { 'date-time': '2019-07-26T00:00:00Z' } }],
};

describe('publication notices', () => {
  it('keeps confirmed identity and a retraction notice as separate findings', async () => {
    setFetch(async () => json({ message: retracted }));
    const [result] = await verifyReferences([{
      raw: '', title: retracted.title[0], authors: ['Sudheesh Kumar, P. T.'], year: 2012,
      doi: retracted.DOI, detectedStyle: 'unknown',
    }], { citationStyle: 'unknown', checkUrls: false });
    expect(result.status).toBe('verified');
    expect(result.flags).toContain('retraction_notice');
    expect(result.publicationCheck).toMatchObject({ status: 'checked', updates: [{ type: 'retraction', doi: '10.1021/acsami.9b11759' }] });
  });

  it('does not flag a retraction notice as itself retracted', async () => {
    setFetch(async () => json({ message: { DOI: '10.1234/notice', title: ['Retraction notice'],
      'update-to': [{ DOI: retracted.DOI, type: 'retraction' }],
    } }));
    expect((await lookupDoi('10.1234/notice'))?.publicationUpdates).toEqual([]);
  });

  it('refreshes publication notices after a day even if bibliographic metadata is cached', async () => {
    const fetch = vi.fn(async () => json({ message: retracted }));
    setFetch(fetch);
    const work = await lookupDoi(retracted.DOI);
    await checkPublicationUpdates(work!);
    expect(fetch).toHaveBeenCalledOnce();
    work!.publicationStatusCheckedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await checkPublicationUpdates(work!);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not turn a failed publication-status check into a clean bill of health', async () => {
    setFetch(async () => json({}, 503));
    expect(await checkPublicationUpdates({ title: 'A study', authors: [], year: 2020, doi: '10.1234/study', source: 'openalex' }))
      .toEqual({ status: 'unavailable', updates: [] });
  });
  it('honours disabled DOI lookups while reporting notices already supplied by a search', async () => {
    const fetch = vi.fn(async () => json({}, 503));
    setFetch(fetch);
    const work = { title: 'A study', authors: [], year: 2020, doi: '10.1234/study', source: 'openalex' as const };
    expect((await checkPublicationUpdates(work, undefined, false)).status).toBe('not_available');
    expect((await checkPublicationUpdates({ ...work, publicationStatusCheckedAt: new Date().toISOString(), publicationUpdates: [] }, undefined, false)).status).toBe('checked');
    expect(fetch).not.toHaveBeenCalled();
  });
});
