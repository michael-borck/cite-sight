import type { AcademicWork } from '../types.js';
import { throttle, setServiceInterval } from './rateLimiter.js';
import { getCached, setCached, cacheKey } from './lookupCache.js';
import { LookupError, reasonFromStatus, reasonFromFetchError } from './lookupError.js';
import { httpFetch } from '../httpClient.js';

/** Hard timeout for a single external API request. */
const API_TIMEOUT_MS = 10_000;

// arXiv's API Terms of Use ask for no more than one request every three
// seconds — slower than the 1 req/s default the other services use.
setServiceInterval('arxiv', 3_100);

// ============================================================
// arXiv lookup
//
// Preprints are a structural blind spot for the Crossref-first cascade:
// arXiv works are registered with DataCite (not Crossref), ICLR/NeurIPS
// proceedings are patchily indexed, and a Crossref bibliographic search for a
// preprint title returns the *nearest-titled different work* — which then
// reads as a metadata mismatch blamed on the citation. The arXiv Atom API is
// authoritative for its own IDs and searchable by title, and needs no key.
// ============================================================

// New-style arXiv identifier (2007+): YYMM.NNNN or YYMM.NNNNN, optionally
// versioned. Matched either with an explicit "arXiv:" prefix anywhere in the
// string, or bare when the string mentions arXiv elsewhere.
const ARXIV_ID_PREFIXED_RE = /\barxiv[:\s/]*((?:\d{4})\.\d{4,5})(?:v\d+)?\b/i;
const ARXIV_ID_BARE_RE = /\b(\d{4}\.\d{4,5})(?:v\d+)?\b/;

/**
 * Extract a new-style arXiv ID from a raw reference string, or null.
 * A bare ID (no "arXiv:" prefix) is accepted only when the string mentions
 * arXiv somewhere, so page ranges like "2205.11" in unrelated citations
 * cannot masquerade as identifiers.
 */
export function extractArxivId(raw: string): string | null {
  const prefixed = raw.match(ARXIV_ID_PREFIXED_RE);
  if (prefixed) return prefixed[1];
  if (/arxiv/i.test(raw)) {
    const bare = raw.match(ARXIV_ID_BARE_RE);
    if (bare) return bare[1];
  }
  return null;
}

// ------------------------------------------------------------
// Atom XML parsing (regex-level: the feed is machine-generated and flat;
// pulling title/name/published per <entry> avoids an XML dependency).
// ------------------------------------------------------------

interface ArxivEntry {
  title: string;
  authors: string[];
  year: number | null;
  id: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Parse the <entry> blocks of an arXiv Atom feed. */
export function parseArxivFeed(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = m[1];
    const title = block.match(/<title>([\s\S]*?)<\/title>/);
    const published = block.match(/<published>(\d{4})-/);
    const idM = block.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<v]+)(?:v\d+)?<\/id>/);
    const authors = [...block.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((a) =>
      decodeEntities(a[1].trim()),
    );
    if (!title) continue;
    entries.push({
      title: decodeEntities(title[1].replace(/\s+/g, ' ').trim()),
      authors,
      year: published ? parseInt(published[1], 10) : null,
      id: idM ? idM[1].trim() : '',
    });
  }
  return entries;
}

function entryToWork(e: ArxivEntry): AcademicWork {
  return {
    title: e.title,
    authors: e.authors,
    year: e.year,
    // arXiv DOIs are DataCite-registered as 10.48550/arXiv.<id>.
    doi: e.id ? `10.48550/arXiv.${e.id}` : undefined,
    url: e.id ? `https://arxiv.org/abs/${e.id}` : undefined,
    journal: 'arXiv',
    source: 'arxiv',
  };
}

async function fetchFeed(params: URLSearchParams): Promise<ArxivEntry[]> {
  await throttle('arxiv');
  const url = `https://export.arxiv.org/api/query?${params.toString()}`;
  let res: Response;
  try {
    res = await httpFetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  } catch (err) {
    throw new LookupError('arxiv', reasonFromFetchError(err));
  }
  if (!res.ok) throw new LookupError('arxiv', reasonFromStatus(res.status), `arXiv HTTP ${res.status}`);
  return parseArxivFeed(await res.text());
}

// ============================================================
// Public API
// ============================================================

/**
 * Look up a single work by its arXiv ID. Authoritative for preprints the
 * same way DOI resolution is for published works. Returns null when the ID
 * does not resolve.
 */
export async function lookupArxivId(id: string): Promise<AcademicWork | null> {
  const key = cacheKey('arxiv-id', id);
  const cached = getCached<AcademicWork | null>(key);
  if (cached !== undefined) return cached;

  const entries = await fetchFeed(new URLSearchParams({ id_list: id }));
  // An unknown ID yields a feed whose single entry has an error title/no id.
  const entry = entries.find((e) => e.id && e.authors.length > 0);
  const work = entry ? entryToWork(entry) : null;
  setCached(key, work);
  return work;
}

/**
 * Search arXiv by title words. Returns up to 5 results, empty on no match.
 */
export async function searchArxiv(query: string): Promise<AcademicWork[]> {
  const key = cacheKey('arxiv', query);
  const cached = getCached<AcademicWork[]>(key);
  if (cached !== undefined) return cached;

  const cleaned = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const params = new URLSearchParams({
    search_query: `ti:"${cleaned}"`,
    max_results: '5',
  });
  const works = (await fetchFeed(params)).filter((e) => e.id).map(entryToWork);
  setCached(key, works);
  return works;
}
