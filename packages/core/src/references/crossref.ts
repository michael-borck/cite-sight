import type { AcademicWork } from '../types.js';
import { throttle } from './rateLimiter.js';
import { getCached, setCached, cacheKey } from './lookupCache.js';
import { LookupError, reasonFromStatus, reasonFromFetchError } from './lookupError.js';

/** Hard timeout for a single external API request. */
const API_TIMEOUT_MS = 10_000;

// ============================================================
// Response parsers
// ============================================================

interface CrossrefAuthor {
  family?: string;
  given?: string;
  name?: string;
}

interface CrossrefItem {
  title?: string[];
  author?: CrossrefAuthor[];
  published?: { 'date-parts'?: number[][] };
  'published-print'?: { 'date-parts'?: number[][] };
  'published-online'?: { 'date-parts'?: number[][] };
  DOI?: string;
  URL?: string;
  'container-title'?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  'is-referenced-by-count'?: number;
}

function parseYear(item: CrossrefItem): number | null {
  const src =
    item.published?.['date-parts'] ??
    item['published-print']?.['date-parts'] ??
    item['published-online']?.['date-parts'];
  if (src && src[0] && src[0][0]) return src[0][0];
  return null;
}

function parseAuthors(item: CrossrefItem): string[] {
  if (!item.author) return [];
  return item.author.map((a) => {
    if (a.name) return a.name;
    const parts = [a.family, a.given].filter(Boolean);
    return parts.join(', ');
  });
}

function itemToAcademicWork(item: CrossrefItem): AcademicWork {
  return {
    title: item.title?.[0] ?? '',
    authors: parseAuthors(item),
    year: parseYear(item),
    doi: item.DOI,
    url: item.URL,
    journal: item['container-title']?.[0],
    source: 'crossref',
    citationCount: item['is-referenced-by-count'],
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Search Crossref for works matching a bibliographic query string.
 * Returns up to 5 results, or an empty array on failure.
 */
export async function searchCrossref(
  query: string,
  mailto?: string,
): Promise<AcademicWork[]> {
  const key = cacheKey('crossref', query);
  const cached = getCached<AcademicWork[]>(key);
  if (cached !== undefined) return cached;

  await throttle('crossref');

  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: '5',
  });
  if (mailto) params.set('mailto', mailto);

  const url = `https://api.crossref.org/works?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'CiteSight/1.0 (mailto:' + (mailto ?? 'unknown') + ')' },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LookupError('crossref', reasonFromFetchError(err));
  }

  // A non-OK status is a lookup failure, not "no such work" — surface it so
  // callers can distinguish an API outage from a genuine empty result.
  if (!res.ok) throw new LookupError('crossref', reasonFromStatus(res.status), `Crossref HTTP ${res.status}`);

  const data = await res.json() as {
    message?: { items?: CrossrefItem[] };
  };
  const works = (data?.message?.items ?? []).map(itemToAcademicWork);
  setCached(key, works);
  return works;
}

/**
 * Look up a single work by its DOI via the Crossref REST API.
 * Returns null on failure or if the DOI is not found.
 */
export async function lookupDoi(
  doi: string,
  mailto?: string,
): Promise<AcademicWork | null> {
  const key = cacheKey('crossref-doi', doi);
  const cached = getCached<AcademicWork | null>(key);
  if (cached !== undefined) return cached;

  await throttle('crossref');

  try {
    const params = new URLSearchParams();
    if (mailto) params.set('mailto', mailto);

    const queryString = params.toString();
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}${queryString ? '?' + queryString : ''}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'CiteSight/1.0 (mailto:' + (mailto ?? 'unknown') + ')' },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    // 404 is a definitive "no such DOI" — safe to cache. Other non-OK statuses
    // (429/5xx) are transient: return null but don't cache, so the next paper
    // citing this DOI retries rather than inheriting a stale failure.
    if (res.status === 404) {
      setCached<AcademicWork | null>(key, null);
      return null;
    }
    if (!res.ok) return null;

    const data = await res.json() as { message?: CrossrefItem };
    const item = data?.message;
    if (!item) return null;

    const work = itemToAcademicWork(item);
    setCached<AcademicWork | null>(key, work);
    return work;
  } catch {
    return null;
  }
}
