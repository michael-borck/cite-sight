import type { ParsedReference, AcademicWork } from '../types.js';
import { isPrivateUrl } from './ssrf.js';
import { httpFetch } from '../httpClient.js';
import { LookupError, reasonFromStatus, reasonFromFetchError, type LookupFailureReason } from './lookupError.js';
import { throttle } from './rateLimiter.js';
import { surnameOf } from './matching.js';

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
  const isbn = match?.[1].replace(/[-\s]/g, '').toUpperCase();
  if (!isbn) return null;
  const valid = /^\d{13}$/.test(isbn)
    ? [...isbn].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10 === 0
    : /^\d{9}[\dX]$/.test(isbn) && [...isbn].reduce((sum, digit, i) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - i), 0) % 11 === 0;
  return valid ? isbn : null;
}

/** Back-off delays before each retry on a transient web failure. */
const RETRY_DELAYS_MS = [700, 1800];
/** A site may ask for a long Retry-After; cap it so one page cannot stall a run. */
const MAX_RETRY_AFTER_MS = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse Retry-After (seconds or HTTP date) into a bounded millisecond wait. */
function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), MAX_RETRY_AFTER_MS) : null;
}

/** Safe fetch wrapper with timeout, per-host pacing, and retry/back-off on
 *  transient failures (429, 5xx, timeout, network) so a temporarily
 *  rate-limited website does not become a false "could not verify". */
async function safeFetch(url: string, timeoutMs = 8000): Promise<Response | null> {
  const service = new URL(url).hostname;
  let reason: LookupFailureReason = 'unknown';
  let waitMs = 0;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await delay(waitMs);
    await throttle(service);

    let res: Response;
    try {
      res = await httpFetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'CiteSight/1.0 (academic-reference-checker)' },
        redirect: 'follow',
      });
    } catch (err) {
      // Network error or timeout — retryable.
      reason = reasonFromFetchError(err);
      waitMs = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!;
      continue;
    }

    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel();
      return null;
    }
    if (res.ok) return res;

    reason = reasonFromStatus(res.status);
    const retryable = res.status === 429 || res.status >= 500;
    waitMs = retryAfterMs(res.headers.get('retry-after')) ?? RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!;
    await res.body?.cancel();
    // 401/403/451 etc. mean the server declined; retrying will not help.
    if (!retryable) break;
  }

  throw new LookupError(service, reason);
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

/** Reduce an author string ("Eyal, N." | "Nir Eyal") to a bare surname. */
function authorSurname(author?: string): string {
  return surnameOf(author ?? '');
}

async function verifyBookBySearch(title: string, author?: string): Promise<AcademicWork | null> {
  // Open Library's free-text q is poisoned by APA-style "Last, F." author
  // strings — the comma + trailing initials drive matches to zero. Query the
  // title together with the author's bare *surname* only.
  const surname = authorSurname(author);
  const params = new URLSearchParams({ title, limit: '5' });
  if (surname) params.set('author', surname);
  const res = await safeFetch(
    `https://openlibrary.org/search.json?${params}`,
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

  // Prefer a result whose author surname matches the citation; otherwise fall
  // back to the first titled result. (Open Library stores only the *main* title
  // — "Hooked" for "Hooked: How to build…" — so the caller corroborates the
  // match by author + title containment rather than exact title equality.)
  const sn = surname.toLowerCase();
  const byAuthor = sn
    ? data.docs.find((d) =>
        (d.author_name ?? []).some((a) => surnameOf(a) === sn),
      )
    : undefined;
  const doc = byAuthor ?? data.docs.find((d) => d.title);
  if (!doc?.title) return null;

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

function extractMetaContents(html: string, names: string[]): string[] {
  const values: string[] = [];
  for (const name of names) {
    // Match both name="..." and property="..." attributes, collecting every
    // occurrence — citation_author is emitted once per author.
    const regex = new RegExp(
      `<meta\\s+(?:[^>]*?)(?:name|property)=["']${name}["'][^>]*?content=["']([^"']+)["']`
      + `|<meta\\s+(?:[^>]*?)content=["']([^"']+)["'][^>]*?(?:name|property)=["']${name}["']`,
      'gi',
    );
    for (const match of html.matchAll(regex)) {
      const value = match[1] || match[2];
      if (value) values.push(value);
    }
  }
  return values;
}

function extractMetaContent(html: string, names: string[]): string | null {
  return extractMetaContents(html, names)[0] ?? null;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? entity);
}

function codePoint(code: number): string {
  try { return String.fromCodePoint(code); } catch { return ''; }
}

/** Reduce an HTML fragment to readable text, dropping scripts/styles. */
function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? stripHtml(match[1]) : '';
  return title || null;
}

