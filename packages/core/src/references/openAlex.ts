import type { AcademicWork } from '../types';

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
  try {
    const params = new URLSearchParams({
      search: query,
      per_page: '5',
    });
    if (mailto) params.set('mailto', mailto);

    const url = `https://api.openalex.org/works?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CiteSight/1.0' + (mailto ? ` (mailto:${mailto})` : ''),
      },
    });

    if (!res.ok) return [];

    const data = await res.json() as { results?: OAWork[] };
    const works = data?.results ?? [];
    return works.map(workToAcademicWork);
  } catch {
    return [];
  }
}
