import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDoi } from '../src/references/doiResolver.js';
import { httpFetch } from '../src/httpClient.js';
import { lookupDoi } from '../src/references/crossref.js';
import { lookupDoiDataCite } from '../src/references/datacite.js';
import { LookupError } from '../src/references/lookupError.js';

vi.mock('../src/references/crossref.js', () => ({ lookupDoi: vi.fn(async () => null) }));
vi.mock('../src/references/datacite.js', () => ({ lookupDoiDataCite: vi.fn(async () => null) }));
vi.mock('../src/references/rateLimiter.js', () => ({ throttle: vi.fn(async () => undefined) }));
vi.mock('../src/httpClient.js', () => ({ httpFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe('DOI registry fallback', () => {
  it('continues to DataCite after a Crossref failure', async () => {
    vi.mocked(lookupDoi).mockRejectedValue(new LookupError('crossref', 'rate_limited'));
    vi.mocked(lookupDoiDataCite).mockResolvedValue({ title: 'A dataset', authors: [], year: 2024, source: 'datacite' });
    expect(await resolveDoi('10.5281/zenodo.1')).toMatchObject({ source: 'datacite' });
    expect(httpFetch).not.toHaveBeenCalled();
  });
  it('preserves failed metadata lookups if the registry also finds nothing', async () => {
    vi.mocked(lookupDoi).mockRejectedValue(new LookupError('crossref', 'timeout'));
    vi.mocked(httpFetch).mockResolvedValue(new Response(null, { status: 404 }));
    await expect(resolveDoi('10.9999/audit')).rejects.toMatchObject({ service: 'crossref', reason: 'timeout' });
  });
  it.each([403, 429, 503])('does not accept HTTP %s as registration', async (status) => {
    vi.mocked(httpFetch).mockResolvedValue(new Response(null, { status }));
    await expect(resolveDoi('10.9999/audit')).rejects.toMatchObject({ service: 'doi.org' });
  });
  it('returns a clean miss only for a registry 404', async () => {
    vi.mocked(httpFetch).mockResolvedValue(new Response(null, { status: 404 }));
    expect(await resolveDoi('10.9999/audit')).toBeNull();
  });
  it('accepts a confirmed publisher redirect without requesting the publisher', async () => {
    vi.mocked(httpFetch).mockResolvedValue(new Response(null, {
      status: 302, headers: { location: 'https://publisher.example/work' },
    }));
    expect(await resolveDoi('10.9999/audit')).toMatchObject({ url: 'https://publisher.example/work' });
    expect(httpFetch).toHaveBeenCalledOnce();
    expect(httpFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'manual' }));
  });
  it('follows registry redirects before deciding a DOI exists', async () => {
    vi.mocked(httpFetch).mockResolvedValueOnce(new Response(null, {
      status: 301, headers: { location: 'https://dx.doi.org/10.9999/audit' },
    })).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await resolveDoi('10.9999/audit')).toBeNull();
  });
});
