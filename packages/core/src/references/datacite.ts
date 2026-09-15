import type { AcademicWork } from '../types.js';
import { throttle } from './rateLimiter.js';
import { getCached, setCached, cacheKey } from './lookupCache.js';
import { httpFetch } from '../httpClient.js';
import { LookupError, reasonFromStatus, reasonFromFetchError } from './lookupError.js';

/** Hard timeout for a single DataCite API request. */
const API_TIMEOUT_MS = 10_000;

// ============================================================
// Response shape (DataCite REST API)
// ============================================================

interface DataCiteAttributes {
  doi?: string;
  titles?: { title?: string }[];
  creators?: { name?: string }[];
  publicationYear?: number;
  publisher?: string;
  url?: string;
  types?: { resourceTypeGeneral?: string };
}

interface DataCiteResponse {
  data?: { attributes?: DataCiteAttributes };
}

function toWork(a: DataCiteAttributes): AcademicWork {
  return {
    title: a.titles?.find((t) => t.title)?.title ?? '',
    authors: (a.creators ?? []).map((c) => c.name ?? '').filter(Boolean),
    year: a.publicationYear ?? null, doi: a.doi, url: a.url,
    source: 'datacite', workType: a.types?.resourceTypeGeneral,
  };
}

/** Public title search also finds deposits whose citations omit their DOI. */
export async function searchDataCite(title: string, mailto?: string): Promise<AcademicWork[]> {
  if (!title.trim()) return [];
  const key = cacheKey('datacite-search', title);
  const cached = getCached<AcademicWork[]>(key);
  if (cached !== undefined) return cached;
  await throttle('datacite');
  // Quote user text as a literal rather than accepting Lucene query operators.
  const literal = title.replace(/["\\]/g, ' ');
  const params = new URLSearchParams({ query: `titles.title:"${literal}"`, 'page[size]': '5' });
  if (mailto) params.set('mailto', mailto);
  try {
    const res = await httpFetch(`https://api.datacite.org/dois?${params}`, {
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: { 'User-Agent': 'CiteSight/1.0' + (mailto ? ` (mailto:${mailto})` : '') },
    });
    if (!res.ok) throw new LookupError('datacite', reasonFromStatus(res.status));
    const data = await res.json() as { data?: { attributes?: DataCiteAttributes }[] };
    if (!Array.isArray(data.data)) throw new LookupError('datacite', 'unknown', 'Malformed search response');
    const works = data.data.flatMap((item) => item.attributes ? [toWork(item.attributes)] : []);
    setCached(key, works);
    return works;
  } catch (err) {
    if (err instanceof LookupError) throw err;
    throw new LookupError('datacite', reasonFromFetchError(err));
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Resolve a DOI registered with DataCite to academic metadata.
 *
 * Crossref holds scholarly works; DataCite holds the rest — datasets, software,
 * and repository deposits (Zenodo, Figshare, Dryad, etc.), typically under the
 * 10.5281 / 10.6084 / 10.5061 prefixes. A DOI that misses on Crossref often
 * resolves here with full metadata. Free, no API key.
 *
 * Returns null on a clean miss. Throws on service failures so callers can retry.
 */
export async function lookupDoiDataCite(
  doi: string,
  mailto?: string,
): Promise<AcademicWork | null> {
  const key = cacheKey('datacite-doi', doi);
  const cached = getCached<AcademicWork | null>(key);
  if (cached !== undefined) return cached;

  await throttle('datacite');

  const url = `https://api.datacite.org/dois/${encodeURIComponent(doi)}`;
  try {
    const res = await httpFetch(url, {
      headers: { 'User-Agent': 'CiteSight/1.0' + (mailto ? ` (mailto:${mailto})` : '') },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    // Cache clean misses only.
    if (res.status === 404) {
      setCached<AcademicWork | null>(key, null);
      return null;
    }
    if (!res.ok) throw new LookupError('datacite', reasonFromStatus(res.status));

    const data = (await res.json()) as DataCiteResponse;
    const a = data?.data?.attributes;
    if (!a) throw new LookupError('datacite', 'unknown', 'Missing DOI metadata');

    const work = { ...toWork(a), doi: a.doi ?? doi };
    setCached<AcademicWork | null>(key, work);
    return work;
  } catch (err) {
    if (err instanceof LookupError) throw err;
    throw new LookupError('datacite', reasonFromFetchError(err));
  }
}
