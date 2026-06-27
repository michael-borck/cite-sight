import type { AcademicWork } from '../types.js';
import { throttle } from './rateLimiter.js';
import { getCached, setCached, cacheKey } from './lookupCache.js';

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
}

interface DataCiteResponse {
  data?: { attributes?: DataCiteAttributes };
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
 * Returns null on a clean "not found" (404) or a transient failure (429/5xx/
 * network), mirroring lookupDoi so resolveDoi can fall through cleanly.
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
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CiteSight/1.0' + (mailto ? ` (mailto:${mailto})` : '') },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    // 404 = not a DataCite DOI; safe to cache the miss. Other non-OK (429/5xx)
    // are transient — return null but don't cache, so a later cite retries.
    if (res.status === 404) {
      setCached<AcademicWork | null>(key, null);
      return null;
    }
    if (!res.ok) return null;

    const data = (await res.json()) as DataCiteResponse;
    const a = data?.data?.attributes;
    if (!a) return null;

    const work: AcademicWork = {
      title: a.titles?.find((t) => t.title)?.title ?? '',
      authors: (a.creators ?? []).map((c) => c.name ?? '').filter(Boolean),
      year: a.publicationYear ?? null,
      doi: a.doi ?? doi,
      url: a.url,
      journal: a.publisher,
      source: 'datacite',
    };
    setCached<AcademicWork | null>(key, work);
    return work;
  } catch {
    // Network error or timeout — swallow and return null so resolveDoi falls
    // through to the next resolver rather than failing the whole lookup.
    return null;
  }
}
