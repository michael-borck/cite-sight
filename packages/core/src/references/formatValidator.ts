import type { ParsedReference, CitationStyle, FormatIssue } from '../types.js';

// ============================================================
// Helpers
// ============================================================

/**
 * Returns true when the string looks like sentence case:
 * first word capitalised, remaining words lowercase (allows proper nouns by
 * checking that fewer than half of non-first words start with a capital).
 */
function isSentenceCase(s: string): boolean {
  if (!s) return true;
  const words = s.trim().split(/\s+/);
  if (words.length === 0) return true;

  // First word must start with uppercase
  if (!/^[A-Z]/.test(words[0])) return false;

  const nonFirst = words.slice(1);
  if (nonFirst.length === 0) return true;

  const uppercaseCount = nonFirst.filter((w) => /^[A-Z]/.test(w)).length;
  // Allow up to 30 % capitalised as proper nouns / acronyms
  return uppercaseCount / nonFirst.length <= 0.3;
}

/**
 * Returns true when every meaningful word (>3 chars) starts with a capital.
 * Used as proxy check for Title Case journals.
 */
function isTitleCase(s: string): boolean {
  if (!s) return false;
  const words = s.trim().split(/\s+/);
  const significant = words.filter((w) => w.length > 3);
  if (significant.length === 0) return true;
  return significant.every((w) => /^[A-Z]/.test(w));
}

function hasParenthesisYear(raw: string, year: number | null): boolean {
  if (!year) return false;
  return new RegExp(`\\(${year}\\)`).test(raw);
}

// ============================================================
// APA validation
// ============================================================

function validateApa(ref: ParsedReference): FormatIssue[] {
  const issues: FormatIssue[] = [];

  // 1. Year must be in parentheses after author block
  if (ref.year && !hasParenthesisYear(ref.raw, ref.year)) {
    issues.push({
      field: 'year',
      message: 'Year should be enclosed in parentheses after the author list',
      expected: `(${ref.year})`,
      actual: String(ref.year),
    });
  }

  // 2. Title should be in sentence case
  if (ref.title && !isSentenceCase(ref.title)) {
    issues.push({
      field: 'title',
      message: 'APA titles should be in sentence case (only first word and proper nouns capitalised)',
      actual: ref.title,
    });
  }

  // 3. Journal title should be in Title Case (proxy: at least half words capitalised)
  if (ref.journal && !isTitleCase(ref.journal)) {
    issues.push({
      field: 'journal',
      message: 'APA journal names should be in Title Case',
      actual: ref.journal,
    });
  }

  // 4. DOI should be present for journal articles
  if (ref.journal && !ref.doi && !ref.url) {
    issues.push({
      field: 'doi',
      message: 'APA journal articles should include a DOI or URL',
    });
  }

  // 5. Authors: each should be in "Last, F." format
  for (const author of ref.authors) {
    if (!/, [A-Z]\./.test(author)) {
      issues.push({
        field: 'authors',
        message: `APA author format should be "Last, F." — got: "${author}"`,
        actual: author,
      });
    }
  }

  return issues;
}

// ============================================================
// MLA validation
// ============================================================

