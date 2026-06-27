import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lookupDoiDataCite } from '../src/references/datacite.js';
import { clearLookupCache } from '../src/references/lookupCache.js';
import { setMinRequestInterval } from '../src/references/rateLimiter.js';

// No real pacing in tests — the 1 req/sec limiter would otherwise add a second
// per call.
setMinRequestInterval(0);

// Shared by every case: a JSON Response with the content-type DataCite sends.
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  clearLookupCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupDoiDataCite', () => {
  it('parses a DataCite record into an AcademicWork', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: { attributes: {
        doi: '10.5281/zenodo.1234567',
        titles: [{ title: 'Supporting data for "Attention is all you need"' }],
        creators: [{ name: 'Vaswani, A.' }, { name: 'Shazeer, N.' }],
        publicationYear: 2018,
        publisher: 'Zenodo',
        url: 'https://zenodo.org/record/1234567',
      } },
    })));

    const work = await lookupDoiDataCite('10.5281/zenodo.1234567', 'a@b.com');
    expect(work).toMatchObject({
      title: 'Supporting data for "Attention is all you need"',
      authors: ['Vaswani, A.', 'Shazeer, N.'],
      year: 2018,
      doi: '10.5281/zenodo.1234567',
      source: 'datacite',
    });
    expect(work?.url).toBe('https://zenodo.org/record/1234567');
  });

  it('returns null for a DOI DataCite does not hold (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 404)));
    expect(await lookupDoiDataCite('10.9999/nope')).toBeNull();
  });

  it('does not cache a transient failure (429) — it is retried', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 429));
    vi.stubGlobal('fetch', fetchMock);
    await lookupDoiDataCite('10.5281/zenodo.999');
    await lookupDoiDataCite('10.5281/zenodo.999');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches a resolved record for the run', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: { attributes: {
        doi: '10.5281/zenodo.1', titles: [{ title: 'X' }],
        creators: [], publicationYear: 2020, publisher: 'Zenodo',
      } },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await lookupDoiDataCite('10.5281/zenodo.1');
    await lookupDoiDataCite('10.5281/zenodo.1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
