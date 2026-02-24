import type { ParsedReference, InTextCitation, CitationStyle } from '../types.js';

// ============================================================
// Regex constants
// ============================================================

const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi;
const URL_RE = /https?:\/\/[^\s)]+/g;
const YEAR_STRICT_RE = /\b(19|20)\d{2}\b/;

// Headings that indicate the start of a reference/bibliography section
const REF_SECTION_RE =
  /^(references|bibliography|works\s+cited|literature\s+cited)\s*$/i;

// ============================================================
// Style detection helpers
// ============================================================

/**
 * Heuristically detect the citation style of a single raw reference string.
 */
function detectStyle(raw: string): CitationStyle {
  // APA: year in parentheses early in the string after author block
  // e.g. "Smith, J. (2020). Title..."
  if (/^[A-Z][^(]+\(\d{4}\)\./.test(raw)) return 'apa';

  // MLA: "Last, First. "Title." *Journal*, vol. X..."  — no year parenthesis after author
  if (/^[A-Z][^.]+\.\s+"/.test(raw)) return 'mla';

  // Chicago: "Last, First. "Title." *Journal* X, no. Y (Year): pages."
  if (/\bno\.\s*\d/.test(raw) && /\(\d{4}\):/.test(raw)) return 'chicago';

  return 'unknown';
}

// ============================================================
// Individual reference parser
// ============================================================

function parseReference(raw: string): ParsedReference {
  const trimmed = raw.trim();

  // -- DOI --
  const doiMatches = trimmed.match(DOI_RE);
  const doi = doiMatches ? doiMatches[0].replace(/[.)]+$/, '') : undefined;

  // -- URL --
  const urlMatches = trimmed.match(URL_RE);
  const url = urlMatches ? urlMatches[0].replace(/[.)]+$/, '') : undefined;

  // -- Year --
  const yearMatch = trimmed.match(YEAR_STRICT_RE);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

  // -- Detected style --
  const detectedStyle = detectStyle(trimmed);

  // -- Authors --
  const authors = extractAuthors(trimmed, detectedStyle);

  // -- Title --
  const title = extractTitle(trimmed, detectedStyle);

  // -- Journal / volume / issue / pages --
  const { journal, volume, issue, pages } = extractJournalDetails(
    trimmed,
    detectedStyle,
  );

  return {
    raw: trimmed,
    authors,
    title,
    year,
    journal,
    volume,
    issue,
    pages,
    doi,
    url,
    detectedStyle,
  };
}

// ============================================================
// Field-level extractors
// ============================================================

function extractAuthors(raw: string, _style: CitationStyle): string[] {
  // Strip leading number/bullet: "1. " or "• "
  const stripped = raw.replace(/^[\d]+[.)]\s*/, '').replace(/^[•\-]\s*/, '');

  // APA / MLA / Chicago: author block ends at the year "(YYYY)" or at the
  // first period that is followed by a space and a capital letter / quote.
  const yearIdx = stripped.search(/\((19|20)\d{2}\)/);
  const authorBlock =
    yearIdx > 0 ? stripped.slice(0, yearIdx) : stripped.split(/\.\s+[A-Z"]/)[0];

  if (!authorBlock || authorBlock.length > 300) return [];

  // Split by "; " or ", & " or " & " or " and "
  const parts = authorBlock
    .split(/;\s*|,\s*(?:&|and)\s*|\s+(?:&|and)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Each part may be "Last, F." or "Last, First" — keep as-is
  return parts.filter((p) => /[A-Za-z]/.test(p));
}

function extractTitle(raw: string, style: CitationStyle): string {
  const stripped = raw.replace(/^[\d]+[.)]\s*/, '');

  if (style === 'apa') {
    // APA: after "(Year). " comes the title, ending at ". " before journal
    const m = stripped.match(/\(\d{4}\)\.\s+(.+?)(?:\.\s+[A-Z*_]|$)/);
    if (m) return m[1].trim();
  }

  if (style === 'mla' || style === 'chicago') {
    // Title in quotes: "Title."
    const m = stripped.match(/"([^"]+)"/);
    if (m) return m[1].trim();
  }

  // Fallback: try to grab text between the year and the journal-ish segment
  const yearM = stripped.match(/\b(19|20)\d{2}\b/);
  if (yearM && yearM.index !== undefined) {
    const afterYear = stripped.slice(yearM.index + 4).replace(/^[).:\s]+/, '');
    const titleEnd = afterYear.search(/\.\s+[A-Z*_]/);
    if (titleEnd > 0) return afterYear.slice(0, titleEnd).trim();
    return afterYear.split(/\.\s*/)[0].trim();
  }

  return '';
}

interface JournalDetails {
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
}

function extractJournalDetails(
  raw: string,
  style: CitationStyle,
): JournalDetails {
  const result: JournalDetails = {};

  // Volume / issue pattern: "12(3)" or "vol. 12, no. 3"
  const volIssueM =
    raw.match(/\b(\d+)\((\d+)\)/) ||
    raw.match(/vol\.\s*(\d+),\s*no\.\s*(\d+)/i);
  if (volIssueM) {
    result.volume = volIssueM[1];
    result.issue = volIssueM[2];
  } else {
    const volOnlyM = raw.match(/\b(\d+),\s*\d+[-–]\d+/);
    if (volOnlyM) result.volume = volOnlyM[1];
  }

  // Pages: "pp. X-Y" or "X–Y" or "X-Y" near end
  const pagesM =
    raw.match(/pp\.\s*([\d]+[-–][\d]+)/i) ||
    raw.match(/,\s*([\d]+[-–][\d]+)[.,\s]/) ||
    raw.match(/:\s*([\d]+[-–][\d]+)/);
  if (pagesM) result.pages = pagesM[1];

  // Journal: italic markers (*Journal*) or just the segment after title
  const italicM = raw.match(/\*([^*]+)\*/);
  if (italicM) {
    result.journal = italicM[1].trim();
  } else if (style === 'apa') {
    // After title sentence (ends with ". "), before volume
    const titleEnd = raw.lastIndexOf('). ');
    if (titleEnd >= 0) {
      const afterTitle = raw.slice(titleEnd + 3);
      const journalEnd = afterTitle.search(/,\s*\d/);
      if (journalEnd > 0) result.journal = afterTitle.slice(0, journalEnd).trim();
    }
  }

  return result;
}

