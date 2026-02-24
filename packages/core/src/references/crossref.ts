import type { AcademicWork } from '../types.js';

// ============================================================
// Rate limiting
// ============================================================

/** Wait ms milliseconds. Used to respect Crossref polite-pool rate limits. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const POLITE_DELAY_MS = 350;

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
  await delay(POLITE_DELAY_MS);

  try {
    const params = new URLSearchParams({
      'query.bibliographic': query,
      rows: '5',
    });
    if (mailto) params.set('mailto', mailto);

    const url = `https://api.crossref.org/works?${params.toString()}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CiteSight/1.0 (mailto:' + (mailto ?? 'unknown') + ')' },
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      message?: { items?: CrossrefItem[] };
    };
    const items = data?.message?.items ?? [];
    return items.map(itemToAcademicWork);
  } catch {
    return [];
  }
}

/**
 * Look up a single work by its DOI via the Crossref REST API.
 * Returns null on failure or if the DOI is not found.
 */
export async function lookupDoi(
  doi: string,
  mailto?: string,
): Promise<AcademicWork | null> {
  await delay(POLITE_DELAY_MS);

  try {
    const params = new URLSearchParams();
    if (mailto) params.set('mailto', mailto);

    const queryString = params.toString();
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}${queryString ? '?' + queryString : ''}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'CiteSight/1.0 (mailto:' + (mailto ?? 'unknown') + ')' },
    });

    if (res.status === 404) return null;
    if (!res.ok) return null;

    const data = await res.json() as { message?: CrossrefItem };
    const item = data?.message;
    if (!item) return null;

    return itemToAcademicWork(item);
  } catch {
    return null;
  }
}
