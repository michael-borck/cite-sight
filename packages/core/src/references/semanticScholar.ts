import type { AcademicWork } from '../types.js';
import { throttle } from './rateLimiter.js';
import { getCached, setCached, cacheKey } from './lookupCache.js';
import { LookupError, reasonFromStatus, reasonFromFetchError, type LookupFailureReason } from './lookupError.js';

/** Hard timeout for a single external API request. */
const API_TIMEOUT_MS = 10_000;

// ============================================================
// Response shape (Semantic Scholar Graph API)
// ============================================================

interface S2Author {
  authorId?: string;
  name?: string;
}

interface S2ExternalIds {
  DOI?: string;
  ArXiv?: string;
  [key: string]: string | undefined;
}

interface S2Journal {
  name?: string;
  volume?: string;
  pages?: string;
}

interface S2Paper {
  paperId?: string;
  title?: string;
  authors?: S2Author[];
  year?: number | null;
  externalIds?: S2ExternalIds;
  journal?: S2Journal;
  citationCount?: number;
}

// ============================================================
// Parser
// ============================================================

function paperToAcademicWork(paper: S2Paper): AcademicWork {
  return {
    title: paper.title ?? '',
    authors: (paper.authors ?? [])
      .map((a) => a.name ?? '')
      .filter(Boolean),
    year: paper.year ?? null,
    doi: paper.externalIds?.DOI,
    journal: paper.journal?.name,
    source: 'semantic_scholar',
    citationCount: paper.citationCount,
  };
}

// ============================================================
// Public API
// ============================================================

const FIELDS =
  'title,authors,year,externalIds,journal,citationCount';

/** Back-off delays before each retry. Semantic Scholar's keyless tier returns
 *  HTTP 429 aggressively under burst load; a short wait usually clears it. */
const RETRY_DELAYS_MS = [700, 1800];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Search Semantic Scholar for papers matching the given query.
 *
 * Retries transient failures (429 rate-limit, 5xx, timeout) with back-off.
 * Throws a LookupError carrying the failure reason on persistent failure, so
 * the verifier can report "unverified — rate-limited on Semantic Scholar"
 * rather than a confident "not found".
 *
 * An optional API key lifts the keyless shared-pool throttling that makes this
 * the service most likely to 429 during batch checks; when present it is sent
 * as the `x-api-key` header.
 */
export async function searchSemanticScholar(
  query: string,
  apiKey?: string,
): Promise<AcademicWork[]> {
  const key = cacheKey('s2', query);
  const cached = getCached<AcademicWork[]>(key);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({ query, limit: '5', fields: FIELDS });
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`;
  const headers: Record<string, string> = { 'User-Agent': 'CiteSight/1.0' };
  if (apiKey) headers['x-api-key'] = apiKey;

  let reason: LookupFailureReason = 'unknown';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAYS_MS[attempt - 1]);
    await throttle('s2');

    let res: Response;
    try {
      res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
    } catch (err) {
      // Network error or timeout — retryable.
      reason = reasonFromFetchError(err);
      continue;
    }

    if (res.ok) {
      const data = await res.json() as { data?: S2Paper[] };
      const works = (data?.data ?? []).map(paperToAcademicWork);
      setCached(key, works);
      return works;
    }

    reason = reasonFromStatus(res.status);
    // 429 and 5xx are transient — retry; anything else fails immediately.
    if (res.status !== 429 && res.status < 500) break;
  }

  throw new LookupError('semantic_scholar', reason);
}