function extractH1(html: string): string | null {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = match ? stripHtml(match[1]) : '';
  return title.length >= 3 ? title : null;
}

function cleanAuthor(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+et\s+al\.?$/i, '')
    .replace(/^[\s,;:.–—-]+|[\s,;:.–—-]+$/g, '')
    .trim();
}

/** Split an author string without breaking a "Last, First" name. */
function splitAuthorNames(value: string): string[] {
  return value
    .split(/\s*(?:;|&|\band\b)\s*|,\s*(?=\p{Lu}[\p{L}.'’-]+\s+\p{Lu}[\p{L}.'’-]+)/u)
    .map(cleanAuthor)
    .filter(Boolean);
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function yearOf(value: string | null | undefined): number | null {
  const match = value?.match(/(?:19|20)\d{2}/);
  return match ? parseInt(match[0], 10) : null;
}

// --- JSON-LD (schema.org) -------------------------------------------------

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function flattenJsonLd(value: unknown, out: JsonObject[] = [], depth = 0): JsonObject[] {
  if (depth > 6 || value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, out, depth + 1);
    return out;
  }
  if (!isJsonObject(value)) return out;
  out.push(value);
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'hasPart']) {
    if (key in value) flattenJsonLd(value[key], out, depth + 1);
  }
  return out;
}

function jsonLdAuthors(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) jsonLdAuthors(item, out);
    return out;
  }
  if (isJsonObject(value)) {
    const parts = [jsonString(value.givenName), jsonString(value.familyName)]
      .filter((part): part is string => Boolean(part));
    const name = jsonString(value.name) ?? (parts.length ? parts.join(' ') : undefined);
    if (name) out.push(...splitAuthorNames(name));
    return out;
  }
  const raw = jsonString(value);
  if (raw) out.push(...splitAuthorNames(raw));
  return out;
}

const JSON_LD_RE = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const ARTICLE_TYPE_RE = /Article|BlogPosting|Scholarly|Report|Book|Thesis|Review|CreativeWork/i;

interface JsonLdMetadata {
  title?: string;
  authors: string[];
  year: number | null;
}

/** Pull title/author/date out of schema.org JSON-LD blocks. Malformed blocks
 *  are ignored: a broken script must not defeat the metadata fallback. */
function jsonLdMetadata(html: string): JsonLdMetadata {
  const result: JsonLdMetadata = { authors: [], year: null };
  for (const match of html.matchAll(JSON_LD_RE)) {
    let data: unknown;
    try { data = JSON.parse(match[1].trim()); } catch { continue; }
    for (const node of flattenJsonLd(data)) {
      const rawType = node['@type'];
      const types = Array.isArray(rawType) ? rawType : [rawType];
      const articleLike = types.some((type) => typeof type === 'string' && ARTICLE_TYPE_RE.test(type))
        || 'headline' in node || 'datePublished' in node;
      if (!articleLike) continue;
      result.title ??= jsonString(node.headline) ?? jsonString(node.name) ?? jsonString(node.title);
      result.authors.push(...jsonLdAuthors(node.author ?? node.creator));
      if (result.year == null) {
        const date = jsonString(node.datePublished) ?? jsonString(node.dateCreated);
        result.year = yearOf(date);
      }
    }
  }
  result.authors = uniqueNames(result.authors);
  return result;
}

// --- Visible-text fallback (pages without citation metadata) --------------

