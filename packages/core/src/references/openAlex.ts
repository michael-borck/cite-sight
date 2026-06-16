import type { AcademicWork } from '../types.js';
import { throttle } from './rateLimiter.js';
import { getCached, setCached, cacheKey } from './lookupCache.js';
import { LookupError, reasonFromStatus, reasonFromFetchError, type LookupFailureReason } from './lookupError.js';

/** Hard timeout for a single external API request. OpenAlex can be slow under
 *  load, so this is generous; a too-short timeout makes valid works look
 *  unverifiable. */
const API_TIMEOUT_MS = 15_000;

/** Back-off delays before each retry on a transient failure. */
const RETRY_DELAYS_MS = [700, 1800];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Response shape (OpenAlex REST API)
// ============================================================

interface OAAuthorships {
  author?: {
    display_name?: string;
  };
}

interface OALocation {
  source?: {
    display_name?: string;
  };
}

interface OAWork {
  id?: string;
  title?: string;
  display_name?: string;
  authorships?: OAAuthorships[];
  publication_year?: number | null;
  doi?: string;
  primary_location?: OALocation;
  best_oa_location?: OALocation;
  cited_by_count?: number;
}

// ============================================================
// Parser
// ============================================================

function workToAcademicWork(work: OAWork): AcademicWork {
  // OpenAlex DOIs come as full URLs: "https://doi.org/10.xxx/yyy"
  const rawDoi = work.doi ?? '';
  const doi = rawDoi.startsWith('https://doi.org/')
    ? rawDoi.slice('https://doi.org/'.length)
    : rawDoi || undefined;

  const journal =
    work.primary_location?.source?.display_name ??
    work.best_oa_location?.source?.display_name;

  return {
    title: work.display_name ?? work.title ?? '',
    authors: (work.authorships ?? [])
      .map((a) => a.author?.display_name ?? '')
      .filter(Boolean),
    year: work.publication_year ?? null,
    doi: doi || undefined,
    journal,
    source: 'openalex',
    citationCount: work.cited_by_count,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Search OpenAlex for works matching the given query.
 * Returns up to 5 results, or an empty array on failure.
 */
export async function searchOpenAlex(
  query: string,
  mailto?: string,
): Promise<AcademicWork[]> {
  const key = cacheKey('openalex', query);
  const cached = getCached<AcademicWork[]>(key);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({ search: query, per_page: '5' });
  if (mailto) params.set('mailto', mailto);
  const url = `https://api.openalex.org/works?${params.toString()}`;

  let reason: LookupFailureReason = 'unknown';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAYS_MS[attempt - 1]);
    await throttle();

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': 'CiteSight/1.0' + (mailto ? ` (mailto:${mailto})` : ''),
        },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
    } catch (err) {
      // Network error or timeout — retryable.
      reason = reasonFromFetchError(err);
      continue;
    }

    if (res.ok) {
      const data = await res.json() as { results?: OAWork[] };
      const works = (data?.results ?? []).map(workToAcademicWork);
      setCached(key, works);
      return works;
    }

    // Surface lookup failures (vs genuine empty results) so the verifier can
    // flag a reference as unverifiable rather than confidently "not found".
    reason = reasonFromStatus(res.status);
    // 429 and 5xx are transient — retry; anything else fails immediately.
    if (res.status !== 429 && res.status < 500) break;
  }

  throw new LookupError('openalex', reason);
}
