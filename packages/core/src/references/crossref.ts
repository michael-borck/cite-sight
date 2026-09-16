import type { AcademicWork } from '../types.js';
import { throttle } from './rateLimiter.js';
import { getCached, setCached, cacheKey } from './lookupCache.js';
import { LookupError, reasonFromStatus, reasonFromFetchError } from './lookupError.js';
import { httpFetch } from '../httpClient.js';

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
  type?: string;
  abstract?: string;
  'updated-by'?: { DOI?: string; type?: string; source?: string; updated?: { 'date-time'?: string } }[];
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
    volume: item.volume,
    issue: item.issue,
    pages: item.page,
    source: 'crossref',
    citationCount: item['is-referenced-by-count'],
    workType: item.type,
    abstract: item.abstract ? item.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || undefined : undefined,
    // updated-by describes notices ABOUT this work. update-to instead describes
    // what a notice updates; treating that as a retraction would flag the notice.
    publicationUpdates: (item['updated-by'] ?? []).map((update) => ({
      type: update.type ?? 'update', doi: update.DOI, source: update.source ?? 'publisher', date: update.updated?.['date-time'],
    })),
    publicationStatusCheckedAt: new Date().toISOString(),
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
    res = await httpFetch(url, {
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
 * Returns null for a clean miss; failures remain distinguishable from absence.
 */
export async function lookupDoi(
  doi: string,
  mailto?: string,
): Promise<AcademicWork | null> {
  const key = cacheKey('crossref-doi', doi);
  const cached = getCached<AcademicWork | null>(key);
  if (cached === null) return cached;
  if (cached?.publicationStatusCheckedAt && Date.now() - Date.parse(cached.publicationStatusCheckedAt) < 86_400_000) return cached;

  await throttle('crossref');

  try {
    const params = new URLSearchParams();
    if (mailto) params.set('mailto', mailto);

    const queryString = params.toString();
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}${queryString ? '?' + queryString : ''}`;

    const res = await httpFetch(url, {
      headers: { 'User-Agent': 'CiteSight/1.0 (mailto:' + (mailto ?? 'unknown') + ')' },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    // Cache clean misses only. Never cache a service failure.
    if (res.status === 404) {
      setCached<AcademicWork | null>(key, null);
      return null;
    }
    if (!res.ok) throw new LookupError('crossref', reasonFromStatus(res.status));

    const data = await res.json() as { message?: CrossrefItem };
    const item = data?.message;
    if (!item) throw new LookupError('crossref', 'unknown', 'Missing DOI metadata');

    const work = itemToAcademicWork(item);
    setCached<AcademicWork | null>(key, work);
    return work;
  } catch (err) {
    if (err instanceof LookupError) throw err;
    throw new LookupError('crossref', reasonFromFetchError(err));
  }
}