function looksLikePersonName(value: string): boolean {
  const name = cleanAuthor(value);
  if (name.length < 3 || name.length > 80) return false;
  if (/\d|https?:|@|\//.test(name)) return false;
  return /^\p{Lu}[\p{L}.'’-]+(?:\s+\p{Lu}[\p{L}.'’-]+){1,3}$/u.test(name);
}

/** Last-resort author lookup: labelled author elements, then a "By Jane Smith"
 *  byline near the top of the page. Only used when no metadata named anyone. */
function visibleAuthorNames(html: string): string[] {
  const names: string[] = [];
  const elementPatterns = [
    /<a\b[^>]*\brel=["'][^"']*\bauthor\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    /<(?:span|div|p|li|address)\b[^>]*\bitemprop=["']author["'][^>]*>([\s\S]*?)<\/(?:span|div|p|li|address)>/gi,
  ];
  for (const regex of elementPatterns) {
    for (const match of html.matchAll(regex)) {
      const text = stripHtml(match[1]);
      names.push(...splitAuthorNames(text).filter(looksLikePersonName));
    }
  }
  if (names.length) return uniqueNames(names);

  const text = stripHtml(html).slice(0, 8_000);
  // No `i` flag: under case-insensitive matching `\p{Lu}` also accepts
  // lowercase letters, which made "and" look like part of a name.
  const bylineRe =
    /\b(?:[Bb]y|[Aa]uthors?\s*[:-])\s+((?:\p{Lu}[\p{L}.'’-]+(?:\s+\p{Lu}[\p{L}.'’-]+){0,2})(?:\s*(?:,|&|;|\band\b)\s*\p{Lu}[\p{L}.'’-]+(?:\s+\p{Lu}[\p{L}.'’-]+){0,2})*)/gu;
  for (const match of text.matchAll(bylineRe)) {
    names.push(...splitAuthorNames(match[1]).filter(looksLikePersonName));
  }
  return uniqueNames(names);
}

async function verifyWebPage(url: string): Promise<AcademicWork | null> {
  // Block requests to private/internal networks (SSRF protection)
  if (isPrivateUrl(url)) return null;

  const res = await safeFetch(url);
  if (!res || !res.ok) return null;

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null;

  const html = await res.text();
  const jsonLd = jsonLdMetadata(html);

  const title =
    extractMetaContent(html, ['citation_title', 'dc.title', 'og:title', 'twitter:title'])
    ?? jsonLd.title
    ?? extractH1(html)
    ?? extractHtmlTitle(html);
  if (!title) return null;

  // Collect every author (citation_author repeats once per author). Prefer
  // structured metadata; fall back to JSON-LD and then visible-text bylines so
  // a multi-author web citation does not look mismatched just because the page
  // is missing one particular meta tag.
  let authors = uniqueNames([
    ...extractMetaContents(html, ['citation_author', 'dc.creator', 'article:author', 'author'])
      .flatMap((author) => splitAuthorNames(author)),
    ...jsonLd.authors,
  ]);
  if (!authors.length) authors = visibleAuthorNames(html);

  const dateStr = extractMetaContent(html, ['citation_publication_date', 'article:published_time', 'date', 'dc.date']);
  const year = yearOf(dateStr) ?? jsonLd.year;

  return {
    title,
    authors,
    year,
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
export async function verifyWebSource(ref: ParsedReference, isbnOnly = false): Promise<AcademicWork | null> {
  const isbn = extractIsbn(ref.raw);

  // ISBN found → try Open Library first, regardless of URL
  if (isbn) {
    const bookResult = await verifyBookByIsbn(isbn);
    if (bookResult) return bookResult;
  }
  if (isbnOnly) return null;

  if (!ref.url) {
    // No URL — try Open Library search for potential book references
    if (ref.title && (isbn || ref.title.length > 10)) {
      return verifyBookBySearch(ref.title, ref.authors[0]);
    }
    return null;
  }

  // The URL is attacker-controlled (from the uploaded document). Block private/
  // internal addresses and non-http(s) schemes before any source-specific
  // handler embeds or fetches it. verifyWebPage repeats this defensively.
  if (isPrivateUrl(ref.url)) return null;

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