// ============================================================
// Reference section splitter
// ============================================================

/**
 * Locate the reference/bibliography section in the document and return
 * its raw text. Returns null when no section heading is found.
 */
function findReferenceSection(text: string): string | null {
  const lines = text.split('\n');
  let startIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (REF_SECTION_RE.test(lines[i].trim())) {
      startIdx = i + 1;
      break;
    }
  }

  if (startIdx < 0) return null;
  return lines.slice(startIdx).join('\n');
}

/**
 * Split a reference-section block into individual reference strings.
 * Handles numbered lists ("1. ", "1) "), bulleted lists, and blank-line
 * separated blocks.
 */
function splitIntoReferences(block: string): string[] {
  const lines = block.split('\n');
  const refs: string[] = [];
  let current = '';

  const isNewRefStart = (line: string): boolean => {
    // Numbered: "1. " or "1) "
    if (/^\s*\d+[.)]\s+/.test(line)) return true;
    // Bullet
    if (/^\s*[•\-]\s+/.test(line)) return true;
    // Blank line followed by author-like content (capital letter start)
    if (line.trim() === '' && current.trim().length > 0) return true;
    return false;
  };

  for (const line of lines) {
    if (isNewRefStart(line)) {
      if (current.trim()) refs.push(current.trim());
      current = line.trim() === '' ? '' : line;
    } else {
      // Continuation line — concatenate
      if (line.trim() === '') {
        if (current.trim()) {
          refs.push(current.trim());
          current = '';
        }
      } else {
        current = current ? `${current} ${line.trim()}` : line.trim();
      }
    }
  }

  if (current.trim()) refs.push(current.trim());

  return refs.filter((r) => r.length > 10);
}

// ============================================================
// In-text citation extraction
// ============================================================

/**
 * APA parenthetical: (Smith, 2020), (Smith & Jones, 2020), (Smith et al., 2020)
 * APA narrative:     Smith (2020)
 * MLA:               (Smith 45), (Smith 45-50)
 * Chicago footnote:  [1], ¹, ²  (superscript via Unicode)
 */
function extractInTextCitations(text: string): InTextCitation[] {
  const results: InTextCitation[] = [];

  // --- APA parenthetical ---
  const apaParenRe =
    /\(([A-Z][a-zA-Z\-']+(?:\s*(?:&|and)\s*[A-Z][a-zA-Z\-']+|\s+et\s+al\.)?),\s*((?:19|20)\d{2}(?:,\s*(?:19|20)\d{2})*(?:;\s*[A-Z][^;)]+,\s*(?:19|20)\d{2})*)\)/g;

  for (const m of text.matchAll(apaParenRe)) {
    const authorPart = m[1].trim();
    const yearPart = m[2].trim();
    const year = parseInt(yearPart.split(',')[0], 10);
    const authors = authorPart
      .split(/\s*(?:&|and)\s*/)
      .map((a) => a.trim())
      .filter(Boolean);
    results.push({
      raw: m[0],
      authors,
      year,
      position: m.index ?? 0,
    });
  }

  // --- APA narrative: Smith (2020) ---
  const apaNarrativeRe =
    /\b([A-Z][a-zA-Z\-']+(?:\s+(?:&|and)\s+[A-Z][a-zA-Z\-']+|\s+et\s+al\.)?)\s+\(((?:19|20)\d{2})\)/g;

  for (const m of text.matchAll(apaNarrativeRe)) {
    const authors = m[1]
      .split(/\s*(?:&|and)\s*/)
      .map((a) => a.trim())
      .filter(Boolean);
    const year = parseInt(m[2], 10);
    results.push({
      raw: m[0],
      authors,
      year,
      position: m.index ?? 0,
    });
  }

  // --- MLA: (Smith 45) or (Smith 45-50) ---
  const mlaRe = /\(([A-Z][a-zA-Z\-']+)\s+(\d+(?:-\d+)?)\)/g;
  for (const m of text.matchAll(mlaRe)) {
    results.push({
      raw: m[0],
      authors: [m[1]],
      year: null,
      pageNumbers: m[2],
      position: m.index ?? 0,
    });
  }

  // --- Chicago footnote markers: [1] or Unicode superscripts ¹²³ ---
  const chicagoRe = /\[(\d+)\]|([¹²³⁴⁵⁶⁷⁸⁹⁰]+)/g;
  for (const m of text.matchAll(chicagoRe)) {
    results.push({
      raw: m[0],
      authors: [],
      year: null,
      position: m.index ?? 0,
    });
  }

  // Deduplicate by position (APA narrative can double-match parenthetical)
  const seen = new Set<number>();
  return results.filter((r) => {
    if (seen.has(r.position)) return false;
    seen.add(r.position);
    return true;
  });
}

// ============================================================
// Public API
// ============================================================

export function extractReferences(text: string): {
  references: ParsedReference[];
  inTextCitations: InTextCitation[];
} {
  const section = findReferenceSection(text);
  const rawRefs = section ? splitIntoReferences(section) : [];
  const references = rawRefs.map(parseReference);
  const inTextCitations = extractInTextCitations(text);

  return { references, inTextCitations };
}
