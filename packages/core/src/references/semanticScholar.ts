import type { AcademicWork } from '../types.js';

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
 * Retries transient failures (429 rate-limit, 5xx, timeout) with back-off.
 * Throws on persistent failure so the verifier can flag the reference as
 * unverifiable rather than confidently "not found".
 */
export async function searchSemanticScholar(
  query: string,
): Promise<AcademicWork[]> {
  const params = new URLSearchParams({ query, limit: '5', fields: FIELDS });
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`;

  let lastErr: Error = new Error('Semantic Scholar search failed');
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAYS_MS[attempt - 1]);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'CiteSight/1.0' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
    } catch (err) {
      // Network error or timeout — retryable.
      lastErr = err instanceof Error ? err : new Error(`Semantic Scholar search failed: ${String(err)}`);
      continue;
    }

    if (res.ok) {
      const data = await res.json() as { data?: S2Paper[] };
      return (data?.data ?? []).map(paperToAcademicWork);
    }

    lastErr = new Error(`Semantic Scholar search failed: HTTP ${res.status}`);
    // 429 and 5xx are transient — retry; anything else fails immediately.
    if (res.status !== 429 && res.status < 500) break;
  }

  throw lastErr;
}
