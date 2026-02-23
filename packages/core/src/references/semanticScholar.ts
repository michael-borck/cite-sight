import type { AcademicWork } from '../types';

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

/**
 * Search Semantic Scholar for papers matching the given query.
 * Returns up to 5 results, or an empty array on failure.
 */
export async function searchSemanticScholar(
  query: string,
): Promise<AcademicWork[]> {
  try {
    const params = new URLSearchParams({
      query,
      limit: '5',
      fields: FIELDS,
    });

    const url = `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CiteSight/1.0',
      },
    });

    if (!res.ok) return [];

    const data = await res.json() as { data?: S2Paper[] };
    const papers = data?.data ?? [];
    return papers.map(paperToAcademicWork);
  } catch {
    return [];
  }
}
