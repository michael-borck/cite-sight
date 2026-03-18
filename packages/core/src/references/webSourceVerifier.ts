import type { ParsedReference, AcademicWork } from '../types.js';
import { isPrivateUrl } from './ssrf.js';

// ============================================================
// Web Source Verifier — non-academic reference verification
// ============================================================

type WebSourceType = 'youtube' | 'vimeo' | 'open_library' | 'web_metadata';

/** Detect source type from URL hostname. */
function detectSourceType(url: string): WebSourceType {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
    if (hostname.includes('vimeo.com')) return 'vimeo';
    if (hostname.includes('openlibrary.org') || hostname.includes('books.google.com')) return 'open_library';
  } catch {
    // invalid URL — fall through
  }
  return 'web_metadata';
}

/** Extract ISBN from raw reference text. */
function extractIsbn(raw: string): string | null {
  // ISBN-13 or ISBN-10
  const match = raw.match(/\b(?:ISBN[-:]?\s*)(97[89][-\s]?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,7}[-\s]?\d)/i)
    || raw.match(/\b(?:ISBN[-:]?\s*)(\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,7}[-\s]?[\dXx])/i)
    || raw.match(/\b(97[89]\d{10})\b/)
    || raw.match(/\b(\d{9}[\dXx])\b/);
  return match ? match[1].replace(/[-\s]/g, '') : null;
}

/** Safe fetch wrapper with timeout. */
async function safeFetch(url: string, timeoutMs = 8000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CiteSight/1.0 (academic-reference-checker)' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

// --- YouTube / Vimeo via oEmbed ---

async function verifyYouTube(url: string): Promise<AcademicWork | null> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const res = await safeFetch(oembedUrl);
  if (!res || !res.ok) return null;

  const data = await res.json() as { title?: string; author_name?: string };
  if (!data.title) return null;

  return {
    title: data.title,
    authors: data.author_name ? [data.author_name] : [],
    year: null,
    source: 'youtube',
    url,
  };
}

async function verifyVimeo(url: string): Promise<AcademicWork | null> {
  const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
  const res = await safeFetch(oembedUrl);
  if (!res || !res.ok) return null;

  const data = await res.json() as { title?: string; author_name?: string };
  if (!data.title) return null;

  return {
    title: data.title,
    authors: data.author_name ? [data.author_name] : [],
    year: null,
    source: 'vimeo',
    url,
  };
}

// --- Books via Open Library ---

async function verifyBookByIsbn(isbn: string): Promise<AcademicWork | null> {
  const res = await safeFetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
  );
  if (!res || !res.ok) return null;

  const data = await res.json() as Record<string, {
    title?: string;
    authors?: Array<{ name: string }>;
    publish_date?: string;
    url?: string;
  }>;
  const entry = data[`ISBN:${isbn}`];
  if (!entry?.title) return null;

  const yearMatch = entry.publish_date?.match(/\d{4}/);

  return {
    title: entry.title,
    authors: entry.authors?.map((a) => a.name) ?? [],
    year: yearMatch ? parseInt(yearMatch[0], 10) : null,
    source: 'open_library',
    url: entry.url ?? `https://openlibrary.org/isbn/${isbn}`,
  };
}

async function verifyBookBySearch(title: string, author?: string): Promise<AcademicWork | null> {
  const q = [title, author].filter(Boolean).join(' ');
  const res = await safeFetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=3`,
  );
  if (!res || !res.ok) return null;

  const data = await res.json() as {
    docs?: Array<{
      title?: string;
      author_name?: string[];
      first_publish_year?: number;
      isbn?: string[];
    }>;
  };

  if (!data.docs?.length) return null;
  const doc = data.docs[0];
  if (!doc.title) return null;

  return {
    title: doc.title,
    authors: doc.author_name ?? [],
    year: doc.first_publish_year ?? null,
    source: 'open_library',
    url: doc.isbn?.[0]
      ? `https://openlibrary.org/isbn/${doc.isbn[0]}`
      : undefined,
  };
}

// --- Generic web page via HTML metadata ---

function extractMetaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    // Match both name="..." and property="..." attributes
    const regex = new RegExp(
      `<meta\\s+(?:[^>]*?)(?:name|property)=["']${name}["'][^>]*?content=["']([^"']+)["']`
      + `|<meta\\s+(?:[^>]*?)content=["']([^"']+)["'][^>]*?(?:name|property)=["']${name}["']`,
      'i',
    );
    const match = html.match(regex);
    if (match) return match[1] || match[2];
  }
  return null;
}

function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

async function verifyWebPage(url: string): Promise<AcademicWork | null> {
  // Block requests to private/internal networks (SSRF protection)
  if (isPrivateUrl(url)) return null;

  const res = await safeFetch(url);
  if (!res || !res.ok) return null;

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null;

  const html = await res.text();

  const title =
    extractMetaContent(html, ['og:title', 'twitter:title']) ?? extractHtmlTitle(html);
  if (!title) return null;

  const author = extractMetaContent(html, ['article:author', 'author', 'dc.creator']);
  const dateStr = extractMetaContent(html, ['article:published_time', 'date', 'dc.date']);
  const yearMatch = dateStr?.match(/\d{4}/);

  return {
    title,
    authors: author ? [author] : [],
    year: yearMatch ? parseInt(yearMatch[0], 10) : null,
    source: 'web_metadata',
    url,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Attempt to verify a non-academic reference via web sources.
 *
 * Checks YouTube/Vimeo oEmbed, Open Library (ISBN or search),
 * and generic web page metadata as a cascade.
 *
 * Returns an AcademicWork if the source could be verified, or null.
 */
export async function verifyWebSource(ref: ParsedReference): Promise<AcademicWork | null> {
  const isbn = extractIsbn(ref.raw);

  // ISBN found → try Open Library first, regardless of URL
  if (isbn) {
    const bookResult = await verifyBookByIsbn(isbn);
    if (bookResult) return bookResult;
  }

  if (!ref.url) {
    // No URL — try Open Library search for potential book references
    if (ref.title && (isbn || ref.title.length > 10)) {
      return verifyBookBySearch(ref.title, ref.authors[0]);
    }
    return null;
  }

  const sourceType = detectSourceType(ref.url);

  switch (sourceType) {
    case 'youtube':
      return verifyYouTube(ref.url);
    case 'vimeo':
      return verifyVimeo(ref.url);
    case 'open_library':
      return verifyBookBySearch(ref.title, ref.authors[0]);
    case 'web_metadata':
      return verifyWebPage(ref.url);
  }
}