function validateMla(ref: ParsedReference): FormatIssue[] {
  const issues: FormatIssue[] = [];

  // 1. Year should NOT be in parentheses directly after author (it goes at end)
  if (ref.year && hasParenthesisYear(ref.raw, ref.year)) {
    // Check if the parenthesised year appears early (within first 60 chars)
    const earlyParenIdx = ref.raw.indexOf(`(${ref.year})`);
    if (earlyParenIdx >= 0 && earlyParenIdx < 60) {
      issues.push({
        field: 'year',
        message: 'MLA format places the year near the end of the citation, not in parentheses after the author',
        actual: ref.raw.substring(earlyParenIdx, earlyParenIdx + 6),
      });
    }
  }

  // 2. Title should be in quotation marks for articles
  if (ref.title && !/[""]/.test(ref.raw) && !ref.raw.includes('"')) {
    issues.push({
      field: 'title',
      message: 'MLA article titles should be enclosed in quotation marks',
      actual: ref.title,
    });
  }

  // 3. Volume/issue should use "vol." and "no." labels
  if (ref.volume && !/vol\.\s*\d/i.test(ref.raw)) {
    issues.push({
      field: 'volume',
      message: 'MLA format requires "vol." before the volume number',
      expected: `vol. ${ref.volume}`,
      actual: ref.volume,
    });
  }

  if (ref.issue && !/no\.\s*\d/i.test(ref.raw)) {
    issues.push({
      field: 'issue',
      message: 'MLA format requires "no." before the issue number',
      expected: `no. ${ref.issue}`,
      actual: ref.issue,
    });
  }

  // 4. Pages should use "pp." prefix
  if (ref.pages && !/pp\.\s*\d/i.test(ref.raw)) {
    issues.push({
      field: 'pages',
      message: 'MLA format requires "pp." before page numbers',
      expected: `pp. ${ref.pages}`,
      actual: ref.pages,
    });
  }

  // 5. Author: first author should be "Last, First" (inverted)
  if (ref.authors.length > 0 && !ref.authors[0].includes(',')) {
    issues.push({
      field: 'authors',
      message: 'MLA first author should be in inverted order: "Last, First"',
      actual: ref.authors[0],
    });
  }

  return issues;
}

// ============================================================
// Chicago validation
// ============================================================

function validateChicago(ref: ParsedReference): FormatIssue[] {
  const issues: FormatIssue[] = [];

  // 1. Year should be in parentheses and positioned after volume/issue
  //    Pattern:  Volume, no. Issue (Year): pages
  if (ref.year) {
    const chicagoYearPattern = /,\s*no\.\s*\d+\s*\(\d{4}\):/i;
    if (ref.journal && !chicagoYearPattern.test(ref.raw)) {
      issues.push({
        field: 'year',
        message:
          'Chicago journal citations should place the year in parentheses after the issue number: "no. X (Year): pages"',
        expected: `no. ${ref.issue ?? 'X'} (${ref.year}): ${ref.pages ?? 'pages'}`,
      });
    }
  }

  // 2. Title should be in quotation marks (articles)
  if (ref.title && !/[""]/.test(ref.raw) && !ref.raw.includes('"')) {
    issues.push({
      field: 'title',
      message: 'Chicago article titles should be enclosed in quotation marks',
      actual: ref.title,
    });
  }

  // 3. Journal should be in italics (*Journal*)
  if (ref.journal && !ref.raw.includes('*') && !ref.raw.includes('_')) {
    issues.push({
      field: 'journal',
      message:
        'Chicago journal names should be italicised (represented as *Journal* in plain text)',
      actual: ref.journal,
    });
  }

  // 4. Author: first author in "Last, First" format
  if (ref.authors.length > 0 && !ref.authors[0].includes(',')) {
    issues.push({
      field: 'authors',
      message: 'Chicago first author should be in inverted order: "Last, First"',
      actual: ref.authors[0],
    });
  }

  // 5. Pages should follow colon after year: "(Year): pages"
  if (ref.pages && !new RegExp(`\\(${ref.year}\\):\\s*${ref.pages}`).test(ref.raw)) {
    issues.push({
      field: 'pages',
      message: 'Chicago page numbers should directly follow the year in parentheses with a colon: "(Year): pages"',
      actual: ref.pages,
    });
  }

  return issues;
}

// ============================================================
// Public API
// ============================================================

export function validateFormat(
  ref: ParsedReference,
  style: CitationStyle,
): FormatIssue[] {
  switch (style) {
    case 'apa':
      return validateApa(ref);
    case 'mla':
      return validateMla(ref);
    case 'chicago':
      return validateChicago(ref);
    default:
      // Unknown style — fall back to the reference's own detected style
      if (ref.detectedStyle !== 'unknown') {
        return validateFormat(ref, ref.detectedStyle);
      }
      return [];
  }
}
